import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";

/**
 * GET    /api/admin/events/:id  (ADMIN/STAFF/CONTADOR) — con resumen de pedidos.
 * PATCH  /api/admin/events/:id  (ADMIN)
 * DELETE /api/admin/events/:id  (ADMIN) — bloqueado si tiene pedidos.
 */
const eventPatchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  eventDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Fecha inválida." }).optional(),
  location: z.string().trim().min(2).max(200).optional(),
  notes: z.string().max(600).nullable().optional(),
  minOrderOverride: z.number().int().min(0).max(10_000_000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN", "STAFF", "CONTADOR"] });
  const { id } = await ctx.params;
  const event = await db.event.findUnique({
    where: { id },
    include: {
      orders: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true, code: true, channel: true, status: true, total: true,
          customerName: true, createdAt: true,
        },
      },
      _count: { select: { orders: true } },
    },
  });
  if (!event) throw new NotFoundError("Evento");
  return jsonOk(event);
});

export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const body = await parseBody(req, eventPatchSchema);
  const existing = await db.event.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Evento");
  const updated = await db.event.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.eventDate !== undefined ? { eventDate: new Date(body.eventDate) } : {}),
      ...(body.location !== undefined ? { location: body.location } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.minOrderOverride !== undefined ? { minOrderOverride: body.minOrderOverride } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  });
  return jsonOk(updated);
});

export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const ordersCount = await db.order.count({ where: { eventId: id } });
  if (ordersCount > 0) {
    throw new ConflictError(
      "EVENT_HAS_ORDERS",
      `El evento tiene ${ordersCount} pedido(s) asociado(s). Cámbielos de evento o anúlelos antes de eliminar.`,
    );
  }
  const existing = await db.event.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Evento");
  await db.event.delete({ where: { id } });
  return jsonOk({ ok: true });
});
