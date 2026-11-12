"use client";

import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCart, cartSubtotal } from "@/components/ccc/store/cart";
import { useSiteFormat, useBootstrapData } from "@/components/ccc/shared/use-bootstrap";
import { ProductImage } from "./ui";

/**
 * Carrito lateral (drawer). El subtotal mostrado usa los snapshots del
 * carrito; el total REAL lo recalcula el servidor al crear el pedido.
 */
export function CartSheet({
  open,
  onOpenChange,
  onGoToCheckout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoToCheckout: () => void;
}) {
  const { money } = useSiteFormat();
  const items = useCart((s) => s.items);
  const setQuantity = useCart((s) => s.setQuantity);
  const removeItem = useCart((s) => s.removeItem);
  const clear = useCart((s) => s.clear);
  const bootstrap = useBootstrapData();
  const subtotal = cartSubtotal(items);
  const minOrder = bootstrap?.settings.globalMinOrderCents ?? 0;
  const remaining = Math.max(0, minOrder - subtotal);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="size-5" aria-hidden="true" />
            Tu pedido
          </SheetTitle>
          <SheetDescription>
            {items.length === 0
              ? "El carrito está vacío."
              : `${items.length} tipo(s) de producto listos para tu evento.`}
          </SheetDescription>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <ShoppingBag className="size-10 text-muted-foreground/50" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Explora el catálogo y añade lo rico para tu celebración.
            </p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Seguir explorando
            </Button>
          </div>
        ) : (
          <>
            <div
              className="ccc-scroll flex-1 space-y-3 overflow-y-auto px-4 py-2"
              aria-label="Ítems del carrito"
            >
              {items.map((item) => (
                <div
                  key={item.key}
                  className="flex gap-3 rounded-lg border bg-card p-3"
                >
                  <ProductImage
                    src={item.imageUrl}
                    alt={item.name}
                    ratio="aspect-square"
                    className="size-16 shrink-0 rounded-md"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {item.name}
                        {item.variantName ? (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {item.variantName}
                          </span>
                        ) : null}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeItem(item.key)}
                        aria-label={`Quitar ${item.name} del carrito`}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1" role="group" aria-label={`Cantidad de ${item.name}`}>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-7"
                          aria-label={`Restar una unidad de ${item.name}`}
                          onClick={() => setQuantity(item.key, item.quantity - 1)}
                        >
                          <Minus className="size-3" aria-hidden="true" />
                        </Button>
                        <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
                          {item.quantity}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-7"
                          aria-label={`Añadir una unidad de ${item.name}`}
                          onClick={() => setQuantity(item.key, item.quantity + 1)}
                        >
                          <Plus className="size-3" aria-hidden="true" />
                        </Button>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">
                        {money(item.unitPrice * item.quantity)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <SheetFooter className="mt-2 block space-y-3 border-t bg-muted/30 p-4">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold tabular-nums">{money(subtotal)}</span>
                </div>
                {remaining > 0 ? (
                  <p className="text-xs text-muted-foreground" role="status">
                    Te faltan {money(remaining)} para alcanzar el mínimo por evento.
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => {
                    onOpenChange(false);
                    onGoToCheckout();
                  }}
                >
                  Finalizar pedido
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    clear();
                    onOpenChange(false);
                  }}
                  aria-label="Vaciar carrito"
                >
                  Vaciar
                </Button>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
