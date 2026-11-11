"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Loader2, Search, UserRound } from "lucide-react";
import {
  useBodyMutation,
  useCursorList,
  useDetail,
} from "./data-hooks";
import {
  ChannelBadge,
  ErrorBlock,
  FormField,
  LoadMoreButton,
  LoadingBlock,
  MoneyInput,
  STATUS_LABELS,
  StatusBadge,
  ViewHeader,
} from "./ui-bits";
import { VirtualTable, type Column } from "./virtual-table";
import { useBootstrap, useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { ApiError } from "@/components/ccc/shared/api-client";
import { useSession } from "./session";

/**
 * Vista admin de PEDIDOS (canales EVENT_BOOKING y ONSITE).
 *
 * Los tipos reflejan las respuestas de /api/admin/orders (listado con _count)
 * y /api/admin/orders/:id (detalle con items/pagos/factura/allowedTransitions).
 */

interface OrderRow {
  id: string;
  code: string;
  channel: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  guests: number | null;
  subtotal: number;
  discountAmount: number;
  taxPercent: number | null;
  taxAmount: number;
  total: number;
  createdAt: string;
  stockApplied: boolean;
  event: { id: string; name: string } | null;
  discountCode: { code: string } | null;
  createdBy: { name: string } | null;
  _count: { items: number; payments: number; invoices: number };
}

interface OrderItemRow {
  id: string;
  productId: string | null;
  comboId: string | null;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

interface PaymentRow {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  receivedAt: string;
  registeredBy: { name: string } | null;
}

interface OrderDetail extends OrderRow {
  eventId: string | null;
  notes: string | null;
  items: OrderItemRow[];
  payments: PaymentRow[];
  invoice: {
    id: string;
    number: string;
    status: string;
    customerName: string | null;
    customerTaxId: string | null;
  } | null;
  event: { id: string; name: string; eventDate: string | null; location: string | null } | null;
  discountCode: { code: string; type: string; value: number } | null;
  /** Proviene de /api/admin/orders/:id (máquina de estados del servidor). */
  allowedTransitions: string[];
}

/** Etiquetas de método de pago (espejo de la spec: CASH|TRANSFER|OTHER). */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "PENDING_CONFIRMATION", label: "Pendiente" },
  { value: "CONFIRMED", label: "Confirmado" },
  { value: "IN_PREPARATION", label: "En preparación" },
  { value: "COMPLETED", label: "Completado" },
  { value: "CANCELLED", label: "Cancelado" },
];

const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: "EVENT_BOOKING", label: "Reservas web" },
  { value: "ONSITE", label: "Venta en evento" },
];

