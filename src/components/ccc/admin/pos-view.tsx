"use client";

import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  ImageOff,
  Loader2,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { buildUrl, useAdminMutation, type CursorPage } from "./data-hooks";
import { ErrorBlock, LoadMoreButton, LoadingBlock, ViewHeader } from "./ui-bits";
import { useBootstrap, useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { api } from "@/components/ccc/shared/api-client";
import { useSession } from "./session";

/**
 * PUNTO DE VENTA — venta directa en el evento (canal ONSITE).
 * Objetivo: registrar una venta en menos de 30 segundos.
 *
 * El ticket vive en estado local (NO en el carrito público). Los precios son
 * siempre los del servidor: el IVA del ticket es SOLO un preview; el backend
 * recalcula totales y es la fuente de verdad.
 */

interface CatalogVariant {
  id: string;
  name: string;
  priceDelta: number;
}

interface CatalogProduct {
  id: string;
  name: string;
  type: string;
  basePrice: number;
  description: string | null;
  imageUrl: string | null;
  isFeatured: boolean;
  category: { name: string; slug: string } | null;
  variants: CatalogVariant[];
}

interface PublicCombo {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  pricingMode: string;
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

interface AdminEvent {
  id: string;
  name: string;
  eventDate: string;
  location: string;
  isActive: boolean;
  orderCount: number;
}

/** Línea local del ticket (precios congelados del catálogo). */
interface TicketLine {
  key: string;
  productId?: string;
  comboId?: string;
  variantId?: string;
  name: string;
  variantName?: string;
  unitPrice: number;
  quantity: number;
}

/** Ítem candidato a línea de ticket (sin clave ni cantidad). */
interface TicketItemInput {
  productId?: string;
  comboId?: string;
  variantId?: string;
  name: string;
  variantName?: string;
  unitPrice: number;
}

interface OnsiteSaleBody {
  items: { productId?: string; comboId?: string; variantId?: string; quantity: number }[];
  paymentMethod: string;
  issueInvoice: boolean;
  eventId?: string;
  customerName?: string;
}

interface OnsiteSaleResponse {
  order: {
    id: string;
    code: string;
    total: number;
    subtotal: number;
    taxPercent: number | null;
    taxAmount: number;
    status: string;
  };
  invoiceNumber: string | null;
}

/** Etiquetas de método de pago (espejo de la spec: CASH|TRANSFER|OTHER). */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

const TICKET_LINES_MAX_H = "max-h-52 overflow-y-auto ccc-scroll pr-1";

export default function PosView() {
  const fmt = useSiteFormat();
  const { user } = useSession();
  const { data: bootstrap } = useBootstrap();
  const flags = bootstrap?.flags;
  const variantsEnabled = flags?.variants_enabled ?? false;
  const combosEnabled = flags?.combos_enabled ?? false;
  const invoicingEnabled = flags?.invoicing_enabled ?? false;
  const taxEnabled = flags?.tax_enabled ?? false;

  const [tab, setTab] = useState<"products" | "combos">("products");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");

  // Debounce ~300 ms para la búsqueda del catálogo.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  // Catálogo público (endpoint público, paginado por cursor).
  // Sin genéricos explícitos: TPageParam se infiere de initialPageParam.
  const catalog = useInfiniteQuery({
    queryKey: ["pos-catalog", q],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<CursorPage<CatalogProduct>>(
        buildUrl("/api/public/catalog", {
          limit: 48,
          q: q || undefined,
          cursor: pageParam ?? undefined,
        }),
      ),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
    enabled: tab === "products",
  });
  const catalogItems = useMemo(
    () => catalog.data?.pages.flatMap((p) => p.items) ?? [],
    [catalog.data],
  );

  // Combos públicos (lista vacía si el flag está apagado).
  const combos = useInfiniteQuery({
    queryKey: ["pos-combos"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<CursorPage<PublicCombo>>(
        buildUrl("/api/public/combos", {
          limit: 24,
          cursor: pageParam ?? undefined,
        }),
      ),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
    enabled: tab === "combos" && combosEnabled,
  });
  const comboItems = useMemo(
    () => combos.data?.pages.flatMap((p) => p.items) ?? [],
    [combos.data],
  );

  // Eventos próximos para atribuir la venta (Select opcional).
  const eventsQuery = useQuery<CursorPage<AdminEvent>>({
    queryKey: ["pos-events"],
    queryFn: () => api<CursorPage<AdminEvent>>(buildUrl("/api/admin/events", { upcoming: "true", limit: 50 })),
    staleTime: 60_000,
  });

  // ── Estado local del ticket ──
  const [ticket, setTicket] = useState<TicketLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [customerName, setCustomerName] = useState("");
  const [eventId, setEventId] = useState<string>("NONE");
  const [issueInvoice, setIssueInvoice] = useState(false);
  const [variantProduct, setVariantProduct] = useState<CatalogProduct | null>(null);
  const [receipt, setReceipt] = useState<OnsiteSaleResponse | null>(null);

  const canSell = user?.role === "ADMIN" || user?.role === "STAFF";

  function addToTicket(item: TicketItemInput) {
    setTicket((prev) => {
      const key = item.productId
        ? `p:${item.productId}:${item.variantId ?? ""}`
        : `c:${item.comboId}`;
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) =>
          l.key === key ? { ...l, quantity: Math.min(99, l.quantity + 1) } : l,
        );
      }
      return [...prev, { ...item, key, quantity: 1 }];
    });
  }

  function changeQty(key: string, delta: number) {
    // El stepper nunca baja de 1: la línea se quita solo con el botón de papelera.
    setTicket((prev) =>
      prev.map((l) =>
        l.key === key
          ? { ...l, quantity: Math.min(99, Math.max(1, l.quantity + delta)) }
          : l,
      ),
    );
  }

  function removeLine(key: string) {
    setTicket((prev) => prev.filter((l) => l.key !== key));
  }

  const subtotal = ticket.reduce((acc, l) => acc + l.unitPrice * l.quantity, 0);
  // Preview de IVA en cliente: el servidor recalcula y es la fuente de verdad.
  const taxPercent = bootstrap?.settings.taxPercent ?? null;
  const taxPreview =
    taxEnabled && taxPercent !== null ? Math.round((subtotal * taxPercent) / 100) : 0;
  const totalPreview = subtotal + taxPreview;

  const saleMutation = useAdminMutation<OnsiteSaleResponse, OnsiteSaleBody>(
    "POST",
    "/api/admin/orders/onsite",
    {
      successMessage: "Venta registrada.",
      invalidate: [
        ["/api/admin/orders"],
        ["/api/admin/inventory"],
        ["/api/admin/overview"],
      ],
      onDone: (data) => setReceipt(data),
    },
  );

  function submitSale() {
    if (ticket.length === 0 || !canSell) return;
    saleMutation.mutate({
      items: ticket.map((l) => ({
        productId: l.productId,
        comboId: l.comboId,
        variantId: l.variantId,
        quantity: l.quantity,
      })),
      paymentMethod,
      issueInvoice: issueInvoice && invoicingEnabled,
      eventId: eventId === "NONE" ? undefined : eventId,
      customerName: customerName.trim() || undefined,
    });
  }

  /** Nueva venta (o cierre del comprobante): limpia el ticket local. */
  function resetSale() {
    setTicket([]);
    setCustomerName("");
    setEventId("NONE");
    setIssueInvoice(false);
    setPaymentMethod("CASH");
    setReceipt(null);
  }

  return (
    <div className="space-y-6">
      <ViewHeader
        title="Punto de venta"
        description="Venta directa en el evento: toque un producto, revise el ticket y registre la venta."
      />

      {!canSell && user ? (
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          role="alert"
        >
          Su rol no puede registrar ventas en el punto de venta (requiere Administrador o
          Staff).
        </p>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* ── Catálogo (izquierda; en móvil va después del ticket) ── */}
        <section aria-label="Catálogo" className="order-2 min-w-0 lg:order-1">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            {combosEnabled ? (
              <Tabs value={tab} onValueChange={(v) => setTab(v as "products" | "combos")}>
                <TabsList>
                  <TabsTrigger value="products">Productos</TabsTrigger>
                  <TabsTrigger value="combos">Combos</TabsTrigger>
                </TabsList>
              </Tabs>
            ) : null}
            {tab === "products" ? (
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Buscar producto…"
                  className="pl-9"
                  aria-label="Buscar producto"
                />
              </div>
            ) : null}
          </div>

          {tab === "products" ? (
            <>
              {catalog.isLoading ? (
                <LoadingBlock label="Cargando catálogo…" />
              ) : catalog.isError ? (
                <ErrorBlock
                  message="No se pudo cargar el catálogo."
                  onRetry={() => void catalog.refetch()}
                />
              ) : catalogItems.length === 0 ? (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  {q ? "Ningún producto coincide con la búsqueda." : "El catálogo está vacío."}
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {catalogItems.map((p) => (
                      <CatalogCard
                        key={p.id}
                        name={p.name}
                        imageUrl={p.imageUrl}
                        price={fmt.money(p.basePrice)}
                        category={p.category?.name ?? null}
                        onClick={() => {
                          if (p.variants.length > 0 && variantsEnabled) {
                            setVariantProduct(p);
                          } else {
                            addToTicket({ productId: p.id, name: p.name, unitPrice: p.basePrice });
                          }
                        }}
                      />
                    ))}
                  </div>
                  <LoadMoreButton
                    onClick={() => void catalog.fetchNextPage()}
                    disabled={!catalog.hasNextPage}
                    loading={catalog.isFetchingNextPage}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              {!combosEnabled ? (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Módulo de combos desactivado.
                </p>
              ) : combos.isLoading ? (
                <LoadingBlock label="Cargando combos…" />
              ) : combos.isError ? (
                <ErrorBlock
                  message="No se pudo cargar los combos."
                  onRetry={() => void combos.refetch()}
                />
              ) : comboItems.length === 0 ? (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No hay combos visibles.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {comboItems.map((c) => (
                      <CatalogCard
                        key={c.id}
                        name={c.name}
                        imageUrl={c.imageUrl}
                        price={fmt.money(c.unitPrice)}
                        category={
                          c.pricingMode === "FIXED_PRICE"
                            ? "Combo precio fijo"
                            : c.discountPercent !== null
                              ? `Combo −${c.discountPercent}%`
                              : "Combo"
                        }
                        onClick={() =>
                          addToTicket({ comboId: c.id, name: c.name, unitPrice: c.unitPrice })
                        }
                      />
                    ))}
                  </div>
                  <LoadMoreButton
                    onClick={() => void combos.fetchNextPage()}
                    disabled={!combos.hasNextPage}
                    loading={combos.isFetchingNextPage}
                  />
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Ticket (derecha; en móvil primero y pegado arriba) ── */}
        <aside
          aria-label="Ticket de la venta"
          className="order-1 self-start lg:order-2 lg:sticky lg:top-6"
        >
          <Card className="sticky top-0 z-20 max-h-[70vh] overflow-y-auto ccc-scroll lg:max-h-[calc(100vh-3rem)] lg:top-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingCart className="size-4 text-muted-foreground" aria-hidden />
                Ticket
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {ticket.length} {ticket.length === 1 ? "línea" : "líneas"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ticket.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Toque un producto del catálogo para añadirlo al ticket.
                </p>
              ) : (
                <ul className={TICKET_LINES_MAX_H}>
                  {ticket.map((l) => (
                    <li
                      key={l.key}
                      className="flex items-start justify-between gap-2 border-b py-2.5 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {l.name}
                          {l.variantName ? (
                            <span className="text-muted-foreground"> · {l.variantName}</span>
                          ) : null}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-7"
                            aria-label={`Restar uno de ${l.name}`}
                            onClick={() => changeQty(l.key, -1)}
                          >
                            <Minus className="size-3.5" aria-hidden />
                          </Button>
                          <span className="w-8 text-center text-sm font-medium tabular-nums">
                            {l.quantity}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-7"
                            aria-label={`Sumar uno de ${l.name}`}
                            onClick={() => changeQty(l.key, 1)}
                          >
                            <Plus className="size-3.5" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            aria-label={`Quitar ${l.name} del ticket`}
                            onClick={() => removeLine(l.key)}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-muted-foreground">
                          {fmt.money(l.unitPrice)} c/u
                        </p>
                        <p className="text-sm font-semibold">
                          {fmt.money(l.unitPrice * l.quantity)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{fmt.money(subtotal)}</span>
                </div>
                {taxEnabled && taxPercent !== null ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      IVA ({taxPercent}%) · preview
                    </span>
                    <span>{fmt.money(taxPreview)}</span>
                  </div>
                ) : null}
                <Separator />
                <div className="flex items-baseline justify-between text-lg font-bold">
                  <span>TOTAL</span>
                  <span>{fmt.money(totalPreview)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Método de pago
                  </Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="w-full" aria-label="Método de pago">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pos-customer" className="text-xs font-medium text-muted-foreground">
                    Cliente (opcional)
                  </Label>
                  <Input
                    id="pos-customer"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Nombre para el pedido"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pos-event" className="text-xs font-medium text-muted-foreground">
                    Evento (opcional)
                  </Label>
                  <Select value={eventId} onValueChange={setEventId}>
                    <SelectTrigger id="pos-event" className="w-full" aria-label="Evento">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Sin evento</SelectItem>
                      {(eventsQuery.data?.items ?? []).map((ev) => (
                        <SelectItem key={ev.id} value={ev.id}>
                          {ev.name} · {fmt.date(ev.eventDate)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {invoicingEnabled ? (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="pos-invoice"
                      checked={issueInvoice}
                      onCheckedChange={(v) => setIssueInvoice(v === true)}
                    />
                    <Label htmlFor="pos-invoice" className="text-sm font-normal">
                      Emitir factura
                    </Label>
                  </div>
                ) : null}

                <Button
                  size="lg"
                  className="w-full"
                  disabled={
                    ticket.length === 0 || saleMutation.isPending || !canSell || !user
                  }
                  onClick={submitSale}
                >
                  {saleMutation.isPending ? (
                    <Loader2 className="size-5 animate-spin" aria-hidden />
                  ) : null}
                  Registrar venta
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  El stock se descuenta al registrar la venta.
                </p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* ── Mini-diálogo de elección de variante ── */}
      {variantProduct ? (
        <VariantPickerDialog
          product={variantProduct}
          onAdd={(line) => addToTicket(line)}
          onClose={() => setVariantProduct(null)}
        />
      ) : null}

      {/* ── Comprobante de venta ── */}
      {receipt ? (
        <>
          {/* Impresión: solo el comprobante (oculta el resto de la página). */}
          <style>{`
@media print {
  body * { visibility: hidden !important; }
  .pos-receipt-print, .pos-receipt-print * { visibility: visible !important; }
  .pos-receipt-print {
    position: absolute !important;
    inset: auto !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    max-height: none !important;
    overflow: visible !important;
    transform: none !important;
    border: none !important;
    box-shadow: none !important;
  }
}
`}</style>
          <Dialog open onOpenChange={(v) => !v && resetSale()}>
            <DialogContent className="pos-receipt-print max-w-sm">
              <DialogHeader>
                <DialogTitle>Venta registrada</DialogTitle>
                <DialogDescription>Comprobante de venta en evento</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-center">
                <p className="font-mono text-2xl font-bold">{receipt.order.code}</p>
                <p className="text-3xl font-bold">{fmt.money(receipt.order.total)}</p>
                <p className="text-sm text-muted-foreground">
                  {PAYMENT_METHOD_LABELS[paymentMethod] ?? paymentMethod}
                  {customerName.trim() ? ` · ${customerName.trim()}` : ""}
                </p>
                {receipt.invoiceNumber ? (
                  <p className="text-sm">
                    Factura <span className="font-mono">{receipt.invoiceNumber}</span>
                  </p>
                ) : null}
              </div>
              <DialogFooter className="mt-2">
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="size-4" aria-hidden />
                  Imprimir
                </Button>
                <Button onClick={resetSale}>
                  <Plus className="size-4" aria-hidden />
                  Nueva venta
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}

/** Tarjeta de catálogo reutilizable (producto o combo). */
function CatalogCard({
  name,
  imageUrl,
  price,
  category,
  onClick,
}: {
  name: string;
  imageUrl: string | null;
  price: string;
  category: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group overflow-hidden rounded-lg border bg-card text-left shadow-xs transition hover:border-primary/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Añadir ${name} al ticket`}
    >
      <div className="relative aspect-video overflow-hidden bg-muted">
        {imageUrl ? (
           
          <img
            src={imageUrl}
            alt={name}
            className="size-full object-cover transition group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-6" aria-hidden />
          </div>
        )}
        <span
          className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow-sm transition group-hover:opacity-100"
          aria-hidden
        >
          <Plus className="size-4" />
        </span>
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 text-sm font-medium leading-tight">{name}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{price}</span>
          {category ? (
            <Badge variant="outline" className="whitespace-nowrap text-[11px]">
              {category}
            </Badge>
          ) : null}
        </div>
      </div>
    </button>
  );
}

/** Mini-diálogo para elegir variante (precio = basePrice + priceDelta). */
function VariantPickerDialog({
  product,
  onAdd,
  onClose,
}: {
  product: CatalogProduct;
  onAdd: (line: TicketItemInput) => void;
  onClose: () => void;
}) {
  const fmt = useSiteFormat();
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Elegir variante</DialogTitle>
          <DialogDescription>{product.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-between"
            onClick={() => {
              onAdd({ productId: product.id, name: product.name, unitPrice: product.basePrice });
              onClose();
            }}
          >
            <span>Sin variante</span>
            <span className="text-muted-foreground">{fmt.money(product.basePrice)}</span>
          </Button>
          {product.variants.map((v) => (
            <Button
              key={v.id}
              variant="outline"
              className="w-full justify-between"
              onClick={() => {
                onAdd({
                  productId: product.id,
                  variantId: v.id,
                  name: product.name,
                  variantName: v.name,
                  unitPrice: product.basePrice + v.priceDelta,
                });
                onClose();
              }}
            >
              <span>{v.name}</span>
              <span className="text-muted-foreground">
                {fmt.money(product.basePrice + v.priceDelta)}
                {v.priceDelta !== 0
                  ? ` (${v.priceDelta > 0 ? "+" : "−"}${fmt.money(Math.abs(v.priceDelta))})`
                  : ""}
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
