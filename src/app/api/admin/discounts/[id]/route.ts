import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";

/**
 * PATCH  /api/admin/discounts/:id  (ADMIN) — todas las opciones editables.
 * DELETE /api/admin/discounts/:id  (ADMIN) — los pedidos guardan snapshot
 *         del descuento aplicado (discountAmount); el FK queda en null.
 */
const discountPatchSchema = z
  .object({
    code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9-]+$/).optional(),
    type: z.enum(["PERCENT", "FIXED_AMOUNT"]).optional(),
    value: z.number().int().min(1).optional(),
    minSubtotal: z.number().int().min(0).optional(),
    maxUses: z.number().int().min(1).nullable().optional(),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => (v.type === "PERCENT" && v.value !== undefined ? v.value <= 100 : true), {
    message: "El porcentaje no puede superar 100.",
    path: ["value"],
  });

export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const body = await parseBody(req, discountPatchSchema);
  const existing = await db.discountCode.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Código de descuento");

  const type = body.type ?? existing.type;
  const value = body.value ?? existing.value;
  if (type === "PERCENT" && value > 100) {
    throw new ValidationError([
      { field: "value", message: "El porcentaje no puede superar 100." },
    ]);
  }

  const updated = await db.discountCode.update({
    where: { id },
    data: {
      ...(body.code !== undefined ? { code: body.code.toUpperCase() } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.value !== undefined ? { value: body.value } : {}),
      ...(body.minSubtotal !== undefined ? { minSubtotal: body.minSubtotal } : {}),
      ...(body.maxUses !== undefined ? { maxUses: body.maxUses } : {}),
      ...(body.startsAt !== undefined ? { startsAt: body.startsAt ? new Date(body.startsAt) : null } : {}),
      ...(body.endsAt !== undefined ? { endsAt: body.endsAt ? new Date(body.endsAt) : null } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  });
  return jsonOk(updated);
});

export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const existing = await db.discountCode.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Código de descuento");
  await db.discountCode.delete({ where: { id } });
  return jsonOk({ ok: true });
});
