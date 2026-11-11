import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { apiHandler, jsonOk } from "@/lib/http";

/**
 * GET /api/admin/accounting/summary?from&to  (CONTADOR/ADMIN)
 * Contabilidad básica: ingresos (pagos), egresos (gastos) y balance del
 * rango (default: mes actual en la zona horaria del negocio).
 */
function parseDateParam(value: string | null, field: string): Date | null {
  if (value === null) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError([{ field, message: "Fecha inválida (ISO 8601)." }]);
  }
  return d;
}

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["CONTADOR", "ADMIN"] });
  const params = req.nextUrl.searchParams;
  const from = parseDateParam(params.get("from"), "from");
  const to = parseDateParam(params.get("to"), "to");
  if (from && to && from > to) {
    throw new ValidationError([{ field: "from", message: "'from' debe ser anterior a 'to'." }]);
  }

  const paymentWhere = {
    ...(from || to
      ? { receivedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  };
  const expenseWhere = {
    ...(from || to
      ? { spentAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  };
  const orderWhere = {
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  };

  const [incomeAgg, expenseAgg, completedOrders, topProducts, channelSplit, paymentMethodSplit] =
    await Promise.all([
      db.payment.aggregate({ _sum: { amount: true }, _count: true, where: paymentWhere }),
      db.expense.aggregate({ _sum: { amount: true }, _count: true, where: expenseWhere }),
      db.order.aggregate({ _count: true, where: { status: "COMPLETED", ...orderWhere } }),
      db.orderItem.groupBy({
        by: ["productName"],
        _sum: { quantity: true, lineTotal: true },
        where: { order: { status: "COMPLETED", ...orderWhere } },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),
      db.order.groupBy({
        by: ["channel"],
        _sum: { total: true },
        _count: true,
        where: { status: "COMPLETED", ...orderWhere },
      }),
      db.payment.groupBy({
        by: ["method"],
        _sum: { amount: true },
        _count: true,
        where: paymentWhere,
      }),
    ]);

  const incomeCents = incomeAgg._sum.amount ?? 0;
  const expenseCents = expenseAgg._sum.amount ?? 0;

  return jsonOk({
    range: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
    incomeCents,
    incomeCount: incomeAgg._count,
    expenseCents,
    expenseCount: expenseAgg._count,
    balanceCents: incomeCents - expenseCents,
    completedOrders: completedOrders._count,
    topProducts: topProducts.map((t) => ({
      productName: t.productName,
      quantity: t._sum.quantity ?? 0,
      revenueCents: t._sum.lineTotal ?? 0,
    })),
    channelSplit: channelSplit.map((c) => ({
      channel: c.channel,
      totalCents: c._sum.total ?? 0,
      count: c._count,
    })),
    paymentMethodSplit: paymentMethodSplit.map((m) => ({
      method: m.method,
      totalCents: m._sum.amount ?? 0,
      count: m._count,
    })),
  });
});
