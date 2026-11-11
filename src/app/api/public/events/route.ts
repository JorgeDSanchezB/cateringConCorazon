import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ascDateCursorClause, getPagination, jsonOk, apiHandler, listEnvelope } from "@/lib/http";

/**
 * GET /api/public/events?limit&cursor
 * Próximos eventos activos (sección pública de eventos), paginados por
 * cursor (eventDate asc, id asc).
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const { limit, cursor } = getPagination(req);
  const rows = await db.event.findMany({
    where: {
      isActive: true,
      eventDate: { gte: new Date() },
      ...(cursor ? ascDateCursorClause("eventDate", cursor) : {}),
    } as Prisma.EventWhereInput,
    orderBy: [{ eventDate: "asc" }, { id: "asc" }],
    take: limit + 1,
    select: {
      id: true,
      name: true,
      eventDate: true,
      location: true,
    },
  });
  const { items, nextCursor } = listEnvelope(rows, limit, (row) => ({
    v1: row.eventDate.toISOString(),
    v2: row.id,
  }));
  return jsonOk({ items, nextCursor });
});
