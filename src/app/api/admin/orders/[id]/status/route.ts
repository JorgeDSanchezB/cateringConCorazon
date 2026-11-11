import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";
import { ORDER_STATUSES, changeOrderStatus, allowedTransitions } from "@/lib/services/orders";

/**
 * PATCH /api/admin/orders/:id/status  (ADMIN/STAFF)
 * Cambio de estado con máquina de transiciones y efectos de inventario:
 * - COMPLETED en reserva → descuenta stock.
 * - CANCELLED con stock aplicado → lo reingresa.
 */
const statusPatchSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN", "STAFF"] });
  const { id } = await ctx.params;
  const body = await parseBody(req, statusPatchSchema);
  const updated = await changeOrderStatus(id, body.status);
  return jsonOk({
    ...updated,
    allowedTransitions: allowedTransitions(updated.status),
  });
});
