"use client";

import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarRange,
  Pencil,
  Plus,
  RefreshCw,
  ShoppingCart,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  buildUrl,
  useAdminMutation,
  useCursorList,
  useDetail,
  useEndpointMutation,
} from "@/components/ccc/admin/data-hooks";
import {
  EmptyBlock,
  ErrorBlock,
  FormField,
  LoadingBlock,
  LoadMoreButton,
  MoneyInput,
  STATUS_LABELS,
  StatusBadge,
  ViewHeader,
} from "@/components/ccc/admin/ui-bits";
import { VirtualTable, type Column } from "@/components/ccc/admin/virtual-table";
import { useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { ApiError } from "@/components/ccc/shared/api-client";

// Formas de las respuestas.
type PayMethod = "CASH" | "TRANSFER" | "OTHER";

interface PaymentRow {
  id: string;
  orderId: string | null;
  amount: number;
  method: PayMethod;
  reference: string | null;
  notes: string | null;
  receivedAt: string;
  order: { code: string } | null;
  registeredBy: { name: string } | null;
}

interface ExpenseRow {
  id: string;
  concept: string;
  amount: number;
  category: string | null;
  spentAt: string;
  notes: string | null;
  createdAt: string;
  createdBy: { name: string } | null;
}

interface AccountingSummary {
  incomeCents: number;
  incomeCount: number;
  expenseCents: number;
  expenseCount: number;
  balanceCents: number;
  completedOrders: number;
  topProducts: { productName: string; quantity: number; revenueCents: number }[];
  channelSplit: { channel: string; totalCents: number; count: number }[];
  paymentMethodSplit: { method: string; totalCents: number; count: number }[];
}

const CHANNEL_LABELS: Record<string, string> = {
  ONSITE: "Venta en evento",
  EVENT_BOOKING: "Reserva web",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** yyyy-mm-dd → ISO de inicio de día (hora local del navegador). */
function dayStartIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toISOString();
}

/** yyyy-mm-dd → ISO de fin de día (incluye el día completo). */
function dayEndIso(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999`).toISOString();
}

/** Fecha local (mediodía) para guardar sin desfase de zona horaria. */
function dayMiddayIso(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toISOString();
}

export default function AccountingView() {
  const fmt = useSiteFormat();

  // Rango de fechas (yyyy-mm-dd) y rango aplicado a las consultas.
  const [fromInput, setFromInput] = useState(() => `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}-01`);
  const [toInput, setToInput] = useState(() => toDateInput(new Date()));
  const [applied, setApplied] = useState(() => ({
    from: `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}-01`,
    to: toDateInput(new Date()),
  }));

  const rangeInvalid = fromInput > toInput;
  const summaryEndpoint = buildUrl("/api/admin/accounting/summary", {
    from: dayStartIso(applied.from),
    to: dayEndIso(applied.to),
  });
  const listParams = { from: dayStartIso(applied.from), to: dayEndIso(applied.to) };

  const summary = useDetail<AccountingSummary>(summaryEndpoint);
  const payments = useCursorList<PaymentRow>("/api/admin/payments", listParams);
  const expenses = useCursorList<ExpenseRow>("/api/admin/expenses", listParams);

  // Diálogo de ingreso manual.
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [pAmount, setPAmount] = useState<number | null>(null);
  const [pMethod, setPMethod] = useState<PayMethod>("CASH");
  const [pReference, setPReference] = useState("");
  const [pOrderId, setPOrderId] = useState("");
  const [pNotes, setPNotes] = useState("");

  // Diálogo de gasto (creación y edición comparten campos).
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseEditing, setExpenseEditing] = useState<ExpenseRow | null>(null);
  const [eConcept, setEConcept] = useState("");
  const [eAmount, setEAmount] = useState<number | null>(null);
  const [eCategory, setECategory] = useState("");
  const [eDate, setEDate] = useState(() => toDateInput(new Date()));
  const [eNotes, setENotes] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null);

  const invalidateAll = [[summaryEndpoint], ["/api/admin/payments"], ["/api/admin/expenses"], ["/api/admin/overview"]] as unknown[][];

  const createPayment = useAdminMutation<PaymentRow, {
    orderId: string | null;
    amount: number;
    method: PayMethod;
    reference: string | null;
    notes: string | null;
  }>("POST", "/api/admin/payments", {
    successMessage: "Ingreso manual registrado.",
    invalidate: invalidateAll,
    onDone: () => setPaymentOpen(false),
  });

  const createExpense = useAdminMutation<ExpenseRow, {
    concept: string;
    amount: number;
    category: string | null;
    spentAt: string;
    notes: string | null;
  }>("POST", "/api/admin/expenses", {
    successMessage: "Gasto registrado.",
    invalidate: invalidateAll,
    onDone: () => setExpenseOpen(false),
  });

  const patchExpense = useAdminMutation<ExpenseRow, {
    id: string;
    concept: string;
    amount: number;
    category: string | null;
    spentAt: string;
    notes: string | null;
  }>("PATCH", (body) => `/api/admin/expenses/${body.id}`, {
    successMessage: "Gasto actualizado.",
    invalidate: invalidateAll,
    onDone: () => setExpenseOpen(false),
  });

  const deleteExpense = useEndpointMutation<{ ok: boolean }, string>(
    "DELETE",
    (id) => `/api/admin/expenses/${id}`,
    {
      successMessage: "Gasto eliminado.",
      invalidate: invalidateAll,
    },
  );

  function openPaymentDialog() {
    setPAmount(null);
    setPMethod("CASH");
    setPReference("");
    setPOrderId("");
    setPNotes("");
    setPaymentOpen(true);
  }

  function openExpenseDialog(expense: ExpenseRow | null) {
    setExpenseEditing(expense);
    if (expense) {
      setEConcept(expense.concept);
      setEAmount(expense.amount);
      setECategory(expense.category ?? "");
      setEDate(toDateInput(new Date(expense.spentAt)));
      setENotes(expense.notes ?? "");
    } else {
      setEConcept("");
      setEAmount(null);
      setECategory("");
      setEDate(toDateInput(new Date()));
      setENotes("");
    }
    setExpenseOpen(true);
  }

  const fieldErr = (mutation: { error: unknown }, field: string) =>
    mutation.error instanceof ApiError ? mutation.error.fieldMessage(field) : null;

  const submitPayment = () => {
    if (pAmount === null || pAmount < 1) return;
    createPayment.mutate({
      orderId: pOrderId.trim() === "" ? null : pOrderId.trim(),
      amount: pAmount,
      method: pMethod,
      reference: pReference.trim() === "" ? null : pReference.trim(),
      notes: pNotes.trim() === "" ? null : pNotes.trim(),
    });
  };

  const submitExpense = () => {
    if (eAmount === null || eAmount < 1) return;
    const body = {
      concept: eConcept.trim(),
      amount: eAmount,
      category: eCategory.trim() === "" ? null : eCategory.trim(),
      spentAt: dayMiddayIso(eDate),
      notes: eNotes.trim() === "" ? null : eNotes.trim(),
    };
    if (expenseEditing) patchExpense.mutate({ id: expenseEditing.id, ...body });
    else createExpense.mutate(body);
  };

  const paymentColumns: Column<PaymentRow>[] = [
    { key: "receivedAt", header: "Fecha", width: "150px", render: (p) => <span className="text-muted-foreground">{fmt.datetime(p.receivedAt)}</span> },
    { key: "order", header: "Pedido", width: "130px", render: (p) => p.order ? <span className="font-mono text-xs">{p.order.code}</span> : <span className="italic text-muted-foreground">Manual</span> },
    { key: "amount", header: "Monto", width: "100px", align: "right", render: (p) => <span className="font-semibold tabular-nums">{fmt.money(p.amount)}</span> },
    { key: "method", header: "Método", width: "120px", render: (p) => <StatusBadge status={p.method} /> },
    { key: "registeredBy", header: "Registrado por", width: "140px", render: (p) => <span className="text-muted-foreground">{p.registeredBy?.name ?? "—"}</span> },
    { key: "reference", header: "Referencia", render: (p) => <span className="truncate text-muted-foreground">{p.reference ?? "—"}</span> },
  ];

  const expenseColumns: Column<ExpenseRow>[] = [
    { key: "spentAt", header: "Fecha", width: "140px", render: (e) => <span className="text-muted-foreground">{fmt.datetime(e.spentAt)}</span> },
    { key: "concept", header: "Concepto", width: "1.4fr", render: (e) => <span className="font-medium">{e.concept}</span> },
    { key: "category", header: "Categoría", width: "120px", render: (e) => <span className="text-muted-foreground">{e.category ?? "—"}</span> },
    { key: "amount", header: "Monto", width: "100px", align: "right", render: (e) => <span className="font-semibold tabular-nums">{fmt.money(e.amount)}</span> },
    { key: "createdBy", header: "Creado por", width: "140px", render: (e) => <span className="text-muted-foreground">{e.createdBy?.name ?? "—"}</span> },
    {
      key: "actions",
      header: "Acciones",
      width: "150px",
      render: (e) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => openExpenseDialog(e)} aria-label={`Editar ${e.concept}`}>
            <Pencil className="size-4" aria-hidden />
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteTarget(e)}
            aria-label={`Eliminar ${e.concept}`}
          >
            <Trash2 className="size-4" aria-hidden />
            Eliminar
          </Button>
        </div>
      ),
    },
  ];

  const s = summary.data;

  return (
    <div className="space-y-6">
      <ViewHeader
        title="Contabilidad"
        description="Ingresos (pagos), egresos (gastos) y balance del rango de fechas seleccionado."
      />

      {/* Rango de fechas */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <div className="space-y-1.5">
          <label htmlFor="acc-from" className="text-xs font-medium text-muted-foreground">
            Desde
          </label>
          <Input
            id="acc-from"
            type="date"
            value={fromInput}
            max={toInput}
            onChange={(e) => setFromInput(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="acc-to" className="text-xs font-medium text-muted-foreground">
            Hasta
          </label>
          <Input
            id="acc-to"
            type="date"
            value={toInput}
            min={fromInput}
            onChange={(e) => setToInput(e.target.value)}
            className="w-44"
          />
        </div>
        <Button
          onClick={() => setApplied({ from: fromInput, to: toInput })}
          disabled={rangeInvalid}
        >
          <RefreshCw className="size-4" aria-hidden />
          Refrescar
        </Button>
        {rangeInvalid ? (
          <p className="text-sm text-destructive" role="alert">
            La fecha «desde» debe ser anterior o igual a la fecha «hasta».
          </p>
        ) : null}
      </div>

      {/* Tarjetas de resumen */}
      {summary.isLoading ? (
        <LoadingBlock label="Calculando resumen…" />
      ) : summary.isError || !s ? (
        <ErrorBlock message="No se pudo calcular el resumen contable." onRetry={() => void summary.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="gap-3">
              <CardHeader>
                <CardDescription>Ingresos</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl text-emerald-700">
                  <ArrowDownLeft className="size-5" aria-hidden />
                  {fmt.money(s.incomeCents)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{s.incomeCount} pago(s) en el rango.</p>
              </CardContent>
            </Card>
            <Card className="gap-3">
              <CardHeader>
                <CardDescription>Egresos</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl text-rose-700">
                  <ArrowUpRight className="size-5" aria-hidden />
                  {fmt.money(s.expenseCents)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{s.expenseCount} gasto(s) en el rango.</p>
              </CardContent>
            </Card>
            <Card className="gap-3">
              <CardHeader>
                <CardDescription>Balance</CardDescription>
                <CardTitle
                  className={`flex items-center gap-2 text-2xl ${s.balanceCents >= 0 ? "text-emerald-700" : "text-rose-700"}`}
                >
                  <Wallet className="size-5" aria-hidden />
                  {fmt.money(s.balanceCents)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {s.balanceCents >= 0 ? "Resultado positivo del rango." : "Resultado negativo del rango."}
                </p>
              </CardContent>
            </Card>
            <Card className="gap-3">
              <CardHeader>
                <CardDescription>Pedidos completados</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <ShoppingCart className="size-5" aria-hidden />
                  {s.completedOrders}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Creados dentro del rango.</p>
              </CardContent>
            </Card>
          </div>

          {/* Desgloses */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top productos</CardTitle>
                <CardDescription>En pedidos completados del rango.</CardDescription>
              </CardHeader>
              <CardContent>
                {s.topProducts.length === 0 ? (
                  <EmptyBlock message="Sin ventas en el rango." />
                ) : (
                  <ul className="divide-y">
                    {s.topProducts.map((p) => (
                      <li key={p.productName} className="flex items-center justify-between gap-2 py-2">
                        <span className="min-w-0 truncate text-sm">{p.productName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {p.quantity} u. · {fmt.money(p.revenueCents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por canal</CardTitle>
                <CardDescription>Pedidos completados por origen.</CardDescription>
              </CardHeader>
              <CardContent>
                {s.channelSplit.length === 0 ? (
                  <EmptyBlock message="Sin pedidos completados." />
                ) : (
                  <ul className="divide-y">
                    {s.channelSplit.map((c) => (
                      <li key={c.channel} className="flex items-center justify-between gap-2 py-2">
                        <span className="text-sm">{CHANNEL_LABELS[c.channel] ?? c.channel}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {c.count} · {fmt.money(c.totalCents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por método de pago</CardTitle>
                <CardDescription>Pagos registrados en el rango.</CardDescription>
              </CardHeader>
              <CardContent>
                {s.paymentMethodSplit.length === 0 ? (
                  <EmptyBlock message="Sin pagos en el rango." />
                ) : (
                  <ul className="divide-y">
                    {s.paymentMethodSplit.map((m) => (
                      <li key={m.method} className="flex items-center justify-between gap-2 py-2">
                        <span className="text-sm">{STATUS_LABELS[m.method] ?? m.method}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {m.count} · {fmt.money(m.totalCents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Tabs de pagos y gastos */}
      <Tabs defaultValue="pagos">
        <TabsList>
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
          <TabsTrigger value="gastos">Gastos</TabsTrigger>
        </TabsList>

        <TabsContent value="pagos" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button onClick={openPaymentDialog}>
              <Plus className="size-4" aria-hidden />
              Registrar ingreso manual
            </Button>
          </div>
          {payments.isLoading ? (
            <LoadingBlock label="Cargando pagos…" />
          ) : payments.isError ? (
            <ErrorBlock message="No se pudo cargar los pagos." onRetry={() => void payments.refetch()} />
          ) : (
            <>
              <VirtualTable
                rows={payments.items}
                columns={paymentColumns}
                rowKey={(p) => p.id}
                emptyMessage="Sin pagos en el rango seleccionado."
              />
              <LoadMoreButton onClick={payments.loadMore} disabled={!payments.hasMore} loading={payments.isFetchingNextPage} />
            </>
          )}
        </TabsContent>

        <TabsContent value="gastos" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => openExpenseDialog(null)}>
              <Plus className="size-4" aria-hidden />
              Nuevo gasto
            </Button>
          </div>
          {expenses.isLoading ? (
            <LoadingBlock label="Cargando gastos…" />
          ) : expenses.isError ? (
            <ErrorBlock message="No se pudo cargar los gastos." onRetry={() => void expenses.refetch()} />
          ) : (
            <>
              <VirtualTable
                rows={expenses.items}
                columns={expenseColumns}
                rowKey={(e) => e.id}
                emptyMessage="Sin gastos en el rango seleccionado."
              />
              <LoadMoreButton onClick={expenses.loadMore} disabled={!expenses.hasMore} loading={expenses.isFetchingNextPage} />
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Diálogo: ingreso manual */}
      <Dialog open={paymentOpen} onOpenChange={(v) => !v && setPaymentOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar ingreso manual</DialogTitle>
            <DialogDescription>
              Pago fuera de un pedido (ej: anticipo presencial). Opcionalmente puede vincularlo a un pedido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="Monto" required error={fieldErr(createPayment, "amount")}>
              <MoneyInput cents={pAmount} onCentsChange={setPAmount} />
            </FormField>
            <FormField label="Método" required error={fieldErr(createPayment, "method")}>
              <Select value={pMethod} onValueChange={(v) => setPMethod(v as PayMethod)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Efectivo</SelectItem>
                  <SelectItem value="TRANSFER">Transferencia</SelectItem>
                  <SelectItem value="OTHER">Otro</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Referencia" error={fieldErr(createPayment, "reference")} hint="Ej: número de transferencia o recibo.">
              <Input value={pReference} onChange={(e) => setPReference(e.target.value)} />
            </FormField>
            <FormField
              label="ID de pedido (opcional)"
              error={fieldErr(createPayment, "orderId")}
              hint="UUID del pedido si desea asociarlo; vacío = ingreso libre."
            >
              <Input value={pOrderId} onChange={(e) => setPOrderId(e.target.value)} placeholder="00000000-…-" />
            </FormField>
            <FormField label="Notas" error={fieldErr(createPayment, "notes")}>
              <Textarea rows={3} value={pNotes} onChange={(e) => setPNotes(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)} disabled={createPayment.isPending}>
              Cancelar
            </Button>
            <Button onClick={submitPayment} disabled={createPayment.isPending || pAmount === null || pAmount < 1}>
              Registrar ingreso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: gasto (crear o editar) */}
      <Dialog open={expenseOpen} onOpenChange={(v) => !v && setExpenseOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{expenseEditing ? "Editar gasto" : "Nuevo gasto"}</DialogTitle>
            <DialogDescription>
              {expenseEditing ? `Actualizando: ${expenseEditing.concept}` : "Registre un egreso del negocio."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="Concepto" required error={fieldErr(expenseEditing ? patchExpense : createExpense, "concept")}>
              <Input value={eConcept} onChange={(e) => setEConcept(e.target.value)} placeholder="Ej: Compra de insumos" />
            </FormField>
            <FormField label="Monto" required error={fieldErr(expenseEditing ? patchExpense : createExpense, "amount")}>
              <MoneyInput cents={eAmount} onCentsChange={setEAmount} />
            </FormField>
            <FormField label="Categoría" error={fieldErr(expenseEditing ? patchExpense : createExpense, "category")} hint="Ej: insumos, transporte, sueldos.">
              <Input value={eCategory} onChange={(e) => setECategory(e.target.value)} />
            </FormField>
            <FormField label="Fecha" required error={fieldErr(expenseEditing ? patchExpense : createExpense, "spentAt")}>
              <Input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} className="w-44" />
            </FormField>
            <FormField label="Notas" error={fieldErr(expenseEditing ? patchExpense : createExpense, "notes")}>
              <Textarea rows={3} value={eNotes} onChange={(e) => setENotes(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseOpen(false)} disabled={createExpense.isPending || patchExpense.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={submitExpense}
              disabled={
                createExpense.isPending ||
                patchExpense.isPending ||
                eConcept.trim().length < 2 ||
                eAmount === null ||
                eAmount < 1 ||
                eDate === ""
              }
            >
              {expenseEditing ? "Guardar cambios" : "Registrar gasto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de borrado de gasto */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar gasto</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará «{deleteTarget?.concept}» ({deleteTarget ? fmt.money(deleteTarget.amount) : ""}).
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteExpense.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteExpense.mutate(deleteTarget.id, { onSettled: () => setDeleteTarget(null) });
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Indicación de rango activo */}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarRange className="size-3.5" aria-hidden />
        Datos mostrados del {fmt.date(applied.from)} al {fmt.date(applied.to)} (día completo incluido).
      </p>
    </div>
  );
}
