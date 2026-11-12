import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";

/**
 * PATCH /api/admin/users/:id  (ADMIN)
 * Edita nombre/email/rol, activa/desactiva y fuerza cambio de contraseña.
 * Protecciones: un ADMIN no puede degradarse ni desactivarse a sí mismo
 * (evita quedarse sin acceso al panel).
 */
const userPatchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().toLowerCase().email("Email inválido").optional(),
  role: z.enum(["ADMIN", "STAFF", "CONTADOR"]).optional(),
  isActive: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
});

export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const session = await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const body = await parseBody(req, userPatchSchema);

  const target = await db.user.findUnique({ where: { id } });
  if (!target) throw new NotFoundError("Usuario");

  if (id === session.id) {
    if (body.role !== undefined && body.role !== "ADMIN") {
      throw new ConflictError("SELF_DEMOTE", "No puede quitarse su propio rol de administrador.");
    }
    if (body.isActive === false) {
      throw new ConflictError("SELF_DISABLE", "No puede desactivar su propio usuario.");
    }
  }

  if (body.email && body.email !== target.email) {
    const dup = await db.user.findUnique({ where: { email: body.email } });
    if (dup) throw new ValidationError([{ field: "email", message: "Ya existe un usuario con ese email." }]);
  }

  const updated = await db.user.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.mustChangePassword !== undefined ? { mustChangePassword: body.mustChangePassword } : {}),
    },
    select: {
      id: true, email: true, name: true, role: true, isActive: true,
      mustChangePassword: true, lastLoginAt: true, createdAt: true,
    },
  });
  return jsonOk(updated);
});
