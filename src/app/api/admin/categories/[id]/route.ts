import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";

/**
 * PATCH  /api/admin/categories/:id  (ADMIN)
 * DELETE /api/admin/categories/:id  (ADMIN) — bloqueado si tiene productos.
 */
const categoryPatchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, "Slug inválido").optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const body = await parseBody(req, categoryPatchSchema);
  const existing = await db.category.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Categoría");
  const updated = await db.category.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.slug !== undefined ? { slug: body.slug } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  });
  return jsonOk(updated);
});

export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const productsCount = await db.product.count({ where: { categoryId: id } });
  if (productsCount > 0) {
    throw new ConflictError(
      "CATEGORY_HAS_PRODUCTS",
      `La categoría tiene ${productsCount} producto(s) asignado(s). Reasígnelos antes de eliminarla.`,
    );
  }
  const existing = await db.category.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Categoría");
  await db.category.delete({ where: { id } });
  return jsonOk({ ok: true });
});
