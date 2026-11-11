import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";
import { createOnsiteSale, onsiteSaleInputSchema } from "@/lib/services/orders";

/**
 * POST /api/admin/orders/onsite  (STAFF/ADMIN)
 * Venta directa en el evento (Punto de Venta):
 * - valida items contra catálogo vigente (archivados → 422 por ítem);
 * - verifica y descuenta stock con movimiento motivo obligatorio;
 * - crea pedido COMPLETED + pago inmediato;
 * - opcionalmente emite factura interna (si invoicing_enabled, en caliente).
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser(req, { roles: ["ADMIN", "STAFF"] });
  const body = await parseBody(req, onsiteSaleInputSchema);
  const { order, invoiceNumber } = await createOnsiteSale(body, user.id);
  return jsonOk(
    {
      order,
      invoiceNumber,
    },
    { status: 201 },
  );
});
