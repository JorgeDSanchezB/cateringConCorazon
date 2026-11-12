import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { bookingOrderInputSchema, createBookingOrder } from "@/lib/services/orders";

/**
 * POST /api/public/orders
 * Crea la reserva (canal EVENT_BOOKING, estado PENDING_CONFIRMATION) y
 * devuelve el mensaje de WhatsApp estructurado + URL.
 *
 * Tolerancia a fallos:
 * - ítems con producto archivado/invisible → 422 por ítem (se avisa al usuario).
 * - descuento inválido/expirado/agotado → 422 con razón.
 * - mínimo por evento no alcanzado → 409 MIN_ORDER_NOT_MET.
 * - WhatsApp sin número → pedido creado igual; whatsappAvailable=false y
 *   la UI muestra fallback (copiar mensaje).
 */
export const POST = apiHandler(async (req: NextRequest) => {
  rateLimit("public-order", clientIp(req), config.ORDER_MAX_PER_MINUTE);
  const body = await parseBody(req, bookingOrderInputSchema);
  const { order, whatsappUrl, message, whatsappAvailable } = await createBookingOrder(body);
  return jsonOk({
    orderCode: order.code,
    status: order.status,
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    taxPercent: order.taxPercent,
    taxAmount: order.taxAmount,
    total: order.total,
    whatsappAvailable,
    whatsappUrl,
    message,
  });
});
