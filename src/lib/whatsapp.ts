/**
 * WhatsApp — único número configurable desde admin (WhatsAppSetting).
 * El pedido se envía como mensaje estructurado generado en el SERVIDOR con
 * la plantilla editable; el cliente solo abre la URL.
 *
 * Tolerancia: si no hay número configurado, el pedido se registra igual y
 * la UI muestra un fallback claro (no rompe el flujo del cliente).
 */

export interface WhatsAppTemplateVars {
  BRAND: string;
  ORDER_CODE: string;
  CUSTOMER_NAME: string;
  ITEMS: string;
  SUBTOTAL: string;
  DISCOUNT: string;
  TAX: string;
  TOTAL: string;
  EVENT_DATE: string;
  EVENT_LOCATION: string;
  GUESTS: string;
  NOTES: string;
}

export const DEFAULT_WHATSAPP_TEMPLATE =
  "¡Hola {BRAND}! Quiero reservar el catering para mi evento.\n\n" +
  "Pedido {ORDER_CODE}\n" +
  "Nombre: {CUSTOMER_NAME}\n" +
  "Fecha del evento: {EVENT_DATE}\n" +
  "Lugar: {EVENT_LOCATION}\n" +
  "Invitados: {GUESTS}\n\n" +
  "Detalle:\n{ITEMS}\n" +
  "Subtotal: {SUBTOTAL}\n" +
  "Descuento: {DISCOUNT}\n" +
  "IVA: {TAX}\n" +
  "Total: {TOTAL}\n" +
  "Notas: {NOTES}\n\n" +
  "¡Gracias! Quedo pendiente de la confirmación.";

const TEMPLATE_VAR_RE = /\{([A-Z_]+)\}/g;

/** Sustituye placeholders {VAR} con valores; los desconocidos quedan vacíos. */
export function renderTemplate(template: string, vars: Partial<WhatsAppTemplateVars>): string {
  return template.replace(TEMPLATE_VAR_RE, (_m, name: string) => {
    const value = (vars as Record<string, string>)[name];
    return value ?? "";
  });
}

/** Valida formato E.164: +seguido de 8-15 dígitos. */
export function isValidWhatsAppPhone(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone.trim());
}

/** wa.me URL con mensaje codificado. */
export function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/**
 * Mensaje estructurado del pedido (resumen completo, legible en WhatsApp).
 * @param itemLines  líneas ya formateadas, una por ítem.
 */
export function buildOrderWhatsAppMessage(opts: {
  template: string;
  brand: string;
  orderCode: string;
  customerName: string;
  itemLines: string[];
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  eventDate: string;
  eventLocation: string;
  guests: string;
  notes: string;
}): string {
  return renderTemplate(opts.template, {
    BRAND: opts.brand,
    ORDER_CODE: opts.orderCode,
    CUSTOMER_NAME: opts.customerName,
    ITEMS: opts.itemLines.join("\n"),
    SUBTOTAL: opts.subtotal,
    DISCOUNT: opts.discount,
    TAX: opts.tax,
    TOTAL: opts.total,
    EVENT_DATE: opts.eventDate,
    EVENT_LOCATION: opts.eventLocation,
    GUESTS: opts.guests,
    NOTES: opts.notes || "—",
  });
}
