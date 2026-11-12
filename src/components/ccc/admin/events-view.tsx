"use client";

import { useState } from "react";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useCursorList, useDetail, useBodyMutation, useAdminMutation, useEndpointMutation } from "./data-hooks";
import {
  ChannelBadge,
  FormField,
  LoadMoreButton,
  LoadingBlock,
  ErrorBlock,
  MoneyInput,
  StatusBadge,
  ViewHeader,
} from "./ui-bits";
import { VirtualTable, type Column } from "./virtual-table";
import { useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { ApiError, apiErrorMessage } from "@/components/ccc/shared/api-client";
import { useSession } from "./session";

// ── Tipos del contrato de /api/admin/events ──

interface EventRow {
  id: string;
  name: string;
  eventDate: string;
  location: string;
  notes: string | null;
  minOrderOverride: number | null;
  isActive: boolean;
  createdAt: string;
  orderCount: number;
}

interface EventOrder {
  id: string;
  code: string;
  channel: string;
  status: string;
  total: number;
  customerName: string | null;
  createdAt: string;
}

interface EventDetail extends EventRow {
  orders: EventOrder[];
  _count: { orders: number };
}

interface EventBody {
  name: string;
  eventDate: string;
  location: string;
  notes: string | null;
  minOrderOverride: number | null;
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

export default function EventsView() {
  const fmt = useSiteFormat();
  const { user } = useSession();
  const canWrite = user?.role === "ADMIN";

  const list = useCursorList<EventRow>("/api/admin/events", { limit: 24 });
  const [viewing, setViewing] = useState<EventRow | null>(null);
  const [editing, setEditing] = useState<EventRow | "new" | null>(null);

  const remove = useEndpointMutation<{ ok: boolean }, string>("DELETE", (id) => `/api/admin/events/${id}`, {
    // El 409 EVENT_HAS_ORDERS se muestra por toast (lo maneja el hook).
    successMessage: "Evento eliminado.",
    invalidate: [["/api/admin/events"]],
  });

  const columns: Column<EventRow>[] = [
    {
      key: "name",
      header: "Nombre",
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "eventDate",
      header: "Fecha",
      width: "170px",
      render: (row) => <span className="text-xs">{fmt.datetime(row.eventDate)}</span>,
    },
    {
      key: "location",
      header: "Lugar",
      render: (row) => <span className="text-sm">{row.location}</span>,
    },
    {
      key: "minOrderOverride",
      header: "Mínimo por evento",
      width: "130px",
      align: "right",
      render: (row) =>
        row.minOrderOverride != null ? (
          <span className="tabular-nums">{fmt.money(row.minOrderOverride)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">Global</span>
        ),
    },
    {
      key: "orderCount",
      header: "Pedidos",
      width: "90px",
      align: "right",
      render: (row) => <span className="tabular-nums">{row.orderCount}</span>,
    },
    {
      key: "isActive",
      header: "Estado",
      width: "100px",
      render: (row) =>
        row.isActive ? (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-900">
            Activo
          </Badge>
        ) : (
          <Badge variant="outline" className="border-zinc-300 bg-zinc-100 text-zinc-700">Inactivo</Badge>
        ),
    },
    {
      key: "actions",
      header: "Acciones",
      width: "140px",
      align: "center",
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Ver detalle de ${row.name}`}
            title="Ver detalle"
            onClick={() => setViewing(row)}
          >
            <Eye className="size-4" aria-hidden />
          </Button>
          {canWrite ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Editar ${row.name}`}
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
                  aria-label={`Eliminar ${row.name}`}
                  title="Eliminar"
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar “{row.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {row.orderCount > 0
                      ? `El servidor rechazará la eliminación (409): el evento tiene ${row.orderCount} pedido(s) asociado(s).`
                      : "La eliminación es definitiva."}
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
        title="Eventos"
        description="Eventos del catering (fechas, lugar y mínimo de pedido propio). Los pedidos pueden asociarse a un evento."
        actions={
          canWrite ? (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden /> Nuevo evento
            </Button>
          ) : null
        }
      />

      {list.isLoading ? (
        <LoadingBlock label="Cargando eventos…" />
      ) : list.isError ? (
        <ErrorBlock message={apiErrorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <>
          <VirtualTable
            rows={list.items}
            columns={columns}
            rowKey={(row) => row.id}
            emptyMessage="Todavía no hay eventos registrados."
          />
          <LoadMoreButton
            onClick={list.loadMore}
            disabled={!list.hasMore}
            loading={list.isFetchingNextPage}
          />
        </>
      )}

      {viewing ? <EventDetailDialog key={viewing.id} event={viewing} onClose={() => setViewing(null)} /> : null}

      {editing !== null ? (
        <EventDialog
          key={editing === "new" ? "new" : editing.id}
          event={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────── Dialog de detalle (con pedidos) ───────────────────────

function EventDetailDialog({ event, onClose }: { event: EventRow; onClose: () => void }) {
  const fmt = useSiteFormat();
  const detail = useDetail<EventDetail>(`/api/admin/events/${event.id}`, 10_000);

  const orderColumns: Column<EventOrder>[] = [
    {
      key: "code",
      header: "Pedido",
      width: "120px",
      render: (row) => <code className="font-mono text-xs">{row.code}</code>,
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
      key: "total",
      header: "Total",
      width: "100px",
      align: "right",
      render: (row) => <span className="tabular-nums">{fmt.money(row.total)}</span>,
    },
    {
      key: "customer",
      header: "Cliente",
      render: (row) => <span className="truncate text-xs">{row.customerName ?? "—"}</span>,
    },
  ];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event.name}</DialogTitle>
          <DialogDescription>
            {fmt.datetime(event.eventDate)} · {event.location}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Mínimo por evento</dt>
            <dd className="text-sm font-medium">
              {event.minOrderOverride != null ? fmt.money(event.minOrderOverride) : "Global (ajustes del sitio)"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Estado</dt>
            <dd className="text-sm font-medium">{event.isActive ? "Activo" : "Inactivo"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Notas</dt>
            <dd className="text-sm">{event.notes ?? "Sin notas."}</dd>
          </div>
        </dl>

        <div className="space-y-2">
          <p className="text-sm font-medium">
            Últimos pedidos {detail.data ? `(${detail.data._count.orders} en total)` : ""}
          </p>
          {detail.isLoading ? (
            <LoadingBlock label="Cargando pedidos…" />
          ) : detail.isError ? (
            <ErrorBlock message={apiErrorMessage(detail.error)} onRetry={() => void detail.refetch()} />
          ) : (
            <VirtualTable
              rows={detail.data?.orders ?? []}
              columns={orderColumns}
              rowKey={(row) => row.id}
              emptyMessage="Este evento todavía no tiene pedidos asociados."
              maxHeightPx={280}
              rowHeight={44}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────── Dialog editor de evento ───────────────────────

function EventDialog({ event, onClose }: { event: EventRow | null; onClose: () => void }) {
  const [name, setName] = useState(event?.name ?? "");
  const [eventDate, setEventDate] = useState(isoToLocalInput(event?.eventDate ?? null));
  const [location, setLocation] = useState(event?.location ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [minOrderOverride, setMinOrderOverride] = useState<number | null>(
    event?.minOrderOverride ?? null,
  );
  const [isActive, setIsActive] = useState(event?.isActive ?? true);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const create = useAdminMutation<EventRow, EventBody>("POST", "/api/admin/events", {
    successMessage: "Evento creado.",
    invalidate: [["/api/admin/events"]],
    onDone: onClose,
  });
  const update = useBodyMutation<EventRow, { id: string; body: EventBody }>(
    "PATCH",
    (v) => `/api/admin/events/${v.id}`,
    (v) => v.body,
    {
      successMessage: "Evento actualizado.",
      invalidate: [["/api/admin/events"], event ? [`/api/admin/events/${event.id}`] : []],
      onDone: onClose,
    },
  );
  const mutation = event ? update : create;

  function handleSubmit() {
    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = "El nombre necesita al menos 2 caracteres.";
    if (eventDate === "" || Number.isNaN(Date.parse(eventDate))) {
      errors.eventDate = "Indica la fecha y hora del evento.";
    }
    if (location.trim().length < 2) errors.location = "El lugar necesita al menos 2 caracteres.";
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const body: EventBody = {
      name: name.trim(),
      eventDate: new Date(eventDate).toISOString(),
      location: location.trim(),
      notes: notes.trim() === "" ? null : notes.trim(),
      minOrderOverride,
      isActive,
    };
    if (event) {
      update.mutate({ id: event.id, body });
    } else {
      create.mutate(body);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event ? `Editar: ${event.name}` : "Nuevo evento"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nombre" required error={fieldError(mutation, "name") ?? clientErrors.name ?? null}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </FormField>

          <FormField
            label="Fecha y hora"
            required
            error={fieldError(mutation, "eventDate") ?? clientErrors.eventDate ?? null}
          >
            <Input
              type="datetime-local"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </FormField>

          <FormField label="Lugar" required error={fieldError(mutation, "location") ?? clientErrors.location ?? null}>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
          </FormField>

          <FormField
            label="Mínimo de pedido propio"
            error={fieldError(mutation, "minOrderOverride")}
            hint="Vacío = se usa el mínimo global de los ajustes."
          >
            <MoneyInput cents={minOrderOverride} onCentsChange={setMinOrderOverride} />
          </FormField>

          <FormField label="Notas" error={fieldError(mutation, "notes")}>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder="Indicaciones internas, menú previsto, contacto…"
            />
          </FormField>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <Label htmlFor="event-active" className="text-sm">
              Activo (aparece en eventos públicos)
            </Label>
            <Switch id="event-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando…" : event ? "Guardar cambios" : "Crear evento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
