"use client";

import { useState } from "react";
import { AlertTriangle, Eye, EyeOff, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCursorList, useBodyMutation, useAdminMutation, useEndpointMutation } from "./data-hooks";
import { FormField, LoadMoreButton, LoadingBlock, ErrorBlock, MoneyInput, ViewHeader } from "./ui-bits";
import { VirtualTable, type Column } from "./virtual-table";
import { ImageField, MediaPicker } from "./media-picker";
import { useBootstrap, useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { ApiError, apiErrorMessage } from "@/components/ccc/shared/api-client";
import { useSession } from "./session";

// ── Tipos del contrato de /api/admin/combos ──

type ComboMode = "FIXED_PRICE" | "PERCENT_DISCOUNT";

interface ComboItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
}

interface ComboRow {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  pricingMode: ComboMode;
  fixedPrice: number | null;
  discountPercent: number | null;
  isVisible: boolean;
  isFeatured: boolean;
  sortOrder: number;
  items: ComboItem[];
  /** Precio unitario resultante (calculado por el backend). */
  unitPrice: number;
}

interface ComboBody {
  name: string;
  description: string | null;
  imageUrl: string | null;
  pricingMode: ComboMode;
  fixedPrice: number | null;
  discountPercent: number | null;
  isVisible: boolean;
  isFeatured: boolean;
  sortOrder: number;
  items: { productId: string; quantity: number }[];
}

interface ProductOption {
  id: string;
  name: string;
  basePrice: number;
  type: "PRODUCT" | "BEVERAGE";
}

function fieldError(mutation: { error: Error | null }, field: string): string | null {
  return mutation.error instanceof ApiError ? mutation.error.fieldMessage(field) : null;
}

/** Resumen compacto de items para la tabla: "4 × Sándwiches de pollo +1". */
function summarizeItems(items: ComboItem[]): string {
  if (items.length === 0) return "Sin items";
  const total = items.reduce((acc, it) => acc + it.quantity, 0);
  const first = `${items[0].quantity} × ${items[0].productName}`;
  return `${total} u. · ${first}${items.length > 1 ? ` +${items.length - 1}` : ""}`;
}

