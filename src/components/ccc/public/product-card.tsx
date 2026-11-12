"use client";

import { memo, useState } from "react";
import { Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCart } from "@/components/ccc/store/cart";
import { useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { AttributeChips, ProductImage } from "./ui";

/**
 * ProductCard — memoizada (regla Fase 5: React.memo SOLO en ProductCard,
 * ComboCard y filas de pedido). Renderiza atributos dinámicamente sin
 * conocer las claves: añadir "sinGluten" o "sabor" no toca esta card.
 */
export interface PublicProduct {
  id: string;
  name: string;
  type: "PRODUCT" | "BEVERAGE";
  basePrice: number;
  description: string | null;
  imageUrl: string | null;
  isFeatured: boolean;
  attributes: Record<string, unknown> | null;
  attributeSchemaVersion: number | null;
  category: { name: string; slug: string } | null;
  variants: { id: string; name: string; priceDelta: number }[];
}

function ProductCardInner({ product }: { product: PublicProduct }) {
  const { money } = useSiteFormat();
  const addItem = useCart((s) => s.addItem);
  const [variantId, setVariantId] = useState<string | null>(
    product.variants.length > 0 ? product.variants[0]!.id : null,
  );
  const variant = product.variants.find((v) => v.id === variantId) ?? null;
  const unitPrice = product.basePrice + (variant?.priceDelta ?? 0);

  function handleAdd() {
    addItem({
      kind: "product",
      productId: product.id,
      variantId,
      name: product.name,
      variantName: variant?.name ?? null,
      unitPrice,
      imageUrl: product.imageUrl,
    });
    toast.success(`${product.name} añadido al carrito`);
  }

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground theme-shadow transition-colors hover:border-primary/40">
      <div className="relative">
        <ProductImage src={product.imageUrl} alt={product.name} />
        {product.isFeatured ? (
          <span
            className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground"
            title="Favorito del catering"
          >
            <Star className="size-3 fill-current" aria-hidden="true" />
            Favorito
          </span>
        ) : null}
        {product.category ? (
          <span className="absolute right-3 top-3 rounded-full bg-background/85 px-2.5 py-1 text-xs text-foreground backdrop-blur-sm">
            {product.category.name}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-heading text-lg font-semibold leading-snug">{product.name}</h3>
        </div>

        {/* Campo opcional ausente → el bloque no se renderiza */}
        {product.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
        ) : null}

        <AttributeChips attributes={product.attributes} />

        {product.variants.length > 0 ? (
          <div className="space-y-1">
            <label htmlFor={`variant-${product.id}`} className="text-xs font-medium text-muted-foreground">
              Presentación
            </label>
            <Select value={variantId ?? undefined} onValueChange={setVariantId}>
              <SelectTrigger id={`variant-${product.id}`} className="h-9 w-full">
                <SelectValue placeholder="Elegir variante" />
              </SelectTrigger>
              <SelectContent>
                {product.variants.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                    {v.priceDelta !== 0
                      ? ` (${v.priceDelta > 0 ? "+" : "−"}${money(Math.abs(v.priceDelta))})`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <p className="text-lg font-bold tabular-nums">
            {money(unitPrice)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">c/u</span>
          </p>
          <Button onClick={handleAdd} size="sm" className="gap-1">
            <Plus className="size-4" aria-hidden="true" />
            Añadir
          </Button>
        </div>
      </div>
    </article>
  );
}

export const ProductCard = memo(ProductCardInner);
