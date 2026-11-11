import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiHandler, descCursorClause, getPagination, jsonOk, listEnvelope } from "@/lib/http";

/**
 * GET /api/admin/inventory/movements?limit&cursor&productId  (todos los roles)
 * Kardex de movimientos (paginado por cursor; virtualizado en la UI).
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN", "STAFF", "CONTADOR"] });
  const { limit, cursor } = getPagination(req);
  const productId = req.nextUrl.searchParams.get("productId");

  const rows = await db.inventoryMovement.findMany({
    where: {
      ...(productId ? { productId } : {}),
      ...(cursor ? descCursorClause("createdAt", cursor) : {}),
    } as Prisma.InventoryMovementWhereInput,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true, productId: true, delta: true, reason: true, createdAt: true,
      product: { select: { name: true } },
      user: { select: { name: true } },
    },
  });

  const { items, nextCursor } = listEnvelope(rows, limit, (row) => ({
    v1: row.createdAt.toISOString(),
    v2: row.id,
  }));
  return jsonOk({ items, nextCursor });
});
