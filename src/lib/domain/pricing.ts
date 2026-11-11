/**
 * Precios — dominio puro.
 * Complejidad declarada: todas las funciones son O(n) sobre n = líneas del
 * carrito (n pequeño y acotado por el límite de items del pedido).
 */

export interface VariantPrice {
  id: string;
  name: string;
  priceDelta: number;
  isActive: boolean;
}

export interface PricedProduct {
  id: string;
  basePrice: number;
  variants?: VariantPrice[];
}

/**
 * Precio unitario de un producto con variante (delta aplicado).
 * Si la variante no existe o está inactiva, devuelve null: el caller decide
 * el rechazo (dato inválido → se rechaza el ítem, no se degrada en silencio).
 */
export function computeUnitPrice(
  product: PricedProduct,
  variantId: string | null,
): number | null {
  if (variantId === null) return product.basePrice;
  const variant = product.variants?.find((v) => v.id === variantId);
  if (!variant || !variant.isActive) return null;
  return product.basePrice + variant.priceDelta;
}

export type ComboPricingMode = "FIXED_PRICE" | "PERCENT_DISCOUNT";

export interface PricedCombo {
  id: string;
  pricingMode: ComboPricingMode;
  fixedPrice: number | null;
  discountPercent: number | null;
  items: { unitPrice: number; quantity: number }[];
}

/** Precio unitario del combo según su modo de precio (siempre en centavos). */
export function comboUnitPrice(combo: PricedCombo): number | null {
  if (combo.pricingMode === "FIXED_PRICE") {
    return combo.fixedPrice;
  }
  if (combo.discountPercent === null) return null;
  const sum = combo.items.reduce(
    (acc, it) => acc + it.unitPrice * it.quantity,
    0,
  );
  const factor = (100 - combo.discountPercent) / 100;
  return Math.round(sum * factor);
}

/** Suma de líneas de carrito → subtotal (sin descuento ni impuesto). */
export function subtotalOf(lines: { unitPrice: number; quantity: number }[]): number {
  return lines.reduce((acc, l) => acc + l.unitPrice * l.quantity, 0);
}
