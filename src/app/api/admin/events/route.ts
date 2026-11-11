import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiHandler, descCursorClause, getPagination, jsonOk, listEnvelope, parseBody } from "@/lib/http";

/**
 * GET  /api/admin/events?limit&cursor&upcoming  (ADMIN/STAFF/CONTADOR)
 * POST /api/admin/events                        (ADMIN)
 */
const eventCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  eventDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Fecha inválida." }),
  location: z.string().trim().min(2).max(200),
  notes: z.string().max(600).nullable().optional(),
  minOrderOverride: z.number().int().min(0).max(10_000_000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN", "STAFF", "CONTADOR"] });
  const { limit, cursor } = getPagination(req);
  const upcoming = req.nextUrl.searchParams.get("upcoming");
  const rows = await db.event.findMany({
    where: {
      ...(upcoming === "true" ? { eventDate: { gte: new Date() }, isActive: true } : {}),
      ...(cursor ? descCursorClause("eventDate", cursor) : {}),
    } as Prisma.EventWhereInput,
    orderBy: [{ eventDate: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true, name: true, eventDate: true, location: true, notes: true,
      minOrderOverride: true, isActive: true, createdAt: true,
      _count: { select: { orders: true } },
    },
  });
  const { items, nextCursor } = listEnvelope(rows, limit, (row) => ({
    v1: row.eventDate.toISOString(),
    v2: row.id,
  }));
  return jsonOk({
    items: items.map((row) => ({ ...row, orderCount: row._count.orders, _count: undefined })),
    nextCursor,
  });
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const body = await parseBody(req, eventCreateSchema);
  const event = await db.event.create({
    data: {
      name: body.name,
      eventDate: new Date(body.eventDate),
      location: body.location,
      notes: body.notes ?? null,
      minOrderOverride: body.minOrderOverride ?? null,
      isActive: body.isActive ?? true,
    },
  });
  return jsonOk(event, { status: 201 });
});
