import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { config } from "./config";
import { db } from "./db";
import { ConflictError, UnauthorizedError, ForbiddenError } from "./errors";

export type Role = "ADMIN" | "STAFF" | "CONTADOR";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  STAFF: "Staff de evento",
  CONTADOR: "Contador",
};

export const SESSION_COOKIE = "ccc_session";

let cachedSecret: { secret: Uint8Array; isFallback: boolean } | null = null;

/**
 * Secreto de firma de sesiones.
 * Si AUTH_SECRET no está definida se deriva una clave de desarrollo ESTABLE
 * (las sesiones sobreviven recargas de dev) y se registra un error crítico
 * de configuración una única vez. En producción AUTH_SECRET es obligatoria
 * (ver .env.example y docs/runbook.md).
 */
function sessionSecret(): { secret: Uint8Array; isFallback: boolean } {
  if (cachedSecret) return cachedSecret;
  if (config.AUTH_SECRET) {
    cachedSecret = { secret: new TextEncoder().encode(config.AUTH_SECRET), isFallback: false };
    return cachedSecret;
  }
  const derived = createHash("sha256")
    .update(`ccc-dev-fallback:${config.DATABASE_URL}`)
    .digest("hex");
  console.error(
    "[CONFIG] AUTH_SECRET no está definida: se usa un secreto de desarrollo. " +
      "Defínala en producción (ver .env.example).",
  );
  cachedSecret = { secret: new TextEncoder().encode(derived), isFallback: true };
  return cachedSecret;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(userId: string): Promise<string> {
  const { secret } = sessionSecret();
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${config.SESSION_TTL_HOURS}h`)
    .sign(secret);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
}

/** Lee la cookie de sesión y devuelve el usuario activo, o null. */
export async function readSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { secret } = sessionSecret();
    const { payload } = await jwtVerify(token, secret);
    const userId = payload.sub;
    if (typeof userId !== "string") return null;
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
    };
  } catch {
    // Token inválido/expirado → sin sesión (401 lo comunicará requireUser).
    return null;
  }
}

/**
 * Guarda la cookie httpOnly de sesión en la respuesta.
 */
export function sessionCookieSet(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: config.SESSION_TTL_HOURS * 3600,
    secure: process.env.NODE_ENV === "production",
  });
}

export function sessionCookieClear(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/**
 * Autorización por rol para handlers de API.
 * - Sin sesión → 401.
 * - Rol insuficiente → 403 (sin detalles internos).
 * - mustChangePassword → 409 con code MUST_CHANGE_PASSWORD salvo que el
 *   handler lo permita explícitamente (pantalla de cambio forzado).
 */
export async function requireUser(
  req: NextRequest,
  opts: { roles?: Role[]; allowPendingPassword?: boolean } = {},
): Promise<SessionUser> {
  const user = await readSessionUser(req);
  if (!user) throw new UnauthorizedError();
  if (user.mustChangePassword && !opts.allowPendingPassword) {
    throw new ConflictError(
      "MUST_CHANGE_PASSWORD",
      "Debe cambiar su contraseña antes de continuar.",
    );
  }
  if (opts.roles && opts.roles.length > 0 && !opts.roles.includes(user.role)) {
    throw new ForbiddenError();
  }
  return user;
}
