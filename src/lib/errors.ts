/**
 * Taxonomía de errores del sistema (Regla 4: Tolerancia a Fallos).
 *
 * Cada clase corresponde a una categoría de fallo distinta y viaja hacia el
 * cliente como RFC 7807 (application/problem+json) sin filtrar detalles
 * internos en errores 5xx.
 *
 * Categorías:
 * - Campo ausente / nulo / dato inválido → ValidationError (422) con detalle por campo.
 * - No encontrado → NotFoundError (404).
 * - Conflicto de negocio (regla incumplida) → ConflictError (409) con `code`.
 * - Autorización → UnauthorizedError (401) / ForbiddenError (403), sin detalles internos.
 * - Límite de uso → RateLimitError (429).
 * - Configuración del servidor → ConfigError (500, type "config"), log crítico.
 * - Fallo crítico → CriticalError (500, type "internal"), log con traza, mensaje genérico.
 */
export interface ProblemField {
  field: string;
  message: string;
  code?: string;
}

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code?: string;
  errors?: ProblemField[];
  retryAfterSeconds?: number;
}

export class AppError extends Error {
  public readonly status: number;
  public readonly type: string;
  public readonly title: string;
  public readonly detail: string;
  public readonly code?: string;
  public readonly errors?: ProblemField[];
  public readonly retryAfterSeconds?: number;
  public readonly logLevel: "warn" | "error" | "silent";

  constructor(init: {
    status: number;
    type: string;
    title: string;
    detail: string;
    code?: string;
    errors?: ProblemField[];
    retryAfterSeconds?: number;
    logLevel?: "warn" | "error" | "silent";
  }) {
    super(init.detail);
    this.name = new.target.name;
    this.status = init.status;
    this.type = init.type;
    this.title = init.title;
    this.detail = init.detail;
    this.code = init.code;
    this.errors = init.errors;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.logLevel = init.logLevel ?? "warn";
  }

  toProblem(): ProblemBody {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
      code: this.code,
      errors: this.errors,
      retryAfterSeconds: this.retryAfterSeconds,
    };
  }
}

/** Dato inválido o campo ausente/nulo donde se requería valor. 422. */
export class ValidationError extends AppError {
  constructor(errors: ProblemField[], detail = "Datos inválidos.") {
    super({
      status: 422,
      type: "validation",
      title: "Datos inválidos",
      detail,
      errors,
      logLevel: "silent",
    });
  }

  /** Atajo: un único campo inválido. */
  static field(field: string, message: string, code?: string): ValidationError {
    return new ValidationError([{ field, message, code }]);
  }
}

/** Recurso no encontrado. 404. */
export class NotFoundError extends AppError {
  constructor(resource = "Recurso") {
    super({ status: 404, type: "not-found", title: "No encontrado", detail: `${resource} no existe.` });
  }
}

/** Regla de negocio incumplida (mínimo, stock, transición, dependencias). 409. */
export class ConflictError extends AppError {
  constructor(code: string, detail: string, errors?: ProblemField[]) {
    super({ status: 409, type: "conflict", title: "Conflicto de negocio", detail, code, errors });
  }
}

/** No autenticado. 401 — sin filtrar detalles internos. */
export class UnauthorizedError extends AppError {
  constructor(detail = "Debe iniciar sesión.") {
    super({ status: 401, type: "unauthorized", title: "No autenticado", detail });
  }
}

/** Autenticado pero sin permiso de rol. 403. */
export class ForbiddenError extends AppError {
  constructor(detail = "No tiene permisos para esta acción.") {
    super({ status: 403, type: "forbidden", title: "Sin permisos", detail });
  }
}

/** Límite de tasa superado. 429. */
export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number, scope: string) {
    super({
      status: 429,
      type: "rate-limit",
      title: "Demasiadas solicitudes",
      detail: `Demasiadas solicitudes (${scope}). Intente de nuevo en ${retryAfterSeconds} segundos.`,
      retryAfterSeconds,
      code: "RATE_LIMITED",
    });
  }
}

/** Configuración del servidor inválida o faltante. 500 + log crítico. */
export class ConfigError extends AppError {
  constructor(detail: string) {
    super({ status: 500, type: "config", title: "Error de configuración", detail, code: "CONFIG", logLevel: "error" });
  }
}

/** Fallo crítico inesperado. 500 + log con traza + mensaje genérico al cliente. */
export class CriticalError extends AppError {
  constructor(detail = "Ocurrió un error inesperado. Intente de nuevo más tarde.") {
    super({ status: 500, type: "internal", title: "Error interno", detail, code: "INTERNAL", logLevel: "error" });
  }
}

/** Módulo desactivado por FeatureFlag (p. ej. facturación apagada). 409. */
export class ModuleDisabledError extends AppError {
  constructor(flag: string, module: string) {
    super({
      status: 409,
      type: "module-disabled",
      title: "Módulo desactivado",
      detail: `El módulo "${module}" está desactivado (flag ${flag}). Actívelo en Administración → Flags.`,
      code: `FLAG_${flag}`,
    });
  }
}
