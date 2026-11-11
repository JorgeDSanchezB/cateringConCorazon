import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { apiHandler, descCursorClause, getPagination, jsonOk, listEnvelope, parseBody } from "@/lib/http";

/**
 * GET  /api/admin/payments?limit&cursor&from&to&orderId  (CONTADOR/ADMIN)
 * POST /api/admin/payments  (CONTADOR/ADMIN) — ingreso manual (con o sin pedido).
 */
const paymentCreateSchema = z.object({
  orderId: z.string().min(1).max(64).nullable().optional(),
  amount: z.number().int().min(1, "El monto debe ser positivo").max(100_000_000),
  method: z.enum(["CASH", "TRANSFER", "OTHER"]),
  reference: z.string().trim().max(120).nullable().optional(),
  notes: z.string().max(300).nullable().optional(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["CONTADOR", "ADMIN"] });
  const { limit, cursor } = getPagination(req);
  const params = req.nextUrl.searchParams;
  const orderId = params.get("orderId");
  const from = params.get("from");
  const to = params.get("to");
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if ((from && Number.isNaN(fromDate?.getTime())) || (to && Number.isNaN(toDate?.getTime()))) {
    throw new ValidationError([{ field: "from", message: "Rango de fechas inválido." }]);
  }

  const rows = await db.payment.findMany({
    where: {
      ...(orderId ? { orderId } : {}),
      ...(fromDate || toDate
        ? { receivedAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
        : {}),
      ...(cursor ? descCursorClause("receivedAt", cursor) : {}),
    } as Prisma.PaymentWhereInput,
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true, orderId: true, amount: true, method: true, reference: true,
      notes: true, receivedAt: true,
      order: { select: { code: true } },
      registeredBy: { select: { name: true } },
    },
  });

  const { items, nextCursor } = listEnvelope(rows, limit, (row) => ({
    v1: row.receivedAt.toISOString(),
    v2: row.id,
  }));
  return jsonOk({ items, nextCursor });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser(req, { roles: ["CONTADOR", "ADMIN"] });
  const body = await parseBody(req, paymentCreateSchema);
  if (body.orderId) {
    const order = await db.order.findUnique({ where: { id: body.orderId } });
    if (!order) throw new ValidationError([{ field: "orderId", message: "El pedido no existe." }]);
  }
  const payment = await db.payment.create({
    data: {
      orderId: body.orderId ?? null,
      amount: body.amount,
      method: body.method,
      reference: body.reference ?? null,
      notes: body.notes ?? null,
      registeredById: user.id,
    },
  });
  return jsonOk(payment, { status: 201 });
});
