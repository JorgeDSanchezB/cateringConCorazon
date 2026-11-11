import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiHandler, descCursorClause, getPagination, jsonOk, listEnvelope } from "@/lib/http";

/**
 * GET /api/admin/orders?limit&cursor&status&channel&eventId&q  (todos los roles)
 * Listado paginado por cursor (createdAt desc, id desc). Los pedidos ONSITE
 * crecen rápido: O(limit) por página, nunca O(n) total.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN", "STAFF", "CONTADOR"] });
  const { limit, cursor } = getPagination(req);
  const params = req.nextUrl.searchParams;
  const status = params.get("status");
  const channel = params.get("channel");
  const eventId = params.get("eventId");
  const q = params.get("q")?.trim() ?? "";

  const where: Prisma.OrderWhereInput = {
    ...(status ? { status } : {}),
    ...(channel === "EVENT_BOOKING" || channel === "ONSITE" ? { channel } : {}),
    ...(eventId ? { eventId } : {}),
    ...(q ? { OR: [{ code: { contains: q } }, { customerName: { contains: q } }] } : {}),
  };

  const rows = await db.order.findMany({
    where: { ...where, ...(cursor ? descCursorClause("createdAt", cursor) : {}) } as Prisma.OrderWhereInput,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true, code: true, channel: true, status: true,
      customerName: true, customerPhone: true,
      eventDate: true, eventLocation: true, guests: true,
      subtotal: true, discountAmount: true, taxPercent: true, taxAmount: true, total: true,
      createdAt: true,
      stockApplied: true,
      event: { select: { id: true, name: true } },
      discountCode: { select: { code: true } },
      createdBy: { select: { name: true } },
      _count: { select: { items: true, payments: true, invoices: true } },
    },
  });

  const { items, nextCursor } = listEnvelope(rows, limit, (row) => ({
    v1: row.createdAt.toISOString(),
    v2: row.id,
  }));

  return jsonOk({ items, nextCursor });
});
