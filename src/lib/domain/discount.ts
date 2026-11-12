/**
 * Descuentos — dominio puro. Toda la configuración (tipo, monto, mínimo,
 * usos, vigencia, activo) vive en la tabla DiscountCode y es editable desde
 * el admin. Aquí solo se EVALÚA su aplicación sobre un subtotal dado.
 */

export type DiscountType = "PERCENT" | "FIXED_AMOUNT";

export interface DiscountRecord {
  code: string;
  type: DiscountType;
  /** Porcentaje (0-100) o monto fijo en centavos según type. */
  value: number;
  minSubtotal: number;
  maxUses: number | null;
  usedCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
}

export type DiscountRejection =
  | "DISABLED"
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "MIN_SUBTOTAL"
  | "MAX_USES";

export type DiscountEvaluation =
  | { ok: true; amountCents: number }
  | { ok: false; reason: DiscountRejection };

export const DISCOUNT_REJECTION_MESSAGES: Record<DiscountRejection, string> = {
  DISABLED: "Los códigos de descuento están desactivados temporalmente.",
  INACTIVE: "El código de descuento no está activo.",
  NOT_STARTED: "El código de descuento aún no comienza su vigencia.",
  EXPIRED: "El código de descuento expiró.",
  MIN_SUBTOTAL: "El subtotal no alcanza el mínimo requerido por el código.",
  MAX_USES: "El código de descuento alcanzó su máximo de usos.",
};

/**
 * Evalúa un código de descuento contra un subtotal y contexto.
 * El monto nunca excede el subtotal (no hay totales negativos).
 */
export function evaluateDiscount(
  record: DiscountRecord,
  ctx: { subtotalCents: number; now: Date; discountsEnabled: boolean },
): DiscountEvaluation {
  if (!ctx.discountsEnabled) return { ok: false, reason: "DISABLED" };
  if (!record.isActive) return { ok: false, reason: "INACTIVE" };
  if (record.startsAt && ctx.now < record.startsAt) return { ok: false, reason: "NOT_STARTED" };
  if (record.endsAt && ctx.now > record.endsAt) return { ok: false, reason: "EXPIRED" };
  if (ctx.subtotalCents < record.minSubtotal) return { ok: false, reason: "MIN_SUBTOTAL" };
  if (record.maxUses !== null && record.usedCount >= record.maxUses) {
    return { ok: false, reason: "MAX_USES" };
  }
  let amount: number;
  if (record.type === "PERCENT") {
    amount = Math.round((ctx.subtotalCents * record.value) / 100);
  } else {
    amount = record.value;
  }
  // Cap: el descuento no puede superar el subtotal.
  const amountCents = Math.min(amount, ctx.subtotalCents);
  return { ok: true, amountCents };
}

/** Etiqueta legible: "10%" o "$5.00" (símbolo configurable en la UI). */
export function discountLabel(record: Pick<DiscountRecord, "type" | "value">, symbol = "$"): string {
  if (record.type === "PERCENT") return `${record.value}%`;
  const dollars = (record.value / 100).toFixed(2);
  return `${symbol}${dollars}`;
}
