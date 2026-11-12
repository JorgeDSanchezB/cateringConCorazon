"use client";

import { useState } from "react";
import { Ban, Info } from "lucide-react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBodyMutation, useCursorList } from "@/components/ccc/admin/data-hooks";
import {
  ErrorBlock,
  LoadingBlock,
  LoadMoreButton,
  STATUS_LABELS,
  StatusBadge,
  ViewHeader,
} from "@/components/ccc/admin/ui-bits";
import { VirtualTable, type Column } from "@/components/ccc/admin/virtual-table";
import { useBootstrap, useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { ApiError } from "@/components/ccc/shared/api-client";

interface InvoiceRow {
  id: string;
  number: string;
  orderId: string;
  customerName: string | null;
  subtotal: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  status: "ACTIVE" | "VOID";
  voidedAt: string | null;
  voidedReason: string | null;
  issuedAt: string;
  order: { code: string; channel: string } | null;
  issuedBy: { name: string } | null;
}

export default function InvoicesView() {
  const fmt = useSiteFormat();
  const { data: bootstrap, isLoading: bootstrapLoading } = useBootstrap();

  // El módulo completo depende del flag: si está apagado no se consulta nada.
  const invoicingEnabled = bootstrap?.flags.invoicing_enabled ?? false;

  const [status, setStatus] = useState("ALL");
  const [voidTarget, setVoidTarget] = useState<InvoiceRow | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const list = useCursorList<InvoiceRow>(
    "/api/admin/invoices",
    { status: status === "ALL" ? undefined : status },
    { enabled: invoicingEnabled },
  );

  const voidInvoice = useBodyMutation<InvoiceRow, { id: string; reason: string }>(
    "POST",
    (v) => `/api/admin/invoices/${v.id}/void`,
    (v) => ({ reason: v.reason }),
    {
      successMessage: "Factura anulada.",
      invalidate: [["/api/admin/invoices"]],
      onDone: () => {
        setVoidTarget(null);
        setVoidReason("");
      },
    },
  );

  if (bootstrapLoading) return <LoadingBlock label="Cargando configuración…" />;

  if (!invoicingEnabled) {
    return (
      <div className="space-y-4">
        <ViewHeader title="Facturación" description="Facturas internas numeradas." />
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <Info aria-hidden />
          <AlertTitle>Módulo desactivado</AlertTitle>
          <AlertDescription className="text-amber-900/90">
            El módulo de facturación está desactivado. Actívelo en Flags para ver y emitir facturas.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const columns: Column<InvoiceRow>[] = [
    { key: "number", header: "Número", width: "150px", render: (i) => <span className="font-mono text-xs">{i.number}</span> },
    {
      key: "order",
      header: "Pedido",
      width: "120px",
      render: (i) => (i.order ? <span className="font-mono text-xs">{i.order.code}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      key: "customer",
      header: "Cliente",
      width: "1fr",
      render: (i) => <span className="truncate">{i.customerName ?? "Consumidor final"}</span>,
    },
    { key: "issuedAt", header: "Emisión", width: "150px", render: (i) => <span className="text-muted-foreground">{fmt.datetime(i.issuedAt)}</span> },
    { key: "subtotal", header: "Subtotal", width: "100px", align: "right", render: (i) => <span className="tabular-nums">{fmt.money(i.subtotal)}</span> },
    {
      key: "tax",
      header: "IVA",
      width: "130px",
      align: "right",
      render: (i) => (
        <span className="tabular-nums text-muted-foreground">
          {fmt.money(i.taxAmount)} <span className="text-xs">({i.taxPercent}%)</span>
        </span>
      ),
    },
    { key: "total", header: "Total", width: "100px", align: "right", render: (i) => <span className="font-semibold tabular-nums">{fmt.money(i.total)}</span> },
    { key: "status", header: "Estado", width: "110px", render: (i) => <StatusBadge status={i.status} /> },
    {
      key: "actions",
      header: "Acciones",
      width: "110px",
      render: (i) =>
        i.status === "ACTIVE" ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              setVoidReason("");
              setVoidTarget(i);
            }}
          >
            <Ban className="size-4" aria-hidden />
            Anular
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground" title={i.voidedReason ?? undefined}>
            {i.voidedAt ? fmt.date(i.voidedAt) : "—"}
          </span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Facturación"
        description="Facturas internas emitidas desde pedidos y punto de venta."
      />

      <Alert>
        <Info aria-hidden />
        <AlertTitle>Facturación interna</AlertTitle>
        <AlertDescription>
          Facturación interna sin integración SRI. Numeración configurable en Ajustes (prefijo y dígitos).
        </AlertDescription>
      </Alert>

      {/* Filtro de estado */}
      <div className="flex items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48" aria-label="Filtrar por estado">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas</SelectItem>
            <SelectItem value="ACTIVE">{STATUS_LABELS.ACTIVE}</SelectItem>
            <SelectItem value="VOID">{STATUS_LABELS.VOID}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {list.isLoading ? (
        <LoadingBlock label="Cargando facturas…" />
      ) : list.isError ? (
        <ErrorBlock message="No se pudo cargar las facturas." onRetry={() => void list.refetch()} />
      ) : (
        <div className="space-y-3">
          <VirtualTable
            rows={list.items}
            columns={columns}
            rowKey={(i) => i.id}
            emptyMessage="Sin facturas que coincidan con el filtro."
          />
          <LoadMoreButton onClick={list.loadMore} disabled={!list.hasMore} loading={list.isFetchingNextPage} />
        </div>
      )}

      {/* Confirmación de anulación */}
      <AlertDialog open={voidTarget !== null} onOpenChange={(v) => !v && setVoidTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular factura</AlertDialogTitle>
            <AlertDialogDescription>
              Se anulará la factura <span className="font-mono">{voidTarget?.number}</span>. La acción
              queda registrada con la fecha, el usuario y el motivo indicado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="void-reason">Motivo de anulación</Label>
            <Input
              id="void-reason"
              placeholder="Ej: error de datos del cliente"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
            {voidInvoice.error instanceof ApiError && voidInvoice.error.fieldMessage("reason") ? (
              <p className="text-xs text-destructive" role="alert">
                {voidInvoice.error.fieldMessage("reason")}
              </p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voidInvoice.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={voidInvoice.isPending || voidReason.trim().length < 3}
              onClick={(e) => {
                e.preventDefault(); // Mantener abierto hasta resolver la mutación.
                if (voidTarget) voidInvoice.mutate({ id: voidTarget.id, reason: voidReason.trim() });
              }}
            >
              Anular factura
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
