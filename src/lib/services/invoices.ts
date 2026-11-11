import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { ModuleDisabledError, NotFoundError, ConflictError, ValidationError } from "../errors";
import { formatInvoiceNumber, nextSequence } from "./counters";
import { getSiteSettings } from "../settings";
import { getFlag } from "../flags";

/**
 * Facturación INTERNA conmutable por flag `invoicing_enabled`
 * (sin integración SRI real — ADR-008). Numeración:
 * prefijo + secuencia con padding configurable (default 001-001-000000001).
 *
 * La numeración se genera DENTRO de la misma transacción que la operación
 * que la dispara (venta onsite / emisión manual) → sin huecos por carrera.
 */

export interface InvoiceOrderSnapshot {
  id: string;
  code: string;
  customerName: string | null;
  subtotal: number;
  discountAmount: number;
  taxPercent: number | null;
  taxAmount: number;
  total: number;
}

export async function issueInvoiceForOrder(
  tx: Prisma.TransactionClient,
  order: InvoiceOrderSnapshot,
  userId: string,
  customer?: { name?: string | null; taxId?: string | null },
): Promise<{ number: string }> {
  const invoicingEnabled = await getFlag("invoicing_enabled");
  if (!invoicingEnabled) {
    // Activada a mitad de operación: el flag se lee AQUÍ, en caliente.
    throw new ModuleDisabledError("invoicing_enabled", "Facturación");
  }
  const { values: settings } = await getSiteSettings();
  const seq = await nextSequence(tx, "invoice");
  const number = formatInvoiceNumber(
    settings.invoicePrefix,
    settings.invoicePadding,
    seq,
  );
  const existing = await tx.invoice.findFirst({ where: { orderId: order.id, status: "ACTIVE" } });
  if (existing) {
    throw new ConflictError(
      "INVOICE_ALREADY_ISSUED",
      `El pedido ${order.code} ya tiene la factura ${existing.number} activa.`,
    );
  }
  await tx.invoice.create({
    data: {
      number,
      orderId: order.id,
      customerName: customer?.name ?? order.customerName,
      customerTaxId: customer?.taxId ?? null,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      taxPercent: order.taxPercent ?? 0,
      taxAmount: order.taxAmount,
      total: order.total,
      status: "ACTIVE",
      issuedById: userId,
    },
  });
  return { number };
}

export async function voidInvoice(invoiceId: string, reason: string, userId: string) {
  if (reason.trim().length < 3) {
    throw new ValidationError([
      { field: "reason", message: "El motivo de anulación es obligatorio (mínimo 3 caracteres)." },
    ]);
  }
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new NotFoundError("Factura");
  if (invoice.status === "VOID") {
    throw new ConflictError("ALREADY_VOID", "La factura ya está anulada.");
  }
  return db.invoice.update({
    where: { id: invoiceId },
    data: { status: "VOID", voidedAt: new Date(), voidedReason: reason.trim() },
  });
}
