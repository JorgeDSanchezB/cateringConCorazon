"use client";

import { memo } from "react";
import { Plus, Layers, BadgePercent } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/components/ccc/store/cart";
import { useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { ProductImage } from "./ui";

/**
 * ComboCard — memoizada (regla de render Fase 5). El precio unitario lo
 * calcula el SERVIDOR (comboUnitPrice en la API pública); aquí solo se pinta.
 */
export interface PublicCombo {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  pricingMode: "FIXED_PRICE" | "PERCENT_DISCOUNT";
  fixedPrice: number | null;
  discountPercent: number | null;
  unitPrice: number;
  items: {
    productId: string;
    productName: string;
    unitPrice: number;
    quantity: number;
    imageUrl: string | null;
  }[];
}

function ComboCardInner({ combo }: { combo: PublicCombo }) {
  const { money } = useSiteFormat();
  const addItem = useCart((s) => s.addItem);
  const originalSum = combo.items.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
  const savings = Math.max(0, originalSum - combo.unitPrice);

  function handleAdd() {
    addItem({
      kind: "combo",
      comboId: combo.id,
      name: combo.name,
      variantName: null,
      unitPrice: combo.unitPrice,
      imageUrl: combo.imageUrl,
    });
    toast.success(`${combo.name} añadido al carrito`);
  }

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground theme-shadow transition-colors hover:border-primary/40">
      <div className="relative">
        <ProductImage src={combo.imageUrl} alt={combo.name} />
        <span
          className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
          title={
            combo.pricingMode === "FIXED_PRICE"
              ? "Precio fijo por combo"
              : "Descuento porcentual sobre la suma de productos"
          }
        >
          {combo.pricingMode === "FIXED_PRICE" ? (
            <>
              <Layers className="size-3" aria-hidden="true" />
              Combo a precio fijo
            </>
          ) : (
            <>
              <BadgePercent className="size-3" aria-hidden="true" />
              {combo.discountPercent ?? 0}% de descuento
            </>
          )}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="font-heading text-lg font-semibold leading-snug">{combo.name}</h3>

        {combo.description ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">{combo.description}</p>
        ) : null}

        <ul className="space-y-1.5 text-sm" aria-label="Contenido del combo">
          {combo.items.map((it) => (
            <li key={it.productId} className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">
                <span className="font-medium tabular-nums text-foreground">{it.quantity}×</span>{" "}
                {it.productName}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {money(it.unitPrice * it.quantity)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-auto space-y-3 border-t pt-3">
          <div className="flex items-end justify-between gap-2">
            <div>
              {savings > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Antes: <s className="tabular-nums">{money(originalSum)}</s>
                </p>
              ) : null}
              <p className="text-xl font-bold tabular-nums">
                {money(combo.unitPrice)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">el combo</span>
              </p>
            </div>
            {savings > 0 ? (
              <Badge variant="outline" className="border-accent bg-accent/10 text-accent-foreground">
                Ahorras {money(savings)}
              </Badge>
            ) : null}
          </div>
          <Button onClick={handleAdd} className="w-full gap-1">
            <Plus className="size-4" aria-hidden="true" />
            Añadir combo
          </Button>
        </div>
      </div>
    </article>
  );
}

export const ComboCard = memo(ComboCardInner);
