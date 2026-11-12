import { z } from "zod";
import { db } from "../db";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { getFlags } from "../flags";
import { getSiteSettings } from "../settings";
import { formatMoney } from "../domain/money";
import { evaluateDiscount, type DiscountRecord, type DiscountType } from "../domain/discount";
import { totalsWithTax } from "../domain/tax";
import {
  buildOrderLines,
  cartItemSchema,
  itemErrorsToProblemFields,
  validateCartShape,
  type CartItemInput,
} from "../domain/order";
import { loadCatalogSnapshot } from "./catalog";
import { formatOrderCode, nextSequence } from "./counters";
import { applyStock, assertStockAvailable } from "./inventory";
import { issueInvoiceForOrder } from "./invoices";
import {
  DEFAULT_WHATSAPP_TEMPLATE,
  buildOrderWhatsAppMessage,
  buildWhatsAppUrl,
  isValidWhatsAppPhone,
} from "../whatsapp";

/**
 * Servicio de pedidos (capa de aplicación).
 *
 * Canales: EVENT_BOOKING (reserva web confirmada por WhatsApp) y ONSITE
 * (venta directa en el evento registrada por STAFF/ADMIN).
 *
 * Inventario (ADR-005): ONSITE descuenta stock al registrar la venta;
 * EVENT_BOOKING lo descuenta al pasar a COMPLETED (el día del evento).
 * CANCELAR un pedido con stock aplicado lo reingresa con movimiento de motivo.
 */

export const ORDER_STATUSES = [
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "IN_PREPARATION",
  "COMPLETED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_CONFIRMATION: "Pendiente de confirmación",
  CONFIRMED: "Confirmado",
  IN_PREPARATION: "En preparación",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};

/** Máquina de estados de pedidos. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_CONFIRMATION: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PREPARATION", "COMPLETED", "CANCELLED"],
  IN_PREPARATION: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["CANCELLED"],
  CANCELLED: [],
};

export const PAYMENT_METHODS = ["CASH", "TRANSFER", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Fecha inválida (ISO 8601)." })
  .optional();

export const bookingOrderInputSchema = z.object({
  customerName: z.string().trim().min(2, "Nombre demasiado corto").max(80),
  customerPhone: z.string().trim().min(6).max(20).optional(),
  eventDate: isoDate,
  eventLocation: z.string().trim().min(2).max(200).optional(),
  guests: z.number().int().min(1).max(10_000).optional(),
  notes: z.string().max(600).optional(),
  discountCode: z.string().trim().min(1).max(40).optional(),
  items: z.array(cartItemSchema).min(1, "El pedido necesita al menos un ítem.").max(60),
});

export type BookingOrderInput = z.output<typeof bookingOrderInputSchema>;

export const onsiteSaleInputSchema = z.object({
  customerName: z.string().trim().min(2).max(80).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  issueInvoice: z.boolean().default(false),
  /** Id del evento opcional para atribuir la venta en sitio. */
  eventId: z.string().min(1).max(64).optional(),
  items: z.array(cartItemSchema).min(1).max(60),
});

export type OnsiteSaleInput = z.output<typeof onsiteSaleInputSchema>;

