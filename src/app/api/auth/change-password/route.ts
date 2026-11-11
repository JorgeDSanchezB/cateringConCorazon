import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { jsonOk, apiHandler, parseBody } from "@/lib/http";

/**
 * POST /api/auth/change-password
 * Cambio de contraseña (propio). Limpia mustChangePassword.
 * Distingue: contraseña actual incorrecta (422) vs sesión inválida (401).
 */
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "La contraseña actual es obligatoria").max(128),
    newPassword: z
      .string()
      .min(10, "La nueva contraseña debe tener al menos 10 caracteres")
      .max(128)
      .regex(/[A-Za-z]/, "Debe incluir letras")
      .regex(/\d/, "Debe incluir al menos un número"),
  });

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireUser(req, { allowPendingPassword: true });
  const body = await parseBody(req, changePasswordSchema);

  const user = await db.user.findUnique({ where: { id: session.id } });
  if (!user) throw new ValidationError([{ field: "currentPassword", message: "Usuario no encontrado." }]);
  const ok = await verifyPassword(body.currentPassword, user.passwordHash);
  if (!ok) {
    throw new ValidationError([{ field: "currentPassword", message: "La contraseña actual es incorrecta." }]);
  }
  const passwordHash = await hashPassword(body.newPassword);
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });
  return jsonOk({ ok: true });
});
