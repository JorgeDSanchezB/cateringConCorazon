"use client";

/**
 * Cliente HTTP del frontend (rutas relativas, nunca puertos absolutos).
 * - Reintento con backoff para errores TEMPORALES (solo idempotentes GET).
 * - Errores RFC 7807 → ApiError con `problem` estructurado (distinción
 *   completa: campo inválido / autorización / rate-limit / config / interno).
 */

export interface ProblemField {
  field: string;
  message: string;
  code?: string;
}

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  code?: string;
  errors?: ProblemField[];
  retryAfterSeconds?: number;
}

export class ApiError extends Error {
  public readonly problem: Problem;
  constructor(problem: Problem) {
    super(problem.detail || problem.title);
    this.name = "ApiError";
    this.problem = problem;
  }
  /** Mensaje del primer error de campo dado (para formularios). */
  fieldMessage(field: string): string | null {
    return this.problem.errors?.find((e) => e.field === field)?.message ?? null;
  }
}

const GENERIC_PROBLEM: Problem = {
  type: "network",
  title: "Error de conexión",
  status: 0,
  detail: "No se pudo conectar con el servidor. Reintentando puede resolverlo.",
};

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError({ ...GENERIC_PROBLEM });
  }
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    const problem: Problem =
      body && typeof body === "object" && "status" in body
        ? (body as Problem)
        : {
            type: "internal",
            title: `Error ${response.status}`,
            status: response.status,
            detail: "Respuesta no estructurada del servidor.",
          };
    throw new ApiError(problem);
  }
  return body as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Reintentos automáticos (GET por defecto): 2 intentos con backoff. */
  retry?: boolean;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const isFormData = typeof FormData !== "undefined" && opts.body instanceof FormData;
  const init: RequestInit = {
    method,
    headers:
      opts.body !== undefined && !isFormData
        ? { "Content-Type": "application/json" }
        : undefined,
    body:
      opts.body === undefined
        ? undefined
        : isFormData
          ? (opts.body as FormData)
          : JSON.stringify(opts.body),
    credentials: "same-origin",
  };
  const canRetry = opts.retry ?? method === "GET";
  if (!canRetry) return request<T>(path, init);
  // Error temporal → reintento con backoff (300ms, 900ms).
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await request<T>(path, init);
    } catch (err) {
      const isNetwork = err instanceof ApiError && err.problem.status === 0;
      const is5xx = err instanceof ApiError && err.problem.status >= 500;
      if ((isNetwork || is5xx) && attempt < 2) {
        await sleep(300 * Math.pow(3, attempt));
        continue;
      }
      throw err;
    }
  }
  throw new ApiError({ ...GENERIC_PROBLEM });
}

/** Mensaje legible de cualquier error lanzado por api(). */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const fieldMsgs = err.problem.errors?.map((e) => `${e.field}: ${e.message}`).join(" · ");
    return fieldMsgs ? `${err.problem.detail} (${fieldMsgs})` : err.problem.detail;
  }
  if (err instanceof Error) return err.message;
  return "Error inesperado.";
}
