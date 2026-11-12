import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiHandler, jsonOk } from "@/lib/http";
import { getSiteSettings } from "@/lib/settings";

/**
 * GET /api/admin/overview  (todos los roles)
 * Métricas del dashboard. Los límites de agregación son O(1)/O(k) con k fijo
 * (top 5, últimos 8, stock bajo 10) — nunca O(n) sin cota.
 */

/** Inicio del día actual en la zona horaria del negocio (offset calculado). */
function startOfDayInTimezone(timeZone: string): Date {
  const now = new Date();
  let offsetMinutes = 0;
  try {
    const formatted = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .format(now);
    const match = formatted.match(/GMT([+-]\d{2}):(\d{2})/);
    if (match) {
      const sign = match[1]!.startsWith("-") ? -1 : 1;
      offsetMinutes = sign * (Math.abs(Number(match[1])) * 60 + Number(match[2]));
    }
  } catch {
    offsetMinutes = 0; // fallback UTC
  }
  const local = new Date(now.getTime() - offsetMinutes * 60_000);
  const dayStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  return new Date(dayStart.getTime() + offsetMinutes * 60_000);
}

function startOfMonthInTimezone(timeZone: string): Date {
  const now = new Date();
  let offsetMinutes = 0;
  try {
    const formatted = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .format(now);
    const match = formatted.match(/GMT([+-]\d{2}):(\d{2})/);
    if (match) {
      const sign = match[1]!.startsWith("-") ? -1 : 1;
      offsetMinutes = sign * (Math.abs(Number(match[1])) * 60 + Number(match[2]));
    }
  } catch {
    offsetMinutes = 0;
  }
  const local = new Date(now.getTime() - offsetMinutes * 60_000);
  const monthStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1));
  return new Date(monthStart.getTime() + offsetMinutes * 60_000);
}

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN", "STAFF", "CONTADOR"] });
  const { values: settings } = await getSiteSettings();
  const startOfDay = startOfDayInTimezone(settings.timezone);
  const startOfMonth = startOfMonthInTimezone(settings.timezone);

  const [
    pendingOrders,
    ordersToday,
    onsiteSalesToday,
    incomeMonth,
    expenseMonth,
    lowStock,
    topProducts,
    recentOrders,
  ] = await Promise.all([
    db.order.count({ where: { status: "PENDING_CONFIRMATION" } }),
    db.order.count({ where: { createdAt: { gte: startOfDay } } }),
    db.order.aggregate({
      _sum: { total: true },
      _count: true,
      where: { channel: "ONSITE", status: "COMPLETED", createdAt: { gte: startOfDay } },
    }),
    db.payment.aggregate({ _sum: { amount: true }, where: { receivedAt: { gte: startOfMonth } } }),
    db.expense.aggregate({ _sum: { amount: true }, where: { spentAt: { gte: startOfMonth } } }),
    db.inventoryStock.findMany({
      where: {},
      orderBy: { quantity: "asc" },
      take: 10,
      select: {
        quantity: true, lowStockThreshold: true,
        product: { select: { id: true, name: true } },
      },
    }),
    db.orderItem.groupBy({
      by: ["productName"],
      _sum: { quantity: true, lineTotal: true },
      where: { order: { status: "COMPLETED" } },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    db.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true, code: true, channel: true, status: true, total: true,
        customerName: true, createdAt: true,
      },
    }),
  ]);

  return jsonOk({
    pendingOrders,
    ordersToday: ordersToday,
    onsiteSalesTodayCents: onsiteSalesToday._sum.total ?? 0,
    onsiteSalesTodayCount: onsiteSalesToday._count,
    incomeMonthCents: incomeMonth._sum.amount ?? 0,
    expenseMonthCents: expenseMonth._sum.amount ?? 0,
    balanceMonthCents: (incomeMonth._sum.amount ?? 0) - (expenseMonth._sum.amount ?? 0),
    lowStock: lowStock
      .filter((s) => s.quantity <= s.lowStockThreshold)
      .map((s) => ({
        productId: s.product.id,
        name: s.product.name,
        quantity: s.quantity,
        threshold: s.lowStockThreshold,
      })),
    topProducts: topProducts.map((t) => ({
      name: t.productName,
      quantity: t._sum.quantity ?? 0,
      revenueCents: t._sum.lineTotal ?? 0,
    })),
    recentOrders,
  });
});