export default function CombosView() {
  const fmt = useSiteFormat();
  const flags = useBootstrap().data?.flags;
  const combosEnabled = flags?.combos_enabled ?? true;
  const { user } = useSession();
  const canWrite = user?.role === "ADMIN";

  const list = useCursorList<ComboRow>("/api/admin/combos", { limit: 24 });
  const [editing, setEditing] = useState<ComboRow | "new" | null>(null);

  const remove = useEndpointMutation<{ ok: boolean }, string>("DELETE", (id) => `/api/admin/combos/${id}`, {
    successMessage: "Combo eliminado.",
    invalidate: [["/api/admin/combos"]],
  });

  const columns: Column<ComboRow>[] = [
    {
      key: "name",
      header: "Nombre",
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "mode",
      header: "Modo",
      width: "130px",
      render: (row) =>
        row.pricingMode === "FIXED_PRICE" ? (
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
            Precio fijo
          </Badge>
        ) : (
          <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-900">
            % descuento
          </Badge>
        ),
    },
    {
      key: "unitPrice",
      header: "Precio unitario",
      width: "120px",
      align: "right",
      render: (row) => <span className="tabular-nums">{fmt.money(row.unitPrice)}</span>,
    },
    {
      key: "items",
      header: "Items",
      render: (row) => (
        <span className="text-xs text-muted-foreground" title={row.items.map((it) => `${it.quantity} × ${it.productName}`).join(", ")}>
          {summarizeItems(row.items)}
        </span>
      ),
    },
    {
      key: "isVisible",
      header: "Visible",
      width: "92px",
      align: "center",
      render: (row) =>
        row.isVisible ? (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-900">
            <Eye className="size-3" aria-hidden /> Sí
          </Badge>
        ) : (
          <Badge variant="outline" className="border-zinc-300 bg-zinc-100 text-zinc-700">
            <EyeOff className="size-3" aria-hidden /> No
          </Badge>
        ),
    },
    {
      key: "isFeatured",
      header: "Destacado",
      width: "96px",
      align: "center",
      render: (row) =>
        row.isFeatured ? (
          <Star className="mx-auto size-4 fill-amber-400 text-amber-400" aria-label="Destacado" />
        ) : (
          <Star className="mx-auto size-4 text-muted-foreground/40" aria-hidden />
        ),
    },
    {
      key: "actions",
      header: "Acciones",
      width: "120px",
      align: "center",
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          {canWrite ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Editar combo ${row.name}`}
              title="Editar"
              onClick={() => setEditing(row)}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
          ) : null}
          {canWrite ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Eliminar combo ${row.name}`}
                  title="Eliminar"
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar el combo “{row.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se elimina de forma definitiva. Los pedidos históricos conservan su snapshot
                    (nombre y precio del combo en el momento de la venta).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => remove.mutate(row.id)}>Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Combos"
        description="Agrupaciones de productos con precio fijo o porcentaje de descuento sobre la suma de los items."
        actions={
          canWrite ? (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden /> Nuevo combo
            </Button>
          ) : null
        }
      />

      {!combosEnabled ? (
        // Aviso amarillo cuando el módulo está apagado por flag (se puede
        // seguir gestionando: la tabla permanece operativa).
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertTriangle aria-hidden />
          <AlertTitle>Módulo desactivado</AlertTitle>
          <AlertDescription className="text-amber-800">
            El módulo de combos está desactivado (flag combos_enabled). Actívalo en Administración
            → Flags para que los combos aparezcan en el catálogo público; aquí puedes seguir
            gestionándolos.
          </AlertDescription>
        </Alert>
      ) : null}

      {list.isLoading ? (
        <LoadingBlock label="Cargando combos…" />
      ) : list.isError ? (
        <ErrorBlock message={apiErrorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <>
          <VirtualTable
            rows={list.items}
            columns={columns}
            rowKey={(row) => row.id}
            emptyMessage="Todavía no hay combos."
          />
          <LoadMoreButton
            onClick={list.loadMore}
            disabled={!list.hasMore}
            loading={list.isFetchingNextPage}
          />
        </>
      )}

      {editing !== null ? (
        <ComboDialog
          key={editing === "new" ? "new" : editing.id}
          combo={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────── Dialog editor de combo ───────────────────────

interface ItemDraft {
  productId: string;
  quantity: string;
}

function ComboDialog({ combo, onClose }: { combo: ComboRow | null; onClose: () => void }) {
  const fmt = useSiteFormat();
  // Productos visibles para el picker de items (paginado con Cargar más).
  const products = useCursorList<ProductOption>("/api/admin/products", {
    visibility: "visible",
    limit: 50,
  });

  const [name, setName] = useState(combo?.name ?? "");
  const [description, setDescription] = useState(combo?.description ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(combo?.imageUrl ?? null);
  const [mode, setMode] = useState<ComboMode>(combo?.pricingMode ?? "FIXED_PRICE");
  const [fixedPrice, setFixedPrice] = useState<number | null>(combo?.fixedPrice ?? null);
  const [percent, setPercent] = useState(
    combo?.discountPercent != null ? String(combo.discountPercent) : "",
  );
  const [isVisible, setIsVisible] = useState(combo?.isVisible ?? true);
  const [isFeatured, setIsFeatured] = useState(combo?.isFeatured ?? false);
  const [sortOrder, setSortOrder] = useState(String(combo?.sortOrder ?? 0));
  const [items, setItems] = useState<ItemDraft[]>(
    combo?.items.map((it) => ({ productId: it.productId, quantity: String(it.quantity) })) ?? [
      { productId: "", quantity: "1" },
    ],
  );
  const [mediaOpen, setMediaOpen] = useState(false);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const create = useAdminMutation<ComboRow, ComboBody>("POST", "/api/admin/combos", {
    successMessage: "Combo creado.",
    invalidate: [["/api/admin/combos"]],
    onDone: onClose,
  });
  const update = useBodyMutation<ComboRow, { id: string; body: ComboBody }>(
    "PATCH",
    (v) => `/api/admin/combos/${v.id}`,
    (v) => v.body,
    {
      successMessage: "Combo actualizado.",
      invalidate: [["/api/admin/combos"], combo ? [`/api/admin/combos/${combo.id}`] : []],
      onDone: onClose,
    },
  );
  const mutation = combo ? update : create;

  const productById = new Map(products.items.map((p) => [p.id, p]));
  const subtotal = items.reduce(
    (acc, it) => acc + (productById.get(it.productId)?.basePrice ?? 0) * (Number(it.quantity) || 0),
    0,
  );

  function handleSubmit() {
    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = "El nombre necesita al menos 2 caracteres.";
    const sort = Number(sortOrder);
    if (!Number.isInteger(sort) || sort < 0 || sort > 999) {
      errors.sortOrder = "Orden: entero entre 0 y 999.";
    }
    // Items: producto elegido en cada fila + cantidad 1..50 y al menos una fila.
    const cleanItems: { productId: string; quantity: number }[] = [];
    for (const it of items) {
      if (it.productId === "") {
        errors.items = "Selecciona un producto en cada fila (o quita las vacías).";
        break;
      }
      const qty = Number(it.quantity);
      if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
        errors.items = "Las cantidades deben ser enteros entre 1 y 50.";
        break;
      }
      cleanItems.push({ productId: it.productId, quantity: qty });
    }
    if (cleanItems.length === 0 && !errors.items) {
      errors.items = "Un combo necesita al menos un producto.";
    }
    if (mode === "FIXED_PRICE" && fixedPrice === null) {
      errors.fixedPrice = "Indica el precio fijo del combo (en dólares).";
    }
    if (mode === "PERCENT_DISCOUNT") {
      const p = Number(percent);
      if (!Number.isInteger(p) || p < 1 || p > 99) {
        errors.discountPercent = "El porcentaje debe ser un entero entre 1 y 99.";
      }
    }
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const body: ComboBody = {
      name: name.trim(),
      description: description.trim() === "" ? null : description.trim(),
      imageUrl,
      pricingMode: mode,
      fixedPrice: mode === "FIXED_PRICE" ? fixedPrice : null,
      discountPercent: mode === "PERCENT_DISCOUNT" ? Number(percent) : null,
      isVisible,
      isFeatured,
      sortOrder: Number(sortOrder),
      items: cleanItems,
    };
    if (combo) {
      update.mutate({ id: combo.id, body });
    } else {
      create.mutate(body);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{combo ? `Editar: ${combo.name}` : "Nuevo combo"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <FormField label="Nombre" required error={fieldError(mutation, "name") ?? clientErrors.name ?? null}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </FormField>

            <FormField label="Descripción" error={fieldError(mutation, "description")}>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Qué incluye el combo…"
              />
            </FormField>

            <FormField label="Imagen" error={fieldError(mutation, "imageUrl")}>
              <ImageField url={imageUrl} onPick={setImageUrl} onOpen={() => setMediaOpen(true)} />
            </FormField>

            <FormField label="Modo de precio" required error={fieldError(mutation, "pricingMode")}>
              <Select value={mode} onValueChange={(v) => setMode(v as ComboMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED_PRICE">Precio fijo</SelectItem>
                  <SelectItem value="PERCENT_DISCOUNT">% de descuento</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            {mode === "FIXED_PRICE" ? (
              <FormField
                label="Precio fijo"
                required
                error={fieldError(mutation, "fixedPrice") ?? clientErrors.fixedPrice ?? null}
                hint={`Suma de los items: ${fmt.money(subtotal)}.`}
              >
                <MoneyInput cents={fixedPrice} onCentsChange={setFixedPrice} />
              </FormField>
            ) : (
              <FormField
                label="Porcentaje de descuento"
                required
                error={fieldError(mutation, "discountPercent") ?? clientErrors.discountPercent ?? null}
                hint={`Se aplica sobre ${fmt.money(subtotal)} (suma de los items).`}
              >
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={percent}
                    onChange={(e) => setPercent(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
            )}

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="combo-visible" className="text-sm">
                  Visible en el catálogo
                </Label>
                <Switch id="combo-visible" checked={isVisible} onCheckedChange={setIsVisible} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="combo-featured" className="text-sm">
                  Destacado
                </Label>
                <Switch id="combo-featured" checked={isFeatured} onCheckedChange={setIsFeatured} />
              </div>
            </div>

            <FormField label="Orden" error={fieldError(mutation, "sortOrder") ?? clientErrors.sortOrder ?? null}>
              <Input
                type="number"
                min={0}
                max={999}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-28"
              />
            </FormField>
          </div>

          {/* Editor de items del combo */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">
                Productos del combo (máx. 12)
              </Label>
              <span className="text-xs text-muted-foreground">
                {items.length}/12 filas · subtotal {fmt.money(subtotal)}
              </span>
            </div>

            {fieldError(mutation, "items") ?? clientErrors.items ? (
              <p className="text-xs text-destructive" role="alert">
                {fieldError(mutation, "items") ?? clientErrors.items}
              </p>
            ) : null}

            <div className="space-y-2">
              {items.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Select
                    value={row.productId}
                    onValueChange={(v) =>
                      setItems((prev) =>
                        prev.map((r, i) => (i === index ? { ...r, productId: v } : r)),
                      )
                    }
                  >
                    <SelectTrigger className="min-w-0 flex-1" aria-label={`Producto ${index + 1}`}>
                      <SelectValue placeholder="Elige producto…" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.items.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} · {fmt.money(p.basePrice)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={row.quantity}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((r, i) => (i === index ? { ...r, quantity: e.target.value } : r)),
                      )
                    }
                    className="w-20"
                    aria-label={`Cantidad del producto ${index + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar producto ${index + 1}`}
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                    disabled={items.length === 1 && items[0].productId === ""}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItems((prev) => [...prev, { productId: "", quantity: "1" }])}
                disabled={items.length >= 12}
              >
                <Plus className="size-4" aria-hidden /> Añadir producto
              </Button>
              {products.hasMore ? (
                <LoadMoreButton
                  onClick={products.loadMore}
                  disabled={!products.hasMore}
                  loading={products.isFetchingNextPage}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {products.items.length} producto(s) visibles cargados.
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando…" : combo ? "Guardar cambios" : "Crear combo"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <MediaPicker open={mediaOpen} onClose={() => setMediaOpen(false)} onPick={setImageUrl} currentUrl={imageUrl} />
    </Dialog>
  );
}
