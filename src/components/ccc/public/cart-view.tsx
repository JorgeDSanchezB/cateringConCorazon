"use client";

import { memo, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgePercent,
  CheckCircle2,
  Copy,
  MessageCircle,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCart, cartSubtotal } from "@/components/ccc/store/cart";
import { useBootstrapData, useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { api, ApiError, apiErrorMessage } from "@/components/ccc/shared/api-client";
import { FormField } from "@/components/ccc/admin/ui-bits";
import { hashHref } from "@/components/ccc/shared/hash-router";
import { PageContainer, ProductImage } from "./ui";

/**
 * Carrito + checkout público (reserva EVENT_BOOKING):
 * 1. Edita cantidades.
 * 2. Aplica código de descuento (validado contra el subtotal en el SERVIDOR).
 * 3. Completa los datos del evento.
 * 4. POST /api/public/orders → pedido registrado + mensaje de WhatsApp
 *    estructurado generado por el servidor (el cliente solo abre la URL).
 *
 * Tolerancia a fallos: errores por campo (422), ítems rechazados uno a uno
 * (producto archivado entre carrito y checkout), descuento expirado con
 * razón clara, y WhatsApp sin número → fallback de copiar el mensaje.
 */

interface DiscountValidation {
  valid: true;
  code: string;
  type: "PERCENT" | "FIXED_AMOUNT";
  amountCents: number;
  label: string;
}

interface OrderResponse {
  orderCode: string;
  status: string;
  subtotal: number;
  discountAmount: number;
  taxPercent: number | null;
  taxAmount: number;
  total: number;
  whatsappAvailable: boolean;
  whatsappUrl: string | null;
  message: string;
}

const CartRow = memo(function CartRow({
  item,
  onQuantity,
  onRemove,
  lineTotal,
}: {
  item: { key: string; name: string; variantName?: string | null; unitPrice: number; quantity: number; imageUrl?: string | null };
  onQuantity: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  lineTotal: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
      <ProductImage
        src={item.imageUrl}
        alt={item.name}
        ratio="aspect-square"
        className="size-16 shrink-0 rounded-lg"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {item.name}
          {item.variantName ? (
            <span className="block text-xs font-normal text-muted-foreground">{item.variantName}</span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">{item.quantity} unidad(es)</p>
      </div>
      <div className="flex items-center gap-1" role="group" aria-label={`Cantidad de ${item.name}`}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          aria-label={`Restar una unidad de ${item.name}`}
          onClick={() => onQuantity(item.key, item.quantity - 1)}
        >
          <Minus className="size-3.5" aria-hidden="true" />
        </Button>
        <span className="w-8 text-center text-sm font-medium tabular-nums" aria-live="polite">
          {item.quantity}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          aria-label={`Añadir una unidad de ${item.name}`}
          onClick={() => onQuantity(item.key, item.quantity + 1)}
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <p className="w-24 text-right text-sm font-bold tabular-nums">{lineTotal}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          aria-label={`Quitar ${item.name}`}
          onClick={() => onRemove(item.key)}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
});

export function CartView({ navigate }: { navigate: (to: string) => void }) {
  const bootstrap = useBootstrapData();
  const { money } = useSiteFormat();
  const settings = bootstrap?.settings;
  const flags = bootstrap?.flags;

  const items = useCart((s) => s.items);
  const setQuantity = useCart((s) => s.setQuantity);
  const removeItem = useCart((s) => s.removeItem);
  const clear = useCart((s) => s.clear);

  const subtotal = cartSubtotal(items);
  const minOrder = settings?.globalMinOrderCents ?? 0;
  const belowMinimum = subtotal < minOrder;

  // ── Formulario del evento ──
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [guests, setGuests] = useState("");
  const [notes, setNotes] = useState("");

  // ── Descuento ──
  const [codeInput, setCodeInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<DiscountValidation | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [discountLoading, setDiscountLoading] = useState(false);

  // ── Envío ──
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [itemErrors, setItemErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState<OrderResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const discountCents = appliedDiscount ? Math.min(appliedDiscount.amountCents, subtotal) : 0;
  const taxBase = subtotal - discountCents;
  const taxEnabled = flags?.tax_enabled ?? false;
  const taxPercent = settings?.taxPercent ?? 0;
  const estimatedTax = taxEnabled ? Math.round((taxBase * taxPercent) / 100) : 0;
  const estimatedTotal = taxBase + estimatedTax;

  const canSubmit =
    !submitting &&
    !belowMinimum &&
    items.length > 0 &&
    customerName.trim().length >= 2;

  async function applyDiscount() {
    const code = codeInput.trim();
    if (code === "") return;
    setDiscountLoading(true);
    setDiscountError(null);
    setAppliedDiscount(null);
    try {
      const result = await api<DiscountValidation>("/api/public/discounts/validate", {
        method: "POST",
        body: { code, subtotalCents: subtotal },
        retry: false,
      });
      setAppliedDiscount(result);
      toast.success(`Código ${result.code} aplicado: ${result.label}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.fieldMessage("code") ?? err.problem.detail : "No se pudo validar el código.";
      setDiscountError(message);
    } finally {
      setDiscountLoading(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setFieldErrors({});
    setItemErrors([]);
    try {
      const response = await api<OrderResponse>("/api/public/orders", {
        method: "POST",
        retry: false,
        body: {
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || undefined,
          eventDate: eventDate ? new Date(`${eventDate}T12:00:00`).toISOString() : undefined,
          eventLocation: eventLocation.trim() || undefined,
          guests: guests ? Number(guests) : undefined,
          notes: notes.trim() || undefined,
          discountCode: appliedDiscount?.code ?? undefined,
          items: items.map((item) =>
            item.kind === "product"
              ? {
                  productId: item.productId,
                  variantId: item.variantId ?? null,
                  quantity: item.quantity,
                }
              : { comboId: item.comboId, quantity: item.quantity },
          ),
        },
      });
      setSuccess(response);
      clear();
      toast.success(`Pedido ${response.orderCode} registrado`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (err instanceof ApiError) {
        const byField: Record<string, string> = {};
        const byItem: string[] = [];
        for (const fieldError of err.problem.errors ?? []) {
          if (fieldError.field.startsWith("items[")) {
            byItem.push(fieldError.message);
          } else {
            byField[fieldError.field] = fieldError.message;
          }
        }
        setFieldErrors(byField);
        setItemErrors(byItem);
        toast.error(err.problem.detail || "No se pudo registrar el pedido.");
      } else {
        toast.error(apiErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function copyMessage() {
    if (!success) return;
    try {
      await navigator.clipboard.writeText(success.message);
      setCopied(true);
      toast.success("Mensaje copiado al portapapeles");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("No se pudo copiar automáticamente; selecciona y copia el texto manualmente.");
    }
  }

  const summaryRows = useMemo(() => {
    if (success) {
      return [
        { label: "Subtotal", value: money(success.subtotal) },
        ...(success.discountAmount > 0
          ? [{ label: `Descuento`, value: `-${money(success.discountAmount)}` }]
          : []),
        ...(success.taxPercent !== null
          ? [{ label: `IVA (${success.taxPercent}%)`, value: money(success.taxAmount) }]
          : []),
        { label: "Total", value: money(success.total), bold: true },
      ];
    }
    return [
      { label: "Subtotal", value: money(subtotal) },
      ...(discountCents > 0
        ? [{ label: `Descuento (${appliedDiscount?.code})`, value: `-${money(discountCents)}` }]
        : []),
      ...(taxEnabled ? [{ label: `IVA (${taxPercent}%) — estimado`, value: money(estimatedTax) }] : []),
      { label: "Total estimado", value: money(estimatedTotal), bold: true },
    ];
  }, [success, money, subtotal, discountCents, appliedDiscount, taxEnabled, taxPercent, estimatedTax, estimatedTotal]);

  // ── Panel de éxito ──
  if (success) {
    return (
      <PageContainer>
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="rounded-2xl border bg-card p-8 text-center theme-shadow">
            <CheckCircle2 className="mx-auto size-12 text-emerald-600" aria-hidden="true" />
            <h1 className="mt-4 font-heading text-2xl font-bold sm:text-3xl">
              ¡Pedido registrado!
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              Tu código de reserva es{" "}
              <strong className="font-bold text-foreground">{success.orderCode}</strong>. Para
              confirmar fecha, lugar y detalle, envíalo por WhatsApp con un clic.
            </p>

            <ul className="mx-auto mt-6 max-w-xs space-y-1.5 text-sm">
              {summaryRows.map((row) => (
                <li key={row.label} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className={`tabular-nums ${row.bold ? "font-bold" : "font-medium"}`}>
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>

            {success.whatsappAvailable && success.whatsappUrl ? (
              <Button
                asChild
                size="lg"
                className="mt-6 w-full bg-[#25D366] text-[#05231A] hover:bg-[#1eb759] sm:w-auto"
              >
                <a href={success.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" aria-hidden="true" />
                  Enviar por WhatsApp
                </a>
              </Button>
            ) : (
              <div className="mt-6 space-y-3 rounded-xl border border-dashed p-4 text-left">
                <p className="text-sm font-semibold">
                  WhatsApp no está configurado por el negocio en este momento.
                </p>
                <p className="text-sm text-muted-foreground">
                  Copia el mensaje de tu pedido y envíalo cuando el contacto esté
                  disponible; tu reserva {success.orderCode} ya quedó registrada.
                </p>
                <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-xs text-foreground ccc-scroll">
                  {success.message}
                </pre>
                <Button variant="outline" onClick={copyMessage} className="w-full gap-2">
                  {copied ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                  {copied ? "Copiado" : "Copiar mensaje"}
                </Button>
              </div>
            )}

            <div className="mt-6">
              <Button asChild variant="ghost">
                <a href={hashHref("inicio")} onClick={(e) => { e.preventDefault(); navigate("inicio"); }}>
                  Volver al inicio
                </a>
              </Button>
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  // ── Carrito vacío ──
  if (items.length === 0) {
    return (
      <PageContainer>
        <div className="mx-auto max-w-md space-y-6 text-center">
          <ShoppingBag className="mx-auto size-12 text-muted-foreground/50" aria-hidden="true" />
          <h1 className="font-heading text-2xl font-bold">Tu carrito está vacío</h1>
          <p className="text-sm text-muted-foreground">
            Explora el menú y añade los sabores de tu próxima celebración.
          </p>
          <Button asChild size="lg">
            <a href={hashHref("catalogo")} onClick={(e) => { e.preventDefault(); navigate("catalogo"); }}>
              Ir al catálogo
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </PageContainer>
    );
  }

  // ── Checkout ──
  return (
    <PageContainer>
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Tu pedido
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Revisa los ítems, completa los datos del evento y envíalo por WhatsApp.
          </p>
        </header>

        {itemErrors.length > 0 ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Algunos ítems ya no están disponibles</AlertTitle>
            <AlertDescription>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {itemErrors.map((message, i) => (
                  <li key={i}>{message}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs">
                Quita los ítems marcados del carrito para poder enviar tu pedido.
              </p>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-8">
            {/* Ítems */}
            <section aria-labelledby="items-pedido" className="space-y-3">
              <h2 id="items-pedido" className="font-heading text-lg font-semibold">
                Ítems del pedido
              </h2>
              <div className="space-y-3">
                {items.map((item) => (
                  <CartRow
                    key={item.key}
                    item={item}
                    onQuantity={setQuantity}
                    onRemove={removeItem}
                    lineTotal={money(item.unitPrice * item.quantity)}
                  />
                ))}
              </div>
            </section>

            {/* Datos del evento */}
            <section aria-labelledby="datos-evento" className="space-y-4">
              <h2 id="datos-evento" className="font-heading text-lg font-semibold">
                Datos de tu evento
              </h2>
              <div className="grid gap-4 rounded-xl border bg-card p-5 theme-shadow sm:grid-cols-2">
                <FormField label="Nombre de contacto" required error={fieldErrors.customerName ?? null}>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    maxLength={80}
                    placeholder="Tu nombre y apellido"
                    autoComplete="name"
                  />
                </FormField>
                <FormField label="Teléfono" error={fieldErrors.customerPhone ?? null}>
                  <Input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    maxLength={20}
                    placeholder="+593 …"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </FormField>
                <FormField label="Fecha del evento" error={fieldErrors.eventDate ?? null}>
                  <Input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                  />
                </FormField>
                <FormField label="Lugar del evento" error={fieldErrors.eventLocation ?? null}>
                  <Input
                    value={eventLocation}
                    onChange={(e) => setEventLocation(e.target.value)}
                    maxLength={200}
                    placeholder="Sector, ciudad o salón"
                  />
                </FormField>
                <FormField label="Invitados (aprox.)" error={fieldErrors.guests ?? null}>
                  <Input
                    type="number"
                    min={1}
                    max={10000}
                    value={guests}
                    onChange={(e) => setGuests(e.target.value)}
                    placeholder="50"
                    inputMode="numeric"
                  />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField label="Notas" error={fieldErrors.notes ?? null}>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      maxLength={600}
                      placeholder="Alergias, horarios de montaje, cualquier detalle que debamos saber…"
                      rows={3}
                    />
                  </FormField>
                </div>
              </div>
            </section>
          </div>

          {/* Resumen */}
          <aside aria-labelledby="resumen-pedido" className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div
              id="resumen-pedido"
              className="space-y-4 rounded-xl border bg-card p-5 theme-shadow"
            >
              <h2 className="font-heading text-lg font-semibold">Resumen</h2>

              {flags?.discounts_enabled ? (
                <div className="space-y-2">
                  <Label htmlFor="discount-code" className="text-xs font-medium text-muted-foreground">
                    Código de descuento
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="discount-code"
                      value={codeInput}
                      onChange={(e) => {
                        setCodeInput(e.target.value.toUpperCase());
                        setDiscountError(null);
                      }}
                      placeholder="BIENVENIDA10"
                      maxLength={40}
                      className="font-mono uppercase"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={applyDiscount}
                      disabled={discountLoading || codeInput.trim() === ""}
                    >
                      <BadgePercent className="size-4" aria-hidden="true" />
                      Aplicar
                    </Button>
                  </div>
                  {discountError ? (
                    <p className="text-xs text-destructive" role="alert">
                      {discountError}
                    </p>
                  ) : null}
                  {appliedDiscount ? (
                    <p className="flex items-center justify-between text-xs text-emerald-700" role="status">
                      <span className="font-medium">{appliedDiscount.code} · {appliedDiscount.label}</span>
                      <button
                        type="button"
                        className="underline underline-offset-2 hover:no-underline"
                        onClick={() => {
                          setAppliedDiscount(null);
                          setCodeInput("");
                        }}
                      >
                        Quitar
                      </button>
                    </p>
                  ) : null}
                </div>
              ) : null}

              <ul className="space-y-1.5 border-t pt-3 text-sm">
                {summaryRows.map((row) => (
                  <li key={row.label} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className={`tabular-nums ${row.bold ? "text-base font-bold" : "font-medium"}`}>
                      {row.value}
                    </span>
                  </li>
                ))}
              </ul>

              {belowMinimum ? (
                <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900" role="status">
                  El pedido no alcanza el mínimo por evento ({money(minOrder)}). Te faltan{" "}
                  <strong>{money(minOrder - subtotal)}</strong>.
                </p>
              ) : null}

              <Button
                className="w-full"
                size="lg"
                onClick={handleSubmit}
                disabled={!canSubmit}
                aria-disabled={!canSubmit}
              >
                {submitting ? "Registrando pedido…" : "Registrar y enviar por WhatsApp"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Sin pago en línea: registramos tu pedido y la confirmación final se
                hace por WhatsApp.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </PageContainer>
  );
}
