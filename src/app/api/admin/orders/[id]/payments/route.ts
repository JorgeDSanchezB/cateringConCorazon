import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";
import { registerPayment, registerPaymentSchema } from "@/lib/services/orders";

/**
 * POST /api/admin/orders/:id/payments  (CONTADOR/ADMIN)
 * Registra un pago/abono de la reserva (pueden existir varios).
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser(req, { roles: ["CONTADOR", "ADMIN"] });
  const { id } = await ctx.params;
  const body = await parseBody(req, registerPaymentSchema);
  const payment = await registerPayment(id, body, user.id);
  return jsonOk(payment, { status: 201 });
});
