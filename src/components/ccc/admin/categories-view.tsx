"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { FormField, LoadMoreButton, LoadingBlock, ErrorBlock, ViewHeader } from "./ui-bits";
import { VirtualTable, type Column } from "./virtual-table";
import { ApiError, apiErrorMessage } from "@/components/ccc/shared/api-client";
import { useSession } from "./session";

// ── Tipos del contrato de /api/admin/categories ──

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  productCount: number;
}

interface CategoryBody {
  name: string;
  slug?: string;
  sortOrder: number;
  isActive: boolean;
}

function fieldError(mutation: { error: Error | null }, field: string): string | null {
  return mutation.error instanceof ApiError ? mutation.error.fieldMessage(field) : null;
}

/** Mismo slugify que el backend (NFD → ASCII, guiones). */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export default function CategoriesView() {
  const { user } = useSession();
  const canWrite = user?.role === "ADMIN";

  const list = useCursorList<CategoryRow>("/api/admin/categories", { limit: 24 });
  const [editing, setEditing] = useState<CategoryRow | "new" | null>(null);

  const remove = useEndpointMutation<{ ok: boolean }, string>(
    "DELETE",
    (id) => `/api/admin/categories/${id}`,
    {
      // El 409 CATEGORY_HAS_PRODUCTS llega como ApiError y el hook lo
      // muestra por toast (apiErrorMessage incluye el detail).
      successMessage: "Categoría eliminada.",
      invalidate: [["/api/admin/categories"]],
    },
  );

  const columns: Column<CategoryRow>[] = [
    {
      key: "name",
      header: "Nombre",
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "slug",
      header: "Slug",
      width: "150px",
      render: (row) => <code className="text-xs text-muted-foreground">{row.slug}</code>,
    },
    {
      key: "sortOrder",
      header: "Orden",
      width: "90px",
      align: "right",
      render: (row) => <span className="tabular-nums">{row.sortOrder}</span>,
    },
    {
      key: "isActive",
      header: "Estado",
      width: "110px",
      render: (row) =>
        row.isActive ? (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-900">
            Activa
          </Badge>
        ) : (
          <Badge variant="outline" className="border-zinc-300 bg-zinc-100 text-zinc-700">Inactiva</Badge>
        ),
    },
    {
      key: "productCount",
      header: "Productos",
      width: "110px",
      align: "right",
      render: (row) => <span className="tabular-nums">{row.productCount}</span>,
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
                    {row.productCount > 0
                      ? `Esta categoría tiene ${row.productCount} producto(s) asignado(s); el servidor la rechazará (409) hasta que los reasignes.`
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
        title="Categorías"
        description="Agrupaciones de la carta (Salados, Bebidas…). No se puede eliminar una categoría con productos asignados."
        actions={
          canWrite ? (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden /> Nueva categoría
            </Button>
          ) : null
        }
      />

      {list.isLoading ? (
        <LoadingBlock label="Cargando categorías…" />
      ) : list.isError ? (
        <ErrorBlock message={apiErrorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <>
          <VirtualTable
            rows={list.items}
            columns={columns}
            rowKey={(row) => row.id}
            emptyMessage="Todavía no hay categorías."
          />
          <LoadMoreButton
            onClick={list.loadMore}
            disabled={!list.hasMore}
            loading={list.isFetchingNextPage}
          />
        </>
      )}

      {editing !== null ? (
        <CategoryDialog
          key={editing === "new" ? "new" : editing.id}
          category={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────── Dialog crear/editar categoría ───────────────────────

function CategoryDialog({ category, onClose }: { category: CategoryRow | null; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  // El slug se auto-sugiere desde el nombre hasta que el usuario lo toca.
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(category !== null);
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const effectiveSlug = slugTouched && slug.trim() !== "" ? slug.trim() : slugify(name);

  const create = useAdminMutation<CategoryRow, CategoryBody>("POST", "/api/admin/categories", {
    successMessage: "Categoría creada.",
    invalidate: [["/api/admin/categories"], ["/api/admin/products"]],
    onDone: onClose,
  });
  const update = useBodyMutation<CategoryRow, { id: string; body: CategoryBody }>(
    "PATCH",
    (v) => `/api/admin/categories/${v.id}`,
    (v) => v.body,
    {
      successMessage: "Categoría actualizada.",
      invalidate: [["/api/admin/categories"], ["/api/admin/products"]],
      onDone: onClose,
    },
  );
  const mutation = category ? update : create;

  function handleSubmit() {
    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = "El nombre necesita al menos 2 caracteres.";
    const sort = Number(sortOrder);
    if (!Number.isInteger(sort) || sort < 0 || sort > 999) {
      errors.sortOrder = "Orden: entero entre 0 y 999.";
    }
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const body: CategoryBody = {
      name: name.trim(),
      // El backend recalcula el slug si no viene; enviamos el sugerido.
      slug: effectiveSlug === "" ? undefined : effectiveSlug,
      sortOrder: Number(sortOrder),
      isActive,
    };
    if (category) {
      update.mutate({ id: category.id, body });
    } else {
      create.mutate(body);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? `Editar: ${category.name}` : "Nueva categoría"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <FormField label="Nombre" required error={fieldError(mutation, "name") ?? clientErrors.name ?? null}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </FormField>

          <FormField
            label="Slug"
            error={fieldError(mutation, "slug")}
            hint="Se usa en la URL pública del catálogo. Se sugiere automáticamente desde el nombre."
          >
            <Input
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
              placeholder="p. ej. salados"
              aria-label="Slug de la categoría"
            />
          </FormField>

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

          <div className="flex items-center justify-between rounded-lg border p-4">
            <Label htmlFor="category-active" className="text-sm">
              Activa (visible en el catálogo público)
            </Label>
            <Switch id="category-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando…" : category ? "Guardar cambios" : "Crear categoría"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
