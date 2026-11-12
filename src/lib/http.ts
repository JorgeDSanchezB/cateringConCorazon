import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { config } from "./config";
import { AppError, ValidationError } from "./errors";

// ───────────────────────────── Cursor pagination ─────────────────────────────

export interface Cursor {
  /** Primer componente de ordenación (createdAt ISO / sortOrder entero). */
  v1: string;
  /** Desempate estable: id. */
  v2: string;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | null): Cursor | null {
  if (raw === null || raw === "") return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed === "object" && parsed !== null &&
      "v1" in parsed && "v2" in parsed &&
      typeof (parsed as Record<string, unknown>).v1 === "string" &&
      typeof (parsed as Record<string, unknown>).v2 === "string"
    ) {
      return parsed as Cursor;
    }
  } catch {
    // cursor corrupto → dato inválido explícito (no se ignora en silencio)
  }
  throw ValidationError.field("cursor", "El cursor proporcionado no es válido.", "CURSOR_MALFORMED");
}

export interface Pagination {
  limit: number;
  cursor: Cursor | null;
}

/**
 * Lee ?limit= y ?cursor= de cualquier listado.
 * - limit ausente → default; inválido → 422; mayor al máximo → 422 informando el máximo.
 */
export function getPagination(req: NextRequest): Pagination {
  const rawLimit = req.nextUrl.searchParams.get("limit");
  let limit = config.DEFAULT_PAGE_LIMIT;
  if (rawLimit !== null) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < 1) {
      throw ValidationError.field("limit", "limit debe ser un entero positivo.", "LIMIT_INVALID");
    }
    if (n > config.MAX_PAGE_LIMIT) {
      throw ValidationError.field(
        "limit",
        `limit excede el máximo permitido (${config.MAX_PAGE_LIMIT}).`,
        "LIMIT_TOO_LARGE",
      );
    }
    limit = n;
  }
  return { limit, cursor: decodeCursor(req.nextUrl.searchParams.get("cursor")) };
}

/**
 * Cláusula Prisma para paginación por cursor DESCENDENTE (nuevo → antiguo)
 * sobre un campo de fecha + id como desempate.
 * Equivale a SQL: (fecha < c1) OR (fecha = c1 AND id < c2).
 */
export function descCursorClause(
  field: "createdAt" | "issuedAt" | "receivedAt" | "spentAt" | "eventDate" | "updatedAt",
  cursor: Cursor,
): Record<string, unknown> {
  const d1 = new Date(cursor.v1);
  return {
    OR: [
      { [field]: { lt: d1 } },
      { AND: [{ [field]: d1 }, { id: { lt: cursor.v2 } }] },
    ],
  };
}

/**
 * Cláusula Prisma para paginación por cursor ASCENDENTE (sortOrder, id).
 * Equivale a SQL: (sortOrder > s) OR (sortOrder = s AND id > id2).
 */
export function ascCursorClause(cursor: Cursor): Record<string, unknown> {
  const s = Number(cursor.v1);
  return {
    OR: [
      { sortOrder: { gt: s } },
      { AND: [{ sortOrder: s }, { id: { gt: cursor.v2 } }] },
    ],
  };
}

/**
 * Envoltorio estándar de listado: filas leídas con take=limit+1.
 * Si llegó más de `limit`, calcula nextCursor desde la fila límite.
 */
export function listEnvelope<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => Cursor,
): { items: T[]; nextCursor: string | null } {
  if (rows.length > limit) {
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return { items, nextCursor: encodeCursor(cursorOf(last)) };
  }
  return { items: rows, nextCursor: null };
}

// ───────────────────────────── Body parsing ─────────────────────────────

/**
 * Lee y valida el cuerpo JSON con un esquema Zod.
 * Distingue: cuerpo vacío / JSON malformado / datos inválidos (422 por campo).
 */
export async function parseBody<S extends z.ZodType>(
  req: NextRequest,
  schema: S,
): Promise<z.output<S>> {
  let text: string;
  try {
    text = await req.text();
  } catch {
    throw new ValidationError([], "No se pudo leer el cuerpo de la solicitud.");
  }
  if (text.trim() === "") {
    throw new ValidationError([], "El cuerpo de la solicitud está vacío.");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ValidationError([], "El cuerpo no es JSON válido.");
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => ({
        field: i.path.join(".") || "(raíz)",
        message: i.message,
      })),
    );
  }
  return result.data;
}

export function jsonOk(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

// ───────────────────────────── Problem Details (RFC 7807) ─────────────────────────────

const PRISMA_CODES: Record<string, { status: number; title: string; detail: string }> = {
  P2002: {
    status: 409,
    title: "Registro duplicado",
    detail: "Ya existe un registro con ese valor único.",
  },
  P2003: {
    status: 422,
    title: "Referencia inexistente",
    detail: "Uno de los valores referenciados no existe.",
  },
  P2025: {
    status: 404,
    title: "No encontrado",
    detail: "El registro no existe.",
  },
};

/**
 * Convierte cualquier error en una respuesta problem+json, clasificándolo:
 * AppError → su estado; Prisma → códigos conocidos; resto → 500 genérico con
 * log crítico (nunca se filtran trazas al cliente).
 */
export function problemResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    if (err.logLevel === "error") {
      console.error(`[${err.type.toUpperCase()}] ${err.detail}`);
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/problem+json",
    };
    if (err.retryAfterSeconds) {
      headers["Retry-After"] = String(Math.ceil(err.retryAfterSeconds));
    }
    return NextResponse.json(err.toProblem(), { status: err.status, headers });
  }

  const maybe = err as { code?: string; message?: string; stack?: string };
  if (maybe && typeof maybe.code === "string" && maybe.code in PRISMA_CODES) {
    const known = PRISMA_CODES[maybe.code];
    console.warn(`[DB] ${maybe.code}: ${maybe.message ?? ""}`);
    return NextResponse.json(
      { type: "conflict", title: known.title, status: known.status, detail: known.detail, code: maybe.code },
      { status: known.status, headers: { "Content-Type": "application/problem+json" } },
    );
  }

  // Fallo crítico: traza al log del servidor, mensaje genérico al cliente.
  console.error("[CRITICAL] Error no controlado en handler:");
  console.error(err);
  return NextResponse.json(
    {
      type: "internal",
      title: "Error interno",
      status: 500,
      detail: "Ocurrió un error inesperado. El equipo fue notificado; intente de nuevo más tarde.",
      code: "INTERNAL",
    },
    { status: 500, headers: { "Content-Type": "application/problem+json" } },
  );
}

/**
 * Cláusula Prisma para paginación por cursor ASCENDENTE sobre fecha + id
 * (p. ej. próximos eventos ordenados por fecha).
 */
export function ascDateCursorClause(
  field: "eventDate" | "createdAt" | "spentAt" | "issuedAt",
  cursor: Cursor,
): Record<string, unknown> {
  const d1 = new Date(cursor.v1);
  return {
    OR: [
      { [field]: { gt: d1 } },
      { AND: [{ [field]: d1 }, { id: { gt: cursor.v2 } }] },
    ],
  };
}

/**
 * Envoltorio estándar de handler de ruta: captura cualquier error y lo
 * convierte en problem+json clasificado.
 */
export function apiHandler<C = unknown>(
  fn: (req: NextRequest, ctx: C) => Promise<NextResponse>,
) {
  return async (req: NextRequest, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return problemResponse(err);
    }
  };
}
