import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";

/**
 * PATCH  /api/admin/variants/:id  (ADMIN)
 * DELETE /api/admin/variants/:id  (ADMIN) — borrado físico (los pedidos
 * guardan snapshots de nombre/precio; la variante no es dato histórico).
 */
const variantPatchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  priceDelta: z.number().int().min(-100_000).max(100_000).optional(),
  sku: z.string().trim().max(40).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const body = await parseBody(req, variantPatchSchema);
  const existing = await db.productVariant.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Variante");
  const updated = await db.productVariant.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.priceDelta !== undefined ? { priceDelta: body.priceDelta } : {}),
      ...(body.sku !== undefined ? { sku: body.sku } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  });
  return jsonOk(updated);
});

export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const existing = await db.productVariant.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Variante");
  await db.productVariant.delete({ where: { id } });
  return jsonOk({ ok: true });
});
