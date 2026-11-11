import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { apiHandler, ascCursorClause, getPagination, jsonOk, listEnvelope, parseBody } from "@/lib/http";
import { comboUnitPrice } from "@/lib/domain/pricing";

/**
 * GET  /api/admin/combos  (ADMIN)
 * POST /api/admin/combos  (ADMIN)
 * Combos = entidad de primera clase: crear uno nuevo NO toca código.
 */
const comboItemSchema = z.object({
  productId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(50),
});

const comboCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().max(500).nullable().optional(),
    imageUrl: z.string().max(300).nullable().optional(),
    pricingMode: z.enum(["FIXED_PRICE", "PERCENT_DISCOUNT"]),
    fixedPrice: z.number().int().min(1).max(10_000_000).nullable().optional(),
    discountPercent: z.number().int().min(1).max(99).nullable().optional(),
    isVisible: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    items: z.array(comboItemSchema).min(1, "Un combo necesita al menos un producto.").max(12),
  })
  .refine((v) => (v.pricingMode === "FIXED_PRICE" ? v.fixedPrice != null : true), {
    message: "Precio fijo obligatorio en modo FIXED_PRICE.",
    path: ["fixedPrice"],
  })
  .refine((v) => (v.pricingMode === "PERCENT_DISCOUNT" ? v.discountPercent != null : true), {
    message: "Porcentaje obligatorio en modo PERCENT_DISCOUNT.",
    path: ["discountPercent"],
  });

async function validateComboItems(items: { productId: string }[]): Promise<void> {
  const ids = items.map((i) => i.productId);
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

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { limit, cursor } = getPagination(req);
  const rows = await db.combo.findMany({
    where: { ...(cursor ? ascCursorClause(cursor) : {}) } as Prisma.ComboWhereInput,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    take: limit + 1,
    select: {
      id: true, name: true, description: true, imageUrl: true, pricingMode: true,
      fixedPrice: true, discountPercent: true, isVisible: true, isFeatured: true,
      sortOrder: true, createdAt: true,
      items: {
        select: {
          productId: true, quantity: true,
          product: { select: { name: true, basePrice: true } },
        },
      },
    },
  });
  const { items, nextCursor } = listEnvelope(rows, limit, (row) => ({
    v1: String(row.sortOrder),
    v2: row.id,
  }));
  return jsonOk({
    items: items.map((row) => ({
      ...row,
      items: row.items.map((it) => ({
        productId: it.productId,
        productName: it.product.name,
        unitPrice: it.product.basePrice,
        quantity: it.quantity,
      })),
      unitPrice: comboUnitPrice({
        id: row.id,
        pricingMode: row.pricingMode as "FIXED_PRICE" | "PERCENT_DISCOUNT",
        fixedPrice: row.fixedPrice,
        discountPercent: row.discountPercent,
        items: row.items.map((it) => ({ unitPrice: it.product.basePrice, quantity: it.quantity })),
      }),
    })),
    nextCursor,
  });
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const body = await parseBody(req, comboCreateSchema);
  await validateComboItems(body.items);
  const combo = await db.combo.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      imageUrl: body.imageUrl ?? null,
      pricingMode: body.pricingMode,
      fixedPrice: body.fixedPrice ?? null,
      discountPercent: body.discountPercent ?? null,
      isVisible: body.isVisible ?? true,
      isFeatured: body.isFeatured ?? false,
      sortOrder: body.sortOrder ?? 0,
      items: {
        create: body.items.map((it) => ({ productId: it.productId, quantity: it.quantity })),
      },
    },
    include: { items: { include: { product: { select: { name: true, basePrice: true } } } } },
  });
  return jsonOk(combo, { status: 201 });
});
