"use client";

import { useState } from "react";
import { Percent, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
import { useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { ApiError, apiErrorMessage } from "@/components/ccc/shared/api-client";
import { useSession } from "./session";

// ── Tipos del contrato de /api/admin/discounts ──

type DiscountType = "PERCENT" | "FIXED_AMOUNT";

interface DiscountRow {
  id: string;
  code: string;
  type: DiscountType;
  /** Porcentaje (1-100) si PERCENT o monto en centavos si FIXED_AMOUNT. */
  value: number;
  minSubtotal: number;
  maxUses: number | null;
  usedCount: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
  orderCount: number;
}

interface DiscountBody {
  code: string;
  type: DiscountType;
  value: number;
  minSubtotal: number;
  maxUses: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
}

function fieldError(mutation: { error: Error | null }, field: string): string | null {
  return mutation.error instanceof ApiError ? mutation.error.fieldMessage(field) : null;
}

/** ISO → valor de <input type="datetime-local"> en horario local. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor de datetime-local → ISO 8601 UTC (null si vacío). */
function localInputToIso(value: string): string | null {
  if (value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function DiscountsView() {
  const fmt = useSiteFormat();
  const { user } = useSession();
  const canWrite = user?.role === "ADMIN";

  const list = useCursorList<DiscountRow>("/api/admin/discounts", { limit: 24 });
  const [editing, setEditing] = useState<DiscountRow | "new" | null>(null);

  // Interruptor inline de activo → PATCH { isActive } con invalidación.
  const toggle = useBodyMutation<DiscountRow, { id: string; isActive: boolean }>(
    "PATCH",
    (v) => `/api/admin/discounts/${v.id}`,
    (v) => ({ isActive: v.isActive }),
    { invalidate: [["/api/admin/discounts"]] },
  );
  const remove = useEndpointMutation<{ ok: boolean }, string>(
    "DELETE",
    (id) => `/api/admin/discounts/${id}`,
    {
      successMessage: "Descuento eliminado.",
      invalidate: [["/api/admin/discounts"]],
    },
  );

  const columns: Column<DiscountRow>[] = [
    {
      key: "code",
      header: "Código",
      width: "140px",
      render: (row) => <code className="font-mono text-sm font-semibold">{row.code}</code>,
    },
    {
      key: "type",
      header: "Tipo",
      width: "120px",
      render: (row) =>
        row.type === "PERCENT" ? (
          <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-900">
            <Percent className="size-3" aria-hidden /> Porcentaje
          </Badge>
        ) : (
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
            Monto fijo
          </Badge>
        ),
    },
    {
      key: "value",
      header: "Valor",
      width: "100px",
      align: "right",
      render: (row) =>
        row.type === "PERCENT" ? (
          <span className="tabular-nums">{row.value}%</span>
        ) : (
          <span className="tabular-nums">{fmt.money(row.value)}</span>
        ),
    },
    {
      key: "minSubtotal",
      header: "Mínimo",
      width: "110px",
      align: "right",
      render: (row) =>
        row.minSubtotal > 0 ? (
          <span className="tabular-nums">{fmt.money(row.minSubtotal)}</span>
        ) : (
          <span className="text-muted-foreground">Sin mínimo</span>
        ),
    },
    {
      key: "uses",
      header: "Usos",
      width: "110px",
      align: "right",
      render: (row) => (
        <span className="tabular-nums">
          {row.usedCount}/{row.maxUses ?? "∞"}
        </span>
      ),
    },
    {
      key: "validity",
      header: "Vigencia",
      render: (row) => {
        if (!row.startsAt && !row.endsAt) {
          return <span className="text-xs text-muted-foreground">Sin límite</span>;
        }
        const parts = [
          row.startsAt ? fmt.datetime(row.startsAt) : "…",
          row.endsAt ? fmt.datetime(row.endsAt) : "∞",
        ];
        return (
          <span className="text-xs">
            {parts[0]} → {parts[1]}
          </span>
        );
      },
    },
    {
      key: "isActive",
      header: "Activo",
      width: "80px",
      align: "center",
      render: (row) =>
        canWrite ? (
          <Switch
            checked={row.isActive}
            disabled={toggle.isPending}
            onCheckedChange={(checked) => toggle.mutate({ id: row.id, isActive: checked })}
            aria-label={`Activar o desactivar ${row.code}`}
          />
        ) : (
          <Badge variant="outline" className={row.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-zinc-300 bg-zinc-100 text-zinc-700"}>
            {row.isActive ? "Activo" : "Inactivo"}
          </Badge>
        ),
    },
    {
      key: "actions",
      header: "Acciones",
      width: "110px",
      align: "center",
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          {canWrite ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Editar descuento ${row.code}`}
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
                  aria-label={`Eliminar descuento ${row.code}`}
                  title="Eliminar"
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar “{row.code}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se elimina de forma definitiva. Los pedidos históricos conservan el snapshot
                    del descuento ya aplicado (monto descontado).
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
        title="Descuentos"
        description="Códigos promocionales por porcentaje o monto fijo, con mínimo de compra, límite de usos y vigencia."
        actions={
          canWrite ? (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden /> Nuevo descuento
            </Button>
          ) : null
        }
      />

      {list.isLoading ? (
        <LoadingBlock label="Cargando descuentos…" />
      ) : list.isError ? (
        <ErrorBlock message={apiErrorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <>
          <VirtualTable
            rows={list.items}
            columns={columns}
            rowKey={(row) => row.id}
            emptyMessage="Todavía no hay códigos de descuento."
          />
          <LoadMoreButton
            onClick={list.loadMore}
            disabled={!list.hasMore}
            loading={list.isFetchingNextPage}
          />
        </>
      )}

      {editing !== null ? (
        <DiscountDialog
          key={editing === "new" ? "new" : editing.id}
          discount={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────── Dialog editor de descuento ───────────────────────

function DiscountDialog({ discount, onClose }: { discount: DiscountRow | null; onClose: () => void }) {
  const fmt = useSiteFormat();
  const [code, setCode] = useState(discount?.code ?? "");
  const [type, setType] = useState<DiscountType>(discount?.type ?? "PERCENT");
  const [value, setValue] = useState<number | null>(discount?.value ?? null);
  const [percent, setPercent] = useState(
    discount?.type === "PERCENT" ? String(discount.value) : "",
  );
  const [minSubtotal, setMinSubtotal] = useState<number | null>(
    discount?.minSubtotal && discount.minSubtotal > 0 ? discount.minSubtotal : null,
  );
  const [maxUses, setMaxUses] = useState(
    discount?.maxUses != null ? String(discount.maxUses) : "",
  );
  const [startsAt, setStartsAt] = useState(isoToLocalInput(discount?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(isoToLocalInput(discount?.endsAt ?? null));
  const [isActive, setIsActive] = useState(discount?.isActive ?? true);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const create = useAdminMutation<DiscountRow, DiscountBody>("POST", "/api/admin/discounts", {
    successMessage: "Descuento creado.",
    invalidate: [["/api/admin/discounts"]],
    onDone: onClose,
  });
  const update = useBodyMutation<DiscountRow, { id: string; body: DiscountBody }>(
    "PATCH",
    (v) => `/api/admin/discounts/${v.id}`,
    (v) => v.body,
    {
      successMessage: "Descuento actualizado.",
      invalidate: [["/api/admin/discounts"], discount ? [`/api/admin/discounts/${discount.id}`] : []],
      onDone: onClose,
    },
  );
  const mutation = discount ? update : create;

  function handleSubmit() {
    const errors: Record<string, string> = {};
    const trimmedCode = code.trim();
    if (!/^[A-Za-z0-9-]{3,40}$/.test(trimmedCode)) {
      errors.code = "Solo letras, números y guion (3-40 caracteres).";
    }
    let finalValue: number;
    if (type === "PERCENT") {
      const p = Number(percent);
      if (!Number.isInteger(p) || p < 1 || p > 100) {
        errors.value = "El porcentaje debe ser un entero entre 1 y 100.";
      }
      finalValue = p;
    } else {
      if (value === null || value < 1) {
        errors.value = "Indica el monto del descuento (en dólares).";
      }
      finalValue = value ?? 0;
    }
    const max = maxUses.trim() === "" ? null : Number(maxUses);
    if (max !== null && (!Number.isInteger(max) || max < 1)) {
      errors.maxUses = "Máximo de usos: entero positivo (o vacío para ilimitado).";
    }
    const startsIso = localInputToIso(startsAt);
    const endsIso = localInputToIso(endsAt);
    if (startsIso && endsIso && Date.parse(endsIso) <= Date.parse(startsIso)) {
      errors.endsAt = "La fecha de fin debe ser posterior a la de inicio.";
    }
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const body: DiscountBody = {
      code: trimmedCode,
      type,
      value: finalValue,
      minSubtotal: minSubtotal ?? 0,
      maxUses: max,
      startsAt: startsIso,
      endsAt: endsIso,
      isActive,
    };
    if (discount) {
      update.mutate({ id: discount.id, body });
    } else {
      create.mutate(body);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {discount ? `Editar: ${discount.code}` : "Nuevo descuento"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Código"
            required
            error={fieldError(mutation, "code") ?? clientErrors.code ?? null}
            hint="Se guarda en MAYÚSCULAS; los clientes lo escriben tal cual al reservar."
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="font-mono"
              maxLength={40}
              placeholder="BIENVENIDA10"
            />
          </FormField>

          <FormField label="Tipo" required error={fieldError(mutation, "type")}>
            <Select value={type} onValueChange={(v) => setType(v as DiscountType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PERCENT">Porcentaje (%)</SelectItem>
                <SelectItem value="FIXED_AMOUNT">Monto fijo</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          {type === "PERCENT" ? (
            <FormField
              label="Porcentaje"
              required
              error={fieldError(mutation, "value") ?? clientErrors.value ?? null}
            >
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">% del subtotal</span>
              </div>
            </FormField>
          ) : (
            <FormField
              label="Monto fijo"
              required
              error={fieldError(mutation, "value") ?? clientErrors.value ?? null}
              hint={`Descuento de ${fmt.money(value ?? 0)} sobre el subtotal.`}
            >
              <MoneyInput cents={value} onCentsChange={setValue} />
            </FormField>
          )}

          <FormField
            label="Subtotal mínimo"
            error={fieldError(mutation, "minSubtotal") ?? clientErrors.minSubtotal ?? null}
            hint="Vacío = sin mínimo de compra."
          >
            <MoneyInput cents={minSubtotal} onCentsChange={setMinSubtotal} />
          </FormField>

          <FormField
            label="Máximo de usos"
            error={fieldError(mutation, "maxUses") ?? clientErrors.maxUses ?? null}
            hint="Vacío = ilimitado."
          >
            <Input
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className="w-28"
              placeholder="∞"
            />
          </FormField>

          <FormField
            label="Inicio de vigencia"
            error={fieldError(mutation, "startsAt") ?? clientErrors.startsAt ?? null}
            hint="Vacío = disponible desde ya."
          >
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </FormField>

          <FormField
            label="Fin de vigencia"
            error={fieldError(mutation, "endsAt") ?? clientErrors.endsAt ?? null}
            hint="Vacío = sin fecha de expiración."
          >
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </FormField>

          <div className="flex items-center justify-between rounded-lg border p-4 sm:col-span-2">
            <Label htmlFor="discount-active" className="text-sm">
              Activo (validable por los clientes)
            </Label>
            <Switch id="discount-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando…" : discount ? "Guardar cambios" : "Crear descuento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
