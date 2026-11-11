"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Search, TrendingDown, TrendingUp } from "lucide-react";
import { useBodyMutation, useCursorList } from "./data-hooks";
import { ErrorBlock, FormField, LoadMoreButton, LoadingBlock, ViewHeader } from "./ui-bits";
import { VirtualTable, type Column } from "./virtual-table";
import { useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { ApiError } from "@/components/ccc/shared/api-client";
import { useSession } from "./session";

/**
 * Vista admin de INVENTARIO: stock por producto (con alerta de bajo stock) y
 * kardex de movimientos auditados. Ambos listados usan VirtualTable porque
 * los movimientos pueden crecer sin límite.
 */

interface StockRow {
  id: string;
  productId: string;
  quantity: number;
  lowStockThreshold: number;
  updatedAt: string;
  product: {
    id: string;
    name: string;
    type: string;
    imageUrl: string | null;
    isArchived: boolean;
  };
  isLow: boolean;
}

interface MovementRow {
  id: string;
  productId: string;
  delta: number;
  reason: string;
  createdAt: string;
  product: { name: string } | null;
  user: { name: string } | null;
}

const TYPE_LABELS: Record<string, string> = {
  PRODUCT: "Producto",
  BEVERAGE: "Bebida",
};

export default function InventoryView() {
  const fmt = useSiteFormat();
  const { user } = useSession();
  const canAdjust = user?.role === "ADMIN" || user?.role === "STAFF";

  // ── Filtros de stock ──
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);

  // Búsqueda con debounce (~300 ms).
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const stockParams = useMemo(
    () => ({
      q: q || undefined,
      lowStock: onlyLow ? "true" : undefined,
      limit: 30,
    }),
    [q, onlyLow],
  );
  const stock = useCursorList<StockRow>("/api/admin/inventory", stockParams);

  // ── Filtro de movimientos por producto ──
  const [productFilter, setProductFilter] = useState<string>("ALL");
  const movementParams = useMemo(
    () => ({
      productId: productFilter === "ALL" ? undefined : productFilter,
      limit: 30,
    }),
    [productFilter],
  );
  const movements = useCursorList<MovementRow>("/api/admin/inventory/movements", movementParams);

  const [adjusting, setAdjusting] = useState<StockRow | null>(null);

  const stockColumns: Column<StockRow>[] = [
    {
      key: "product",
      header: "Producto",
      width: "minmax(0,1.4fr)",
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          {row.product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.product.imageUrl}
              alt={row.product.name}
              className="size-8 shrink-0 rounded-md object-cover"
              loading="lazy"
            />
          ) : null}
          <span className="truncate font-medium">
            {row.product.name}
            {row.product.isArchived ? (
              <span className="ml-1 text-xs text-muted-foreground">(archivado)</span>
            ) : null}
          </span>
        </div>
      ),
    },
    {
      key: "type",
      header: "Tipo",
      width: "110px",
      render: (row) => (
        <span className="text-muted-foreground">
          {TYPE_LABELS[row.product.type] ?? row.product.type}
        </span>
      ),
    },
    {
      key: "quantity",
      header: "Cantidad",
      width: "110px",
      align: "right",
      render: (row) => (
        <span className={`text-base tabular-nums ${row.isLow ? "font-bold text-destructive" : "font-semibold"}`}>
          {row.quantity}
        </span>
      ),
    },
    {
      key: "threshold",
      header: "Umbral",
      width: "90px",
      align: "right",
      render: (row) => (
        <span className="tabular-nums text-muted-foreground">{row.lowStockThreshold}</span>
      ),
    },
    {
      key: "state",
      header: "Estado",
      width: "120px",
      render: (row) =>
        row.isLow ? (
          <Badge variant="outline" className="whitespace-nowrap border-rose-200 bg-rose-50 text-rose-900">
            Bajo stock
          </Badge>
        ) : (
          <Badge variant="outline" className="whitespace-nowrap border-emerald-200 bg-emerald-50 text-emerald-900">
            OK
          </Badge>
        ),
    },
    {
      key: "updatedAt",
      header: "Últ. actualización",
      width: "170px",
      render: (row) => (
        <span className="text-muted-foreground">{fmt.datetime(row.updatedAt)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "100px",
      align: "right",
      render: (row) =>
        canAdjust ? (
          <Button variant="outline" size="sm" onClick={() => setAdjusting(row)}>
            Ajustar
          </Button>
        ) : null,
    },
  ];

  const movementColumns: Column<MovementRow>[] = [
    {
      key: "createdAt",
      header: "Fecha",
      width: "170px",
      render: (row) => (
        <span className="text-muted-foreground">{fmt.datetime(row.createdAt)}</span>
      ),
    },
    {
      key: "product",
      header: "Producto",
      width: "minmax(0,1.3fr)",
      render: (row) => <span className="truncate">{row.product?.name ?? row.productId}</span>,
    },
    {
      key: "delta",
      header: "Cambio",
      width: "90px",
      align: "right",
      render: (row) => (
        <span
          className={`font-semibold tabular-nums ${
            row.delta > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {row.delta > 0 ? `+${row.delta}` : row.delta}
        </span>
      ),
    },
    {
      key: "reason",
      header: "Motivo",
      width: "minmax(0,1.6fr)",
      render: (row) => <span className="truncate text-muted-foreground">{row.reason}</span>,
    },
    {
      key: "user",
      header: "Usuario",
      width: "150px",
      render: (row) => <span className="truncate">{row.user?.name ?? "Sistema"}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <ViewHeader
        title="Inventario"
        description="Stock por producto y kardex de movimientos con motivo obligatorio."
      />

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="movements">Movimientos</TabsTrigger>
        </TabsList>

        {/* ── Pestaña Stock ── */}
        <TabsContent value="stock" className="mt-4 space-y-4">
          <section
            aria-label="Filtros de stock"
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
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
                aria-label="Buscar producto en stock"
              />
            </div>
            <div className="flex items-center gap-2.5">
              <Switch
                id="low-stock-switch"
                checked={onlyLow}
                onCheckedChange={setOnlyLow}
                aria-label="Filtrar solo bajo stock"
              />
              <Label htmlFor="low-stock-switch" className="text-sm">
                Solo bajo stock
              </Label>
            </div>
          </section>

          {stock.isLoading ? (
            <LoadingBlock label="Cargando stock…" />
          ) : stock.isError ? (
            <ErrorBlock
              message="No se pudo cargar el inventario."
              onRetry={() => void stock.refetch()}
            />
          ) : (
            <div className="space-y-3">
              <VirtualTable
                rows={stock.items}
                columns={stockColumns}
                rowKey={(row) => row.id}
                emptyMessage={
                  q || onlyLow
                    ? "Ningún producto coincide con los filtros aplicados."
                    : "Sin registros de stock: los productos sin fila se consideran sin seguimiento."
                }
              />
              <LoadMoreButton
                onClick={stock.loadMore}
                disabled={!stock.hasMore}
                loading={stock.isFetchingNextPage}
              />
            </div>
          )}
        </TabsContent>

        {/* ── Pestaña Movimientos ── */}
        <TabsContent value="movements" className="mt-4 space-y-4">
          <section aria-label="Filtro de movimientos" className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="movement-product" className="text-xs font-medium text-muted-foreground">
                Producto
              </Label>
              <Select value={productFilter} onValueChange={setProductFilter}>
                <SelectTrigger
                  id="movement-product"
                  className="w-full sm:w-64"
                  aria-label="Filtrar movimientos por producto"
                >
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  {stock.items.map((s) => (
                    <SelectItem key={s.productId} value={s.productId}>
                      {s.product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          {movements.isLoading ? (
            <LoadingBlock label="Cargando movimientos…" />
          ) : movements.isError ? (
            <ErrorBlock
              message="No se pudo cargar los movimientos."
              onRetry={() => void movements.refetch()}
            />
          ) : (
            <div className="space-y-3">
              <VirtualTable
                rows={movements.items}
                columns={movementColumns}
                rowKey={(row) => row.id}
                emptyMessage={
                  productFilter !== "ALL"
                    ? "Sin movimientos del producto seleccionado."
                    : "Sin movimientos registrados."
                }
              />
              <LoadMoreButton
                onClick={movements.loadMore}
                disabled={!movements.hasMore}
                loading={movements.isFetchingNextPage}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>

      {adjusting ? (
        <AdjustDialog
          key={adjusting.productId}
          row={adjusting}
          onClose={() => setAdjusting(null)}
        />
      ) : null}
    </div>
  );
}

/** Diálogo de ajuste de stock: entrada (+) o salida (−) con motivo obligatorio. */
function AdjustDialog({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [qtyInput, setQtyInput] = useState("1");
  const [reason, setReason] = useState("");

  const qty = Number(qtyInput);
  const qtyValid = Number.isInteger(qty) && qty > 0;
  const reasonValid = reason.trim().length >= 3;
  const delta = direction === "in" ? qty : -qty;
  const newQuantity = row.quantity + (qtyValid ? delta : 0);

  const adjustMutation = useBodyMutation<
    { productId: string; quantity: number },
    { productId: string; delta: number; reason: string }
  >(
    "POST",
    () => "/api/admin/inventory/adjust",
    (v) => v,
    {
      successMessage: "Stock ajustado.",
      // Refresca stock, kardex y resumen del panel.
      invalidate: [
        ["/api/admin/inventory"],
        ["/api/admin/inventory/movements"],
        ["/api/admin/overview"],
      ],
    },
  );

  const qtyError =
    adjustMutation.error instanceof ApiError
      ? adjustMutation.error.fieldMessage("delta") ?? adjustMutation.error.fieldMessage("productId")
      : null;
  const reasonError =
    adjustMutation.error instanceof ApiError
      ? adjustMutation.error.fieldMessage("reason")
      : null;

  function submit() {
    if (!qtyValid || !reasonValid) return;
    adjustMutation.mutate(
      { productId: row.productId, delta, reason: reason.trim() },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar stock</DialogTitle>
          <DialogDescription>
            {row.product.name} · Cantidad actual: {row.quantity} (umbral {row.lowStockThreshold})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormField label="Tipo de ajuste" required>
            <RadioGroup
              value={direction}
              onValueChange={(v) => setDirection(v as "in" | "out")}
              className="grid grid-cols-2 gap-3"
            >
              <label
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition ${
                  direction === "in" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <RadioGroupItem value="in" id="adjust-in" />
                <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <span className="text-sm font-medium">Entrada (+)</span>
              </label>
              <label
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition ${
                  direction === "out" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <RadioGroupItem value="out" id="adjust-out" />
                <TrendingDown className="size-4 text-rose-600 dark:text-rose-400" aria-hidden />
                <span className="text-sm font-medium">Salida (−)</span>
              </label>
            </RadioGroup>
          </FormField>

          <FormField
            label="Cantidad"
            required
            error={qtyValid ? qtyError : "Ingrese un número entero mayor que 0."}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value)}
              aria-label="Cantidad a ajustar"
            />
          </FormField>

          <FormField
            label="Motivo"
            required
            error={reasonValid ? reasonError : "El motivo es obligatorio (mínimo 3 caracteres)."}
            hint="Se audita junto al usuario en el kardex."
          >
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej.: Compra a proveedor, mermas, corrección de conteo…"
              rows={3}
              aria-label="Motivo del ajuste"
            />
          </FormField>

          <p className="rounded-lg border bg-muted/40 px-4 py-2.5 text-sm">
            Nuevo stock:{" "}
            <span
              className={`font-semibold tabular-nums ${
                newQuantity <= row.lowStockThreshold ? "text-destructive" : ""
              }`}
            >
              {newQuantity}
            </span>{" "}
            {qtyValid ? (
              <span className="text-muted-foreground">
                ({delta > 0 ? `+${delta}` : delta} unidades)
              </span>
            ) : null}
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={adjustMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={submit}
              disabled={adjustMutation.isPending || !qtyValid || !reasonValid}
            >
              {adjustMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              Aplicar ajuste
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
