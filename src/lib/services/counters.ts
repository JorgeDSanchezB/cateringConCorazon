import type { Prisma } from "@prisma/client";

/**
 * Secuencias atómicas (Counter). Se usan dentro de transacciones Prisma.
 * SQLite serializa escrituras → el upsert con increment es seguro.
 * (ADR-013: numeración interna configurable, sin integración SRI real.)
 */
export async function nextSequence(
  tx: Prisma.TransactionClient,
  key: "order" | "invoice",
): Promise<number> {
  const row = await tx.counter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
  });
  return row.value;
}

/** Padding de numeración de pedido (formato técnico estable: 6 dígitos). */
export const ORDER_SEQ_PADDING = 6;

export function formatOrderCode(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(ORDER_SEQ_PADDING, "0")}`;
}

/** Número de factura: prefijo + padding configurables (SiteSetting). */
export function formatInvoiceNumber(prefix: string, padding: number, seq: number): string {
  return `${prefix}${String(seq).padStart(padding, "0")}`;
}
