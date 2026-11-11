"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Carrito (Zustand + persist en localStorage "ccc-cart").
 * Guarda snapshots de nombre/precio para pintar rápido; el TOTAL real lo
 * recalcula siempre el servidor al crear el pedido (nunca se confía en el
 * cliente). Los combos se guardan por comboId.
 */

export interface CartItem {
  /** Clave estable: `p:<productId>:<variantId|->` o `c:<comboId>`. */
  key: string;
  kind: "product" | "combo";
  productId?: string;
  comboId?: string;
  variantId?: string | null;
  name: string;
  variantName?: string | null;
  /** Snapshot para visualización (centavos). */
  unitPrice: number;
  quantity: number;
  imageUrl?: string | null;
}

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "key" | "quantity">, quantity?: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

export function cartItemKey(input: {
  kind: "product" | "combo";
  productId?: string;
  comboId?: string;
  variantId?: string | null;
}): string {
  if (input.kind === "product") return `p:${input.productId}:${input.variantId ?? "-"}`;
  return `c:${input.comboId}`;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item, quantity = 1) =>
        set((state) => {
          const key = cartItemKey(item);
          const existing = state.items.find((i) => i.key === key);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.key === key ? { ...i, quantity: Math.min(99, i.quantity + quantity) } : i,
              ),
            };
          }
          return { items: [...state.items, { ...item, key, quantity }] };
        }),
      setQuantity: (key, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => i.key !== key)
              : state.items.map((i) =>
                  i.key === key ? { ...i, quantity: Math.min(99, quantity) } : i,
                ),
        })),
      removeItem: (key) => set((state) => ({ items: state.items.filter((i) => i.key !== key) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: "ccc-cart",
      version: 1,
    },
  ),
);

export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((acc, i) => acc + i.quantity, 0);
}
