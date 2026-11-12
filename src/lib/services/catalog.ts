import { db } from "../db";
import type { CatalogComboSnapshot, CatalogProductSnapshot } from "../domain/order";

/**
 * Snapshot del catálogo para construir pedidos con precios del SERVIDOR.
 * O(productos + combos) lecturas indexadas; pedido acotado (≤60 ítems).
 */
export async function loadCatalogSnapshot(): Promise<{
  products: Map<string, CatalogProductSnapshot>;
  combos: Map<string, CatalogComboSnapshot>;
}> {
  const [products, combos] = await Promise.all([
    db.product.findMany({
      where: { isArchived: false },
      select: {
        id: true, name: true, type: true, basePrice: true,
        isVisible: true, isArchived: true,
        variants: { where: { isActive: true } },
      },
    }),
    db.combo.findMany({
      where: { isVisible: true },
      select: {
        id: true, name: true, pricingMode: true, fixedPrice: true,
        discountPercent: true, isVisible: true,
        items: {
          select: {
            quantity: true,
            product: { select: { id: true, basePrice: true, isVisible: true, isArchived: true } },
          },
        },
      },
    }),
  ]);

  const productMap = new Map<string, CatalogProductSnapshot>(
    products.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        type: p.type,
        basePrice: p.basePrice,
        isVisible: p.isVisible,
        isArchived: p.isArchived,
        variants: p.variants.map((v) => ({
          id: v.id, name: v.name, priceDelta: v.priceDelta, isActive: v.isActive,
        })),
      },
    ]),
  );

  const comboMap = new Map<string, CatalogComboSnapshot>(
    combos.map((c) => [
      c.id,
      {
        id: c.id,
        name: c.name,
        pricingMode: c.pricingMode as "FIXED_PRICE" | "PERCENT_DISCOUNT",
        fixedPrice: c.fixedPrice,
        discountPercent: c.discountPercent,
        isVisible: c.isVisible,
        items: c.items.map((it) => ({
          productId: it.product.id,
          unitPrice: it.product.basePrice,
          quantity: it.quantity,
          available: it.product.isVisible && !it.product.isArchived,
        })),
      },
    ]),
  );

  return { products: productMap, combos: comboMap };
}

/**
 * Consumo de stock de una lista de líneas (combos expandidos a productos).
 * Devuelve solo productos con seguimiento potencial de inventario.
 */
export function expandConsumption(
  lines: { productId?: string; comboId?: string; quantity: number }[],
  combos: Map<string, CatalogComboSnapshot>,
): { productId: string; productName: string; quantity: number }[] {
  const totals = new Map<string, { productName: string; quantity: number }>();
  for (const line of lines) {
    if (line.productId) {
      const entry = totals.get(line.productId);
      if (entry) entry.quantity += line.quantity;
      else totals.set(line.productId, { productName: line.productId, quantity: line.quantity });
    } else if (line.comboId) {
      const combo = combos.get(line.comboId);
      if (combo) {
        for (const item of combo.items) {
          const entry = totals.get(item.productId);
          if (entry) entry.quantity += item.quantity * line.quantity;
          else totals.set(item.productId, { productName: item.productId, quantity: item.quantity * line.quantity });
        }
      }
    }
  }
  // productName se resuelve con nombres reales al llamar con snapshot completa.
  return [...totals.entries()].map(([productId, v]) => ({ productId, productName: v.productName, quantity: v.quantity }));
}
