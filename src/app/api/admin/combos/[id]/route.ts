import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";

/**
 * GET    /api/admin/combos/:id  (ADMIN)
 * PATCH  /api/admin/combos/:id  (ADMIN) — reemplazo completo de items
 * DELETE /api/admin/combos/:id  (ADMIN) — los pedidos guardan snapshots
 *         (comboName) y OrderItem.comboId se pone a null (SetNull).
 */
const comboItemSchema = z.object({
  productId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(50),
});

const comboPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().max(500).nullable().optional(),
    imageUrl: z.string().max(300).nullable().optional(),
    pricingMode: z.enum(["FIXED_PRICE", "PERCENT_DISCOUNT"]).optional(),
    fixedPrice: z.number().int().min(1).max(10_000_000).nullable().optional(),
    discountPercent: z.number().int().min(1).max(99).nullable().optional(),
    isVisible: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    items: z.array(comboItemSchema).min(1).max(12).optional(),
  })
  .refine(
    (v) => (v.pricingMode === "FIXED_PRICE" && v.fixedPrice !== undefined ? v.fixedPrice != null : true),
    { message: "Precio fijo obligatorio en modo FIXED_PRICE.", path: ["fixedPrice"] },
  )
  .refine(
    (v) => (v.pricingMode === "PERCENT_DISCOUNT" && v.discountPercent !== undefined ? v.discountPercent != null : true),
    { message: "Porcentaje obligatorio en modo PERCENT_DISCOUNT.", path: ["discountPercent"] },
  );

export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const combo = await db.combo.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: { id: true, name: true, basePrice: true } } } },
    },
  });
  if (!combo) throw new NotFoundError("Combo");
  return jsonOk(combo);
});

export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const body = await parseBody(req, comboPatchSchema);
  const existing = await db.combo.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Combo");

  if (body.items) {
    const ids = body.items.map((i) => i.productId);
    const products = await db.product.findMany({
      where: { id: { in: ids }, isArchived: false },
      select: { id: true },
    });
    if (products.length !== new Set(ids).size) {
      throw new ValidationError([
        { field: "items", message: "Alguno de los productos no existe o está archivado." },
      ]);
    }
  }

  // Coherencia de modo de precio tras el merge.
  const mode = body.pricingMode ?? existing.pricingMode;
  const fixedPrice = body.fixedPrice !== undefined ? body.fixedPrice : existing.fixedPrice;
  const discountPercent = body.discountPercent !== undefined ? body.discountPercent : existing.discountPercent;
  if (mode === "FIXED_PRICE" && fixedPrice == null) {
    throw new ValidationError([{ field: "fixedPrice", message: "Precio fijo obligatorio en modo FIXED_PRICE." }]);
  }
  if (mode === "PERCENT_DISCOUNT" && discountPercent == null) {
    throw new ValidationError([{ field: "discountPercent", message: "Porcentaje obligatorio en modo PERCENT_DISCOUNT." }]);
  }

  const updated = await db.$transaction(async (tx) => {
    if (body.items) {
      await tx.comboItem.deleteMany({ where: { comboId: id } });
    }
    return tx.combo.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
        ...(body.pricingMode !== undefined ? { pricingMode: body.pricingMode } : {}),
        ...(body.fixedPrice !== undefined ? { fixedPrice: body.fixedPrice } : {}),
        ...(body.discountPercent !== undefined ? { discountPercent: body.discountPercent } : {}),
        ...(body.isVisible !== undefined ? { isVisible: body.isVisible } : {}),
        ...(body.isFeatured !== undefined ? { isFeatured: body.isFeatured } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.items
          ? { items: { create: body.items.map((it) => ({ productId: it.productId, quantity: it.quantity })) } }
          : {}),
      },
      include: { items: { include: { product: { select: { name: true, basePrice: true } } } } },
    });
  });
  return jsonOk(updated);
});

export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const existing = await db.combo.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Combo");
  await db.combo.delete({ where: { id } });
  return jsonOk({ ok: true });
});
