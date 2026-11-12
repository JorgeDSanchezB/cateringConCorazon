import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getFlags } from "@/lib/flags";
import { ascCursorClause, getPagination, jsonOk, apiHandler, listEnvelope } from "@/lib/http";
import { comboUnitPrice } from "@/lib/domain/pricing";

/**
 * GET /api/public/combos?limit&cursor
 * Combos visibles con sus items y precio unitario calculado.
 * Si el flag combos_enabled está apagado → lista vacía (el módulo desaparece).
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const flags = await getFlags();
  if (!flags.combos_enabled) {
    return jsonOk({ items: [], nextCursor: null });
  }
  const { limit, cursor } = getPagination(req);
  const rows = await db.combo.findMany({
    where: {
      isVisible: true,
      ...(cursor ? ascCursorClause(cursor) : {}),
    } as Prisma.ComboWhereInput,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    take: limit + 1,
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      pricingMode: true,
      fixedPrice: true,
      discountPercent: true,
      sortOrder: true,
      items: {
        select: {
          quantity: true,
          product: { select: { id: true, name: true, basePrice: true, imageUrl: true } },
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
      id: row.id,
      name: row.name,
      description: row.description,
      imageUrl: row.imageUrl,
      pricingMode: row.pricingMode,
      fixedPrice: row.fixedPrice,
      discountPercent: row.discountPercent,
      unitPrice: comboUnitPrice({
        id: row.id,
        pricingMode: row.pricingMode as "FIXED_PRICE" | "PERCENT_DISCOUNT",
        fixedPrice: row.fixedPrice,
        discountPercent: row.discountPercent,
        items: row.items.map((it) => ({ unitPrice: it.product.basePrice, quantity: it.quantity })),
      }),
      items: row.items.map((it) => ({
        productId: it.product.id,
        productName: it.product.name,
        unitPrice: it.product.basePrice,
        quantity: it.quantity,
        imageUrl: it.product.imageUrl,
      })),
    })),
    nextCursor,
  });
});