export default function OrdersView() {
  const fmt = useSiteFormat();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [channelFilter, setChannelFilter] = useState<string>("ALL");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Búsqueda con debounce (~300 ms) para no golpear la API por cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  // El valor "ALL" es solo un centinela del Select (Radix no admite value="").
  const params = useMemo(
    () => ({
      status: statusFilter === "ALL" ? undefined : statusFilter,
      channel: channelFilter === "ALL" ? undefined : channelFilter,
      q: q || undefined,
      limit: 30,
    }),
    [statusFilter, channelFilter, q],
  );
  const list = useCursorList<OrderRow>("/api/admin/orders", params);

  const columns: Column<OrderRow>[] = [
    {
      key: "code",
      header: "Código",
      width: "120px",
      render: (row) => <span className="font-mono text-xs font-medium">{row.code}</span>,
    },
    {
      key: "channel",
      header: "Canal",
      width: "140px",
      render: (row) => <ChannelBadge channel={row.channel} />,
    },
    {
      key: "status",
      header: "Estado",
      width: "140px",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "customer",
      header: "Cliente",
      width: "1fr",
      render: (row) =>
        row.customerName ?? (row.channel === "ONSITE" ? "Mostrador" : "—"),
    },
    {
      key: "eventDate",
      header: "Fecha evento",
      width: "130px",
      render: (row) => (row.channel === "ONSITE" ? "—" : fmt.date(row.eventDate)),
    },
    {
      key: "createdAt",
      header: "Creado",
      width: "170px",
      render: (row) => (
        <span className="text-muted-foreground">{fmt.datetime(row.createdAt)}</span>
      ),
    },
    {
      key: "total",
      header: "Total",
      width: "110px",
      align: "right",
      render: (row) => <span className="font-semibold">{fmt.money(row.total)}</span>,
    },
    {
      key: "items",
      header: "Ítems",
      width: "70px",
      align: "right",
      render: (row) => <span className="text-muted-foreground">{row._count.items}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <ViewHeader
        title="Pedidos"
        description="Reservas web y ventas registradas en evento. Haga clic en una fila para ver el detalle."
      />

      <section aria-label="Filtros" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Buscar por código o cliente…"
            className="pl-9"
            aria-label="Buscar pedidos"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar por estado">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los estados</SelectItem>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar por canal">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los canales</SelectItem>
            {CHANNEL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section aria-label="Listado de pedidos">
        {list.isLoading ? (
          <LoadingBlock label="Cargando pedidos…" />
        ) : list.isError ? (
          <ErrorBlock
            message="No se pudo cargar el listado de pedidos."
            onRetry={() => void list.refetch()}
          />
        ) : (
          <div className="space-y-3">
            <VirtualTable
              rows={list.items}
              columns={columns}
              rowKey={(row) => row.id}
              onRowClick={(row) => setSelectedId(row.id)}
              emptyMessage={
                q || statusFilter !== "ALL" || channelFilter !== "ALL"
                  ? "Ningún pedido coincide con los filtros aplicados."
                  : "Todavía no hay pedidos registrados."
              }
            />
            <LoadMoreButton
              onClick={list.loadMore}
              disabled={!list.hasMore}
              loading={list.isFetchingNextPage}
            />
          </div>
        )}
      </section>

      {selectedId ? (
        <OrderDetailDialog
          key={selectedId}
          orderId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}

/** Diálogo de detalle: montado por pedido (key) para resetear formularios. */
function OrderDetailDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const fmt = useSiteFormat();
  const { user } = useSession();
  const { data: bootstrap } = useBootstrap();
  const detail = useDetail<OrderDetail>(`/api/admin/orders/${orderId}`);

  const canChangeStatus = user?.role === "ADMIN" || user?.role === "STAFF";
  const canRegisterPayment = user?.role === "ADMIN" || user?.role === "CONTADOR";

  // ── Formulario de pago ──
  const [amount, setAmount] = useState<number | null>(null);
  const [method, setMethod] = useState<string>("CASH");
  const [reference, setReference] = useState("");

  // ── Formulario de factura ──
  const [fiscalName, setFiscalName] = useState("");
  const [fiscalTaxId, setFiscalTaxId] = useState("");

  // El endpoint del PATCH se deriva de la variable (evita cierres obsoletos).
  const statusMutation = useBodyMutation<
    { id: string; status: string },
    { orderId: string; status: string }
  >(
    "PATCH",
    (v) => `/api/admin/orders/${v.orderId}/status`,
    (v) => ({ status: v.status }),
    {
      successMessage: "Estado del pedido actualizado.",
      // Invalida listado y detalle (prefijo común /api/admin/orders).
      invalidate: [["/api/admin/orders"]],
    },
  );

  const paymentMutation = useBodyMutation<
    PaymentRow,
    { orderId: string; amount: number; method: string; reference?: string }
  >(
    "POST",
    (v) => `/api/admin/orders/${v.orderId}/payments`,
    (v) => ({ amount: v.amount, method: v.method, reference: v.reference || undefined }),
    {
      successMessage: "Pago registrado.",
      invalidate: [["/api/admin/orders"], ["/api/admin/payments"]],
    },
  );

  const invoiceMutation = useBodyMutation<
    { number: string; orderId: string },
    { orderId: string; customerName: string; customerTaxId: string }
  >(
    "POST",
    () => "/api/admin/invoices",
    (v) => ({
      orderId: v.orderId,
      customerName: v.customerName.trim() || undefined,
      customerTaxId: v.customerTaxId.trim() || undefined,
    }),
    {
      successMessage: "Factura emitida.",
      invalidate: [["/api/admin/orders"], ["/api/admin/invoices"]],
    },
  );

  const order = detail.data;

  function submitPayment() {
    if (!order || amount === null || amount <= 0) return;
    paymentMutation.mutate(
      { orderId: order.id, amount, method, reference: reference.trim() || undefined },
      {
        onSuccess: () => {
          setAmount(null);
          setMethod("CASH");
          setReference("");
        },
      },
    );
  }

  const amountError =
    paymentMutation.error instanceof ApiError
      ? paymentMutation.error.fieldMessage("amount")
      : null;
  const referenceError =
    paymentMutation.error instanceof ApiError
      ? paymentMutation.error.fieldMessage("reference")
      : null;

  const paid = order ? order.payments.reduce((acc, p) => acc + p.amount, 0) : 0;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          {order ? (
            <>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-base">{order.code}</span>
                <ChannelBadge channel={order.channel} />
                <StatusBadge status={order.status} />
              </DialogTitle>
              <DialogDescription>
                Creado el {fmt.datetime(order.createdAt)}
                {order.createdBy ? ` por ${order.createdBy.name}` : ""}
                {order.event ? ` · Evento: ${order.event.name}` : ""}
              </DialogDescription>
            </>
          ) : (
            <DialogTitle className="sr-only">Detalle del pedido</DialogTitle>
          )}
        </DialogHeader>

        {detail.isLoading ? (
          <LoadingBlock label="Cargando detalle…" />
        ) : detail.isError || !order ? (
          <ErrorBlock
            message="No se pudo cargar el detalle del pedido."
            onRetry={() => void detail.refetch()}
          />
        ) : (
          <div className="max-h-[72vh] space-y-6 overflow-y-auto pr-1 ccc-scroll">
            {/* Datos del evento (solo reservas web) */}
            {order.channel === "EVENT_BOOKING" ? (
              <section aria-label="Datos del evento" className="rounded-lg border p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
                  Datos del evento
                </h3>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                  <DetailField label="Cliente" value={order.customerName ?? "—"} />
                  <DetailField label="Teléfono" value={order.customerPhone ?? "—"} />
                  <DetailField label="Fecha del evento" value={fmt.date(order.eventDate)} />
                  <DetailField label="Lugar" value={order.eventLocation ?? "—"} />
                  <DetailField
                    label="Invitados"
                    value={order.guests !== null ? String(order.guests) : "—"}
                  />
                  <DetailField label="Notas" value={order.notes ?? "—"} />
                </dl>
              </section>
            ) : (
              <section aria-label="Datos de la venta" className="rounded-lg border p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <UserRound className="size-4 text-muted-foreground" aria-hidden />
                  Venta en evento
                </h3>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                  <DetailField label="Cliente" value={order.customerName ?? "Mostrador"} />
                  <DetailField label="Evento" value={order.event?.name ?? "Sin evento"} />
                </dl>
              </section>
            )}

            {/* Ítems (máx. 60 por spec: tabla simple sin virtualizar) */}
            <section aria-label="Ítems del pedido">
              <h3 className="mb-2 text-sm font-semibold">Ítems</h3>
              <div className="overflow-hidden rounded-lg border">
                <div
                  className="grid bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  style={{ gridTemplateColumns: "minmax(0,1fr) 100px 70px 110px" }}
                >
                  <div className="px-3 py-2 text-left">Producto</div>
                  <div className="px-3 py-2 text-right">P. unitario</div>
                  <div className="px-3 py-2 text-right">Cant.</div>
                  <div className="px-3 py-2 text-right">Total</div>
                </div>
                {order.items.map((it) => (
                  <div
                    key={it.id}
                    className="grid items-center border-t border-border/70 text-sm"
                    style={{ gridTemplateColumns: "minmax(0,1fr) 100px 70px 110px" }}
                  >
                    <div className="min-w-0 truncate px-3 py-2.5">
                      {it.productName}
                      {it.variantName ? (
                        <span className="text-muted-foreground"> · {it.variantName}</span>
                      ) : null}
                    </div>
                    <div className="px-3 py-2.5 text-right text-muted-foreground">
                      {fmt.money(it.unitPrice)}
                    </div>
                    <div className="px-3 py-2.5 text-right">{it.quantity}</div>
                    <div className="px-3 py-2.5 text-right font-medium">
                      {fmt.money(it.lineTotal)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Totales */}
            <section aria-label="Totales" className="rounded-lg border p-4">
              <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
                <TotalRow label="Subtotal" value={fmt.money(order.subtotal)} />
                <TotalRow
                  label={
                    order.discountCode
                      ? `Descuento (${order.discountCode.code})`
                      : "Descuento"
                  }
                  value={`− ${fmt.money(order.discountAmount)}`}
                  muted={order.discountAmount === 0}
                />
                <TotalRow
                  label={
                    order.taxPercent === null
                      ? "IVA (desactivado)"
                      : `IVA (${order.taxPercent}%)`
                  }
                  value={order.taxPercent === null ? "—" : fmt.money(order.taxAmount)}
                  muted={order.taxPercent === null}
                />
                <Separator className="my-2" />
                <div className="flex items-center justify-between text-base font-bold">
                  <span>TOTAL</span>
                  <span>{fmt.money(order.total)}</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {order.stockApplied ? "Stock consumido" : "Stock pendiente de consumo"}
              </p>
            </section>

            {/* Pagos */}
            <section aria-label="Pagos" className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Pagos</h3>
                <p className="text-sm text-muted-foreground">
                  Pagado: <span className="font-medium text-foreground">{fmt.money(paid)}</span>
                  {order.total - paid > 0
                    ? ` · Saldo pendiente: ${fmt.money(order.total - paid)}`
                    : ""}
                </p>
              </div>
              {order.payments.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Sin pagos registrados.
                </p>
              ) : (
                <ul className="space-y-2">
                  {order.payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">{fmt.money(p.amount)}</span>
                        <span className="text-muted-foreground">
                          {" "}· {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                        </span>
                        {p.reference ? (
                          <span className="text-muted-foreground"> · Ref: {p.reference}</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.registeredBy ? `${p.registeredBy.name} · ` : ""}
                        {fmt.datetime(p.receivedAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {canRegisterPayment && order.status !== "CANCELLED" ? (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <h4 className="mb-3 text-sm font-semibold">Registrar pago</h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr]">
                    <FormField label="Monto" required error={amountError}>
                      <MoneyInput
                        cents={amount}
                        onCentsChange={setAmount}
                        placeholder="0.00"
                        id={`payment-amount-${orderId}`}
                      />
                    </FormField>
                    <FormField label="Método" required>
                      <Select value={method} onValueChange={setMethod}>
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
                    </FormField>
                    <FormField label="Referencia" error={referenceError} hint="Opcional">
                      <Input
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="N.º de transferencia…"
                        aria-label="Referencia del pago"
                      />
                    </FormField>
                  </div>
                  <Button
                    className="mt-3"
                    disabled={
                      paymentMutation.isPending || amount === null || amount <= 0
                    }
                    onClick={submitPayment}
                  >
                    {paymentMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : null}
                    Registrar pago
                  </Button>
                </div>
              ) : null}
            </section>

            {/* Cambio de estado */}
            <section aria-label="Estado del pedido" className="rounded-lg border p-4">
              <h3 className="mb-3 text-sm font-semibold">Estado del pedido</h3>
              {!canChangeStatus ? (
                <p className="text-sm text-muted-foreground">
                  Solo lectura: su rol no puede cambiar el estado de los pedidos.
                </p>
              ) : order.allowedTransitions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Estado terminal: no hay transiciones disponibles.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {order.allowedTransitions.map((s) => (
                    <Button
                      key={s}
                      variant={s === "CANCELLED" ? "destructive" : "default"}
                      size="sm"
                      disabled={statusMutation.isPending}
                      title={
                        s === "CANCELLED" && order.stockApplied
                          ? "Cancelación con stock aplicado: el stock se reingresa"
                          : undefined
                      }
                      onClick={() =>
                        statusMutation.mutate({ orderId: order.id, status: s })
                      }
                    >
                      {statusMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : null}
                      {STATUS_LABELS[s] ?? s}
                    </Button>
                  ))}
                </div>
              )}
              {statusMutation.error ? (
                <p className="mt-2 text-xs text-destructive" role="alert">
                  {statusMutation.error instanceof ApiError &&
                  statusMutation.error.fieldMessage("status")
                    ? statusMutation.error.fieldMessage("status")
                    : null}
                </p>
              ) : null}
            </section>

            {/* Facturación */}
            <InvoiceSection
              order={order}
              invoicingEnabled={bootstrap?.flags?.invoicing_enabled ?? false}
              flagsLoaded={Boolean(bootstrap)}
              canIssue={canRegisterPayment}
              fiscalName={fiscalName}
              fiscalTaxId={fiscalTaxId}
              onFiscalNameChange={setFiscalName}
              onFiscalTaxIdChange={setFiscalTaxId}
              onIssue={() =>
                invoiceMutation.mutate({
                  orderId: order.id,
                  customerName: fiscalName,
                  customerTaxId: fiscalTaxId,
                })
              }
              issuing={invoiceMutation.isPending}
              issueError={invoiceMutation.error ?? null}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Sección de facturación condicionada al flag y al rol. */
function InvoiceSection({
  order,
  invoicingEnabled,
  flagsLoaded,
  canIssue,
  fiscalName,
  fiscalTaxId,
  onFiscalNameChange,
  onFiscalTaxIdChange,
  onIssue,
  issuing,
  issueError,
}: {
  order: OrderDetail;
  invoicingEnabled: boolean;
  flagsLoaded: boolean;
  canIssue: boolean;
  fiscalName: string;
  fiscalTaxId: string;
  onFiscalNameChange: (v: string) => void;
  onFiscalTaxIdChange: (v: string) => void;
  onIssue: () => void;
  issuing: boolean;
  issueError: Error | null;
}) {
  const errorField =
    issueError instanceof ApiError
      ? issueError.fieldMessage("customerName") ??
        issueError.fieldMessage("customerTaxId") ??
        issueError.fieldMessage("orderId")
      : null;

  if (!flagsLoaded) return null; // flags aún cargando: no mostrar nada aún
  if (!invoicingEnabled) {
    return (
      <p className="text-xs text-muted-foreground">
        Módulo de facturación desactivado.
      </p>
    );
  }
  return (
    <section aria-label="Facturación" className="rounded-lg border p-4">
      <h3 className="mb-3 text-sm font-semibold">Facturación</h3>
      {order.invoice ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-mono">{order.invoice.number}</span>
          <StatusBadge status={order.invoice.status} />
          {order.invoice.customerName ? (
            <span className="text-muted-foreground">
              · {order.invoice.customerName}
              {order.invoice.customerTaxId ? ` (${order.invoice.customerTaxId})` : ""}
            </span>
          ) : null}
        </div>
      ) : order.status === "CANCELLED" ? (
        <p className="text-sm text-muted-foreground">
          No se puede facturar un pedido cancelado.
        </p>
      ) : !canIssue ? (
        <p className="text-sm text-muted-foreground">
          Requiere rol Administrador o Contador para emitir la factura.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Nombre fiscal" hint="Opcional (usa el del pedido si se omite)">
              <Input
                value={fiscalName}
                onChange={(e) => onFiscalNameChange(e.target.value)}
                placeholder="Nombre del cliente"
                aria-label="Nombre fiscal para la factura"
              />
            </FormField>
            <FormField label="RUC / CI" hint="Opcional">
              <Input
                value={fiscalTaxId}
                onChange={(e) => onFiscalTaxIdChange(e.target.value)}
                placeholder="1700000000001"
                aria-label="RUC o cédula para la factura"
              />
            </FormField>
          </div>
          {errorField ? (
            <p className="text-xs text-destructive" role="alert">
              {errorField}
            </p>
          ) : null}
          <Button size="sm" disabled={issuing} onClick={onIssue}>
            {issuing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Emitir factura
          </Button>
        </div>
      )}
    </section>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

function TotalRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className={muted ? "text-muted-foreground" : "font-medium"}>{value}</span>
    </div>
  );
}
