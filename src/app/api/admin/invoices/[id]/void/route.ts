import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";
import { voidInvoice } from "@/lib/services/invoices";

/**
 * POST /api/admin/invoices/:id/void { reason }  (CONTADOR/ADMIN)
 * Anula la factura (ACTIVE → VOID) con motivo obligatorio.
 */
const voidSchema = z.object({
  reason: z.string().trim().min(3, "Motivo de anulación obligatorio").max(200),
});

export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser(req, { roles: ["CONTADOR", "ADMIN"] });
  const { id } = await ctx.params;
  const body = await parseBody(req, voidSchema);
  const invoice = await voidInvoice(id, body.reason, user.id);
  return jsonOk(invoice);
});
