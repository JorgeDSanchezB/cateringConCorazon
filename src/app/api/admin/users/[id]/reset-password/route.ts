import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, requireUser } from "@/lib/auth";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";
import { generateTempPassword } from "@/lib/services/users";

/**
 * POST /api/admin/users/:id/reset-password  (ADMIN)
 * Genera contraseña temporal (devuelta UNA sola vez), fuerza cambio en el
 * próximo login y deja registro de auditoría (PasswordReset).
 */
const resetSchema = z.object({
  reason: z.string().trim().min(3, "Indique el motivo del reset").max(200),
});

export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const session = await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const body = await parseBody(req, resetSchema);

  const target = await db.user.findUnique({ where: { id } });
  if (!target) throw new NotFoundError("Usuario");
  if (!target.isActive) {
    throw new ValidationError([{ field: "isActive", message: "El usuario está desactivado; actívelo primero." }]);
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await db.$transaction([
    db.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } }),
    db.passwordReset.create({ data: { userId: id, reason: `${body.reason} (por ${session.email})` } }),
  ]);

  return jsonOk({ ok: true, tempPassword });
});
