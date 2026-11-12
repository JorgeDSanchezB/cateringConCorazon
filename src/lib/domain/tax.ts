/**
 * IVA — dominio puro. El porcentaje vive en SiteSetting.tax_percent y se
 * aplica SOLO si el flag tax_enabled está activo. El % aplicado se
 * snapshot en cada pedido (Order.taxPercent, null = IVA desactivado entonces).
 *
 * Modelo: precios SIN IVA incluido; el impuesto se suma sobre la base
 * (subtotal - descuento). Decisión documentada en ADR-006.
 */

export interface TaxApplication {
  /** Base imponible = subtotal - descuento. */
  taxableBase: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
}

export function applyTax(
  baseAfterDiscountCents: number,
  taxPercent: number,
): TaxApplication {
  if (baseAfterDiscountCents < 0) {
    throw new Error("La base imponible no puede ser negativa.");
  }
  if (!Number.isInteger(taxPercent) || taxPercent < 0 || taxPercent > 100) {
    throw new Error(`Porcentaje de IVA inválido: ${taxPercent}`);
  }
  const taxAmount = Math.round((baseAfterDiscountCents * taxPercent) / 100);
  return {
    taxableBase: baseAfterDiscountCents,
    taxPercent,
    taxAmount,
    total: baseAfterDiscountCents + taxAmount,
  };
}

/** Totales de carrito con IVA condicional (flag leído por el caller). */
export function totalsWithTax(
  subtotalCents: number,
  discountCents: number,
  opts: { taxEnabled: boolean; taxPercent: number },
): {
  subtotal: number;
  discountAmount: number;
  taxableBase: number;
  taxPercent: number | null;
  taxAmount: number;
  total: number;
} {
  const base = Math.max(0, subtotalCents - discountCents);
  if (!opts.taxEnabled) {
    return {
      subtotal: subtotalCents,
      discountAmount: discountCents,
      taxableBase: base,
      taxPercent: null,
      taxAmount: 0,
      total: base,
    };
  }
  const tax = applyTax(base, opts.taxPercent);
  return {
    subtotal: subtotalCents,
    discountAmount: discountCents,
    taxableBase: tax.taxableBase,
    taxPercent: tax.taxPercent,
    taxAmount: tax.taxAmount,
    total: tax.total,
  };
}
