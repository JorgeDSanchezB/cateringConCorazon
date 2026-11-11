import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiHandler, descCursorClause, getPagination, jsonOk, listEnvelope } from "@/lib/http";

/**
 * GET /api/admin/inventory?limit&cursor&q&lowStock  (todos los roles)
 * Stock por producto con alerta de bajo stock (quantity <= threshold).
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN", "STAFF", "CONTADOR"] });
  const { limit, cursor } = getPagination(req);
  const params = req.nextUrl.searchParams;
  const q = params.get("q")?.trim() ?? "";
  const lowStock = params.get("lowStock");

  const rows = await db.inventoryStock.findMany({
    where: {
      ...(q ? { product: { name: { contains: q } } } : {}),
      ...(lowStock === "true" ? {} : {}),
      ...(cursor ? descCursorClause("updatedAt", cursor) : {}),
    } as Prisma.InventoryStockWhereInput,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true, productId: true, quantity: true, lowStockThreshold: true, updatedAt: true,
      product: { select: { id: true, name: true, type: true, imageUrl: true, isArchived: true } },
    },
  });

  const filtered =
    lowStock === "true" ? rows.filter((r) => r.quantity <= r.lowStockThreshold) : rows;
  const { items, nextCursor } = listEnvelope(filtered, limit, (row) => ({
    v1: row.updatedAt.toISOString(),
    v2: row.id,
  }));
  return jsonOk({
    items: items.map((row) => ({
      ...row,
      isLow: row.quantity <= row.lowStockThreshold,
    })),
    nextCursor,
  });
});
