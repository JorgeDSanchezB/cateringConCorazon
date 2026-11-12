import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { createSessionToken, sessionCookieSet, verifyPassword } from "@/lib/auth";
import { ForbiddenError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { parseBody, apiHandler } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/auth/login
 * Inicia sesión con credenciales (cookie httpOnly de sesión JWT).
 * Rate limit por IP (seguridad técnica). 401 genérico (sin enumerar usuarios).
 */
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email inválido"),
  password: z.string().min(1, "La contraseña es obligatoria").max(128),
});

export const POST = apiHandler(async (req: NextRequest) => {
  rateLimit("login", clientIp(req), config.LOGIN_MAX_PER_MINUTE);
  const body = await parseBody(req, loginSchema);

  const user = await db.user.findUnique({ where: { email: body.email } });
  if (!user) throw new UnauthorizedError("Credenciales inválidas.");
  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) throw new UnauthorizedError("Credenciales inválidas.");
  if (!user.isActive) {
    throw new ForbiddenError("El usuario está desactivado. Contacte al administrador.");
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const token = await createSessionToken(user.id);
  const response = NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  });
  sessionCookieSet(response, token);
  return response;
});
