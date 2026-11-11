import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { apiHandler, jsonOk } from "@/lib/http";
import { allowedTransitions } from "@/lib/services/orders";

/**
 * GET /api/admin/orders/:id  (todos los roles)
 * Detalle completo: items (snapshots), pagos, factura activa, evento,
 * descuento aplicado y transiciones de estado permitidas.
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN", "STAFF", "CONTADOR"] });
  const { id } = await ctx.params;
  const order = await db.order.findUnique({
    where: { id },
    include: {
      items: true,
      payments: {
        orderBy: { receivedAt: "desc" },
        select: {
          id: true, amount: true, method: true, reference: true, notes: true,
          receivedAt: true, registeredBy: { select: { name: true } },
        },
      },
      invoices: { where: { status: "ACTIVE" }, take: 1 },
      event: { select: { id: true, name: true, eventDate: true, location: true } },
      discountCode: { select: { code: true, type: true, value: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!order) throw new NotFoundError("Pedido");
  return jsonOk({
    ...order,
    invoice: order.invoices[0] ?? null,
    invoices: undefined,
    allowedTransitions: allowedTransitions(order.status),
  });
});
