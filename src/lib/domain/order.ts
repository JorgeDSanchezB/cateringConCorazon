import { ValidationError, type ProblemField } from "../errors";
import { comboUnitPrice, computeUnitPrice } from "./pricing";

/**
 * FASE 4/5 — Constructor puro de líneas de pedido.
 *
 * Flujo: Controller → JSON → validación Zod → buildOrderLines (esta función,
 * que actúa como el núcleo del dominio) → snapshot persistido.
 *
 * Los precios NUNCA vienen del cliente: se recalculan contra el snapshot
 * del catálogo en el momento de crear el pedido.
 *
 * Tolerancia a fallos por ítem: un producto archivado/invisible entre
 * carrito y checkout RECHAZA ese ítem con error explícito; el resto del
 * pedido se evalúa igual y el cliente es avisado ítem por ítem.
 */

export interface CartItemInput {
  productId?: string;
  comboId?: string;
  variantId?: string | null;
  quantity: number;
}

export interface CatalogProductSnapshot {
  id: string;
  name: string;
  type: string;
  basePrice: number;
  isVisible: boolean;
  isArchived: boolean;
  variants: { id: string; name: string; priceDelta: number; isActive: boolean }[];
}

export interface CatalogComboSnapshot {
  id: string;
  name: string;
  pricingMode: "FIXED_PRICE" | "PERCENT_DISCOUNT";
  fixedPrice: number | null;
  discountPercent: number | null;
  isVisible: boolean;
  items: { productId: string; unitPrice: number; quantity: number; available: boolean }[];
}

export interface OrderLine {
  productId?: string;
  comboId?: string;
  productName: string;
  variantId?: string | null;
  variantName?: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export const cartItemSchema = z.object({
  productId: z.string().min(1).max(64).optional(),
  comboId: z.string().min(1).max(64).optional(),
  variantId: z.string().min(1).max(64).nullable().optional(),
  quantity: z.number().int().min(1).max(99),
}).refine(
  (v) => (v.productId !== undefined) !== (v.comboId !== undefined),
  { message: "Cada ítem debe referir exactamente a un productId o un comboId." },
);

// import tardío deliberado para mantener z arriba en el archivo leíble
import { z } from "zod";

export const cartSchema = z.object({
  items: z.array(cartItemSchema).min(1, "El pedido necesita al menos un ítem.").max(60),
});

export type ItemBuildError = {
  index: number;
  field: string;
  message: string;
  code?: string;
};

export function buildOrderLines(
  cart: CartItemInput[],
  catalog: {
    products: Map<string, CatalogProductSnapshot>;
    combos: Map<string, CatalogComboSnapshot>;
    combosEnabled: boolean;
    variantsEnabled: boolean;
  },
): { ok: true; lines: OrderLine[] } | { ok: false; itemErrors: ItemBuildError[] } {
  const itemErrors: ItemBuildError[] = [];
  const lines: OrderLine[] = [];

  cart.forEach((item, index) => {
    if (item.productId !== undefined) {
      const product = catalog.products.get(item.productId);
      if (!product) {
        itemErrors.push({ index, field: `items[${index}].productId`, message: "El producto ya no existe en el catálogo.", code: "PRODUCT_UNAVAILABLE" });
        return;
      }
      if (product.isArchived || !product.isVisible) {
        itemErrors.push({ index, field: `items[${index}].productId`, message: `«${product.name}» ya no está disponible.`, code: "PRODUCT_UNAVAILABLE" });
        return;
      }
      let variantName: string | null = null;
      let variantId: string | null = item.variantId ?? null;
      if (variantId !== null) {
        if (!catalog.variantsEnabled) {
          // Variantes desactivadas a mitad de operación: se rechaza el ítem,
          // no se degrada en silencio (el cliente debe quitar/reelegir).
          itemErrors.push({ index, field: `items[${index}].variantId`, message: "Las variantes están desactivadas; retire la variante del pedido.", code: "VARIANTS_DISABLED" });
          return;
        }
        const variant = product.variants.find((v) => v.id === variantId);
        if (!variant || !variant.isActive) {
          itemErrors.push({ index, field: `items[${index}].variantId`, message: "La variante elegida ya no está disponible.", code: "VARIANT_UNAVAILABLE" });
          return;
        }
        variantName = variant.name;
      } else {
        variantId = null;
      }
      const unitPrice = computeUnitPrice(product, variantId);
      if (unitPrice === null) {
        itemErrors.push({ index, field: `items[${index}]`, message: "No se pudo calcular el precio del ítem.", code: "PRICE_UNAVAILABLE" });
        return;
      }
      lines.push({
        productId: product.id,
        productName: product.name,
        variantId,
        variantName,
        unitPrice,
        quantity: item.quantity,
        lineTotal: unitPrice * item.quantity,
      });
      return;
    }

    // Combo
    const comboId = item.comboId!;
    if (!catalog.combosEnabled) {
      itemErrors.push({ index, field: `items[${index}].comboId`, message: "Los combos están desactivados temporalmente.", code: "COMBOS_DISABLED" });
      return;
    }
    const combo = catalog.combos.get(comboId);
    if (!combo || !combo.isVisible) {
      itemErrors.push({ index, field: `items[${index}].comboId`, message: "El combo ya no está disponible.", code: "COMBO_UNAVAILABLE" });
      return;
    }
    if (item.variantId) {
      itemErrors.push({ index, field: `items[${index}].variantId`, message: "Un combo no admite variantes.", code: "VARIANT_ON_COMBO" });
      return;
    }
    const unavailableConstituent = combo.items.find((it) => !it.available);
    if (unavailableConstituent) {
      itemErrors.push({ index, field: `items[${index}].comboId`, message: `El combo «${combo.name}» tiene un producto no disponible.`, code: "COMBO_PRODUCT_UNAVAILABLE" });
      return;
    }
    const unitPrice = comboUnitPrice(combo);
    if (unitPrice === null) {
      itemErrors.push({ index, field: `items[${index}].comboId`, message: "El combo tiene configuración de precio incompleta.", code: "COMBO_PRICE_INVALID" });
      return;
    }
    lines.push({
      comboId: combo.id,
      productName: combo.name,
      variantId: null,
      variantName: null,
      unitPrice,
      quantity: item.quantity,
      lineTotal: unitPrice * item.quantity,
    });
  });

  if (itemErrors.length > 0) return { ok: false, itemErrors };
  return { ok: true, lines };
}

/** Convierte itemErrors de buildOrderLines a ProblemFields para 422. */
export function itemErrorsToProblemFields(errors: ItemBuildError[]): ProblemField[] {
  return errors.map((e) => ({ field: e.field, message: e.message, code: e.code }));
}

/** Valida el carrito completo con Zod antes del build (shape). */
export function validateCartShape(cart: unknown): CartItemInput[] {
  const result = cartSchema.safeParse(cart);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => ({ field: i.path.join(".") || "(raíz)", message: i.message })),
    );
  }
  return result.data.items;
}