function formatDateEs(date: Date | null, timezone: string): string {
  if (!date) return "Por definir";
  try {
    return new Intl.DateTimeFormat("es-EC", {
      timeZone: timezone,
      dateStyle: "full",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

interface BuiltTotals {
  subtotal: number;
  discountAmount: number;
  taxPercent: number | null;
  taxAmount: number;
  total: number;
}

function consumptionWithNames(
  lines: { productId?: string; comboId?: string; quantity: number }[],
  products: Map<string, { name: string }>,
  combos: Map<string, { items: { productId: string; quantity: number }[] }>,
): { productId: string; productName: string; quantity: number }[] {
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (line.productId) {
      totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
    } else if (line.comboId) {
      const combo = combos.get(line.comboId);
      if (combo) {
        for (const item of combo.items) {
          totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity * line.quantity);
        }
      }
    }
  }
  return [...totals.entries()].map(([productId, quantity]) => ({
    productId,
    productName: products.get(productId)?.name ?? productId,
    quantity,
  }));
}

// ─────────────────────────── Reserva web (EVENT_BOOKING) ───────────────────────────

export async function createBookingOrder(input: BookingOrderInput) {
  const [{ values: settings }, flags] = await Promise.all([getSiteSettings(), getFlags()]);
  const cart = validateCartShape({ items: input.items });
  const catalog = await loadCatalogSnapshot();
  const build = buildOrderLines(cart, {
    products: catalog.products,
    combos: catalog.combos,
    combosEnabled: flags.combos_enabled,
    variantsEnabled: flags.variants_enabled,
  });
  if (!build.ok) {
    // Ítems rechazados uno a uno (producto archivado, combo apagado, etc.).
    throw new ValidationError(itemErrorsToProblemFields(build.itemErrors));
  }
  const lines = build.lines;
  const subtotal = lines.reduce((acc, l) => acc + l.lineTotal, 0);

  // Mínimo por evento (global; en la reserva web no hay override por evento).
  if (subtotal < settings.globalMinOrderCents) {
    throw new ConflictError(
      "MIN_ORDER_NOT_MET",
      `El pedido no alcanza el mínimo por evento (${formatMoney(settings.globalMinOrderCents, settings.currencySymbol)}).`,
      [{ field: "items", message: `Subtotal actual: ${formatMoney(subtotal, settings.currencySymbol)}.` }],
    );
  }

  // Descuento (opcional; validado de nuevo en servidor).
  let discountCodeId: string | null = null;
  let discountAmount = 0;
  let appliedCode: string | null = null;
  if (input.discountCode) {
    if (!flags.discounts_enabled) {
      throw new ValidationError([
        { field: "discountCode", message: "Los descuentos están desactivados temporalmente." },
      ]);
    }
    const record = await db.discountCode.findUnique({
      where: { code: input.discountCode.trim().toUpperCase() },
    });
    if (!record) {
      throw new ValidationError([
        { field: "discountCode", message: "El código de descuento no existe." },
      ]);
    }
    // Enum de aplicación: el valor llega como string de SQLite y se acota al union.
    const discountRecord: DiscountRecord = {
      ...record,
      type: record.type as DiscountType,
    };
    const evaluation = evaluateDiscount(discountRecord, {
      subtotalCents: subtotal,
      now: new Date(),
      discountsEnabled: flags.discounts_enabled,
    });
    if (!evaluation.ok) {
      throw new ValidationError([
        { field: "discountCode", message: `Código rechazado: ${evaluation.reason}.` },
      ]);
    }
    discountCodeId = record.id;
    discountAmount = evaluation.amountCents;
    appliedCode = record.code;
  }

  const totals: BuiltTotals = totalsWithTax(subtotal, discountAmount, {
    taxEnabled: flags.tax_enabled,
    taxPercent: settings.taxPercent,
  });

  const order = await db.$transaction(async (tx) => {
    const seq = await nextSequence(tx, "order");
    const code = formatOrderCode(settings.orderPrefix, seq);
    const created = await tx.order.create({
      data: {
        code,
        channel: "EVENT_BOOKING",
        status: "PENDING_CONFIRMATION",
        customerName: input.customerName,
        customerPhone: input.customerPhone ?? null,
        eventDate: input.eventDate ? new Date(input.eventDate) : null,
        eventLocation: input.eventLocation ?? null,
        guests: input.guests ?? null,
        subtotal: totals.subtotal,
        discountCodeId,
        discountAmount: totals.discountAmount,
        taxPercent: totals.taxPercent,
        taxAmount: totals.taxAmount,
        total: totals.total,
        notes: input.notes ?? null,
        items: {
          create: lines.map((l) => ({
            productId: l.productId ?? null,
            comboId: l.comboId ?? null,
            productName: l.productName,
            variantId: l.variantId ?? null,
            variantName: l.variantName ?? null,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            lineTotal: l.lineTotal,
          })),
        },
      },
      include: { items: true },
    });
    if (discountCodeId) {
      await tx.discountCode.update({
        where: { id: discountCodeId },
        data: { usedCount: { increment: 1 } },
      });
    }
    return created;
  });

  // Mensaje de WhatsApp estructurado (plantilla editable en BD).
  const wa = await db.whatsAppSetting.findUnique({ where: { id: "whatsapp" } });
  const template = wa?.defaultMessage?.trim() || DEFAULT_WHATSAPP_TEMPLATE;
  const itemLines = order.items.map((it) => {
    const variant = it.variantName ? ` (${it.variantName})` : "";
    return `${it.quantity} × ${it.productName}${variant} — ${formatMoney(it.lineTotal, settings.currencySymbol)}`;
  });
  const message = buildOrderWhatsAppMessage({
    template,
    brand: settings.brandName,
    orderCode: order.code,
    customerName: input.customerName,
    itemLines,
    subtotal: formatMoney(totals.subtotal, settings.currencySymbol),
    discount: appliedCode
      ? `-${formatMoney(totals.discountAmount, settings.currencySymbol)} (${appliedCode})`
      : "—",
    tax: totals.taxPercent === null
      ? "No aplica (IVA desactivado)"
      : `${formatMoney(totals.taxAmount, settings.currencySymbol)} (${totals.taxPercent}%)`,
    total: formatMoney(totals.total, settings.currencySymbol),
    eventDate: formatDateEs(input.eventDate ? new Date(input.eventDate) : null, settings.timezone),
    eventLocation: input.eventLocation ?? "Por definir",
    guests: input.guests ? String(input.guests) : "Por definir",
    notes: input.notes ?? "",
  });
  const phone = wa?.phoneNumber?.trim() || null;
  const whatsappUrl = phone && isValidWhatsAppPhone(phone) ? buildWhatsAppUrl(phone, message) : null;

  return { order, whatsappUrl, message, whatsappAvailable: whatsappUrl !== null };
}

// ─────────────────────────── Venta directa en el evento (ONSITE) ───────────────────────────

export async function createOnsiteSale(input: OnsiteSaleInput, userId: string) {
  const [{ values: settings }, flags] = await Promise.all([getSiteSettings(), getFlags()]);
  const cart = validateCartShape({ items: input.items });
  const catalog = await loadCatalogSnapshot();
  const build = buildOrderLines(cart, {
    products: catalog.products,
    combos: catalog.combos,
    combosEnabled: flags.combos_enabled,
    variantsEnabled: flags.variants_enabled,
  });
  if (!build.ok) {
    throw new ValidationError(itemErrorsToProblemFields(build.itemErrors));
  }
  const lines = build.lines;
  const subtotal = lines.reduce((acc, l) => acc + l.lineTotal, 0);
  const totals = totalsWithTax(subtotal, 0, {
    taxEnabled: flags.tax_enabled,
    taxPercent: settings.taxPercent,
  });

  const consumption = consumptionWithNames(lines, catalog.products, catalog.combos);

  const result = await db.$transaction(async (tx) => {
    // Verificación de stock antes de escribir nada.
    await assertStockAvailable(tx, consumption);
    const seq = await nextSequence(tx, "order");
    const code = formatOrderCode(settings.orderPrefix, seq);
    const order = await tx.order.create({
      data: {
        code,
        channel: "ONSITE",
        status: "COMPLETED",
        eventId: input.eventId ?? null,
        customerName: input.customerName ?? null,
        subtotal,
        discountAmount: 0,
        taxPercent: totals.taxPercent,
        taxAmount: totals.taxAmount,
        total: totals.total,
        stockApplied: true,
        createdByUserId: userId,
        items: {
          create: lines.map((l) => ({
            productId: l.productId ?? null,
            comboId: l.comboId ?? null,
            productName: l.productName,
            variantId: l.variantId ?? null,
            variantName: l.variantName ?? null,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            lineTotal: l.lineTotal,
          })),
        },
      },
      include: { items: true },
    });
    // Descuento de stock con movimiento motivo obligatorio.
    await applyStock(tx, consumption, "decrement", `Venta en evento ${code}`);
    // Pago inmediato de la venta en sitio.
    await tx.payment.create({
      data: {
        orderId: order.id,
        amount: totals.total,
        method: input.paymentMethod,
        notes: `Venta en evento registrada desde punto de venta (${code}).`,
        registeredById: userId,
      },
    });
    // Factura opcional (solo si el flag está activo).
    let invoiceNumber: string | null = null;
    if (input.issueInvoice && flags.invoicing_enabled) {
      const invoice = await issueInvoiceForOrder(
        tx,
        {
          id: order.id,
          code: order.code,
          customerName: order.customerName,
          subtotal: order.subtotal,
          discountAmount: order.discountAmount,
          taxPercent: order.taxPercent,
          taxAmount: order.taxAmount,
          total: order.total,
        },
        userId,
        { name: input.customerName ?? null },
      );
      invoiceNumber = invoice.number;
    }
    return { order, invoiceNumber };
  });

  return result;
}

// ─────────────────────────── Transiciones de estado ───────────────────────────

export async function changeOrderStatus(orderId: string, newStatus: OrderStatus) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new NotFoundError("Pedido");
  const current = order.status as OrderStatus;
  const allowed = TRANSITIONS[current] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new ConflictError(
      "INVALID_TRANSITION",
      `No se puede pasar de «${ORDER_STATUS_LABELS[current]}» a «${ORDER_STATUS_LABELS[newStatus]}».`,
      [{
        field: "status",
        message: `Transiciones permitidas: ${allowed.map((s) => ORDER_STATUS_LABELS[s]).join(", ") || "ninguna (estado terminal)"}.`,
      }],
    );
  }

  const catalog = await loadCatalogSnapshot();
  const consumption = consumptionWithNames(
    order.items.map((item) => ({
      productId: item.productId ?? undefined,
      comboId: item.comboId ?? undefined,
      quantity: item.quantity,
    })),
    catalog.products,
    catalog.combos,
  );

  return db.$transaction(async (tx) => {
    // Reserva completada → consumir stock (si aún no se aplicó).
    if (newStatus === "COMPLETED" && !order.stockApplied) {
      await assertStockAvailable(tx, consumption);
      await applyStock(tx, consumption, "decrement", `Consumo en evento ${order.code}`);
    }
    // Cancelación con stock aplicado → reingreso.
    if (newStatus === "CANCELLED" && order.stockApplied) {
      await applyStock(tx, consumption, "increment", `Cancelación del pedido ${order.code}`);
    }
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: newStatus,
        stockApplied:
          newStatus === "COMPLETED"
            ? true
            : newStatus === "CANCELLED"
              ? false
              : order.stockApplied,
      },
      include: { items: true },
    });
    return updated;
  });
}

// ─────────────────────────── Pagos de reservas ───────────────────────────

export const registerPaymentSchema = z.object({
  amount: z.number().int().min(1, "El monto debe ser positivo").max(100_000_000),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().max(300).optional(),
});

export type RegisterPaymentInput = z.output<typeof registerPaymentSchema>;

export async function registerPayment(orderId: string, input: RegisterPaymentInput, userId: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError("Pedido");
  if (order.status === "CANCELLED") {
    throw new ConflictError("ORDER_CANCELLED", "No se pueden registrar pagos de un pedido cancelado.");
  }
  return db.payment.create({
    data: {
      orderId,
      amount: input.amount,
      method: input.method,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      registeredById: userId,
    },
  });
}

export function allowedTransitions(status: string): OrderStatus[] {
  return TRANSITIONS[status as OrderStatus] ?? [];
}
