"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  useAdminMutation,
  useCursorList,
  type CursorPage,
} from "@/components/ccc/admin/data-hooks";
import {
  ErrorBlock,
  LoadingBlock,
  LoadMoreButton,
  ViewHeader,
} from "@/components/ccc/admin/ui-bits";
import { useSiteFormat } from "@/components/ccc/shared/use-bootstrap";

interface FlagItem {
  key: string;
  value: boolean;
  description: string;
  default: boolean;
  updatedAt: string;
}

/** Nombres legibles de los flags (fallback: la clave técnica). */
const FLAG_LABELS: Record<string, string> = {
  tax_enabled: "IVA",
  invoicing_enabled: "Facturación",
  variants_enabled: "Variantes de producto",
  testimonials_enabled: "Testimonios",
  combos_enabled: "Combos",
  discounts_enabled: "Códigos de descuento",
};

export default function FlagsView() {
  const fmt = useSiteFormat();
  const queryClient = useQueryClient();
  const list = useCursorList<FlagItem>("/api/admin/flags");

  const toggle = useAdminMutation<{ items: FlagItem[] }, Record<string, boolean>>(
    "PUT",
    "/api/admin/flags",
    {
      successMessage: "Flag actualizado.",
      invalidate: [["/api/admin/flags"], ["public-bootstrap"]],
    },
  );

  /**
   * Cambio optimista: se pinta al instante y el PUT revalida (rollback si falla).
   * OJO: la caché de useCursorList es de useInfiniteQuery → la entrada es
   * { pages: CursorPage[] , pageParams } (no una página suelta).
   */
  function handleToggle(key: string, next: boolean) {
    queryClient.setQueryData<{ pages: CursorPage<FlagItem>[]; pageParams: string[] }>(
      ["/api/admin/flags", {}],
      (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.map((f) => (f.key === key ? { ...f, value: next } : f)),
              })),
            }
          : old,
    );
    toggle.mutate(
      { [key]: next },
      {
        // Si el servidor rechaza, se vuelve al estado real.
        onError: () => void queryClient.invalidateQueries({ queryKey: ["/api/admin/flags"] }),
      },
    );
  }

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Módulos y funcionalidades"
        description="Active o desactive módulos completos del sitio. El cambio surte efecto de inmediato, sin reiniciar."
      />

      {list.isLoading ? (
        <LoadingBlock label="Cargando flags…" />
      ) : list.isError ? (
        <ErrorBlock message="No se pudo cargar la lista de flags." onRetry={() => void list.refetch()} />
      ) : (
        <div className="space-y-3">
          {list.items.map((flag) => {
            const label = FLAG_LABELS[flag.key] ?? flag.key;
            return (
              <div
                key={flag.key}
                className="flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{label}</p>
                    <Badge variant="outline" className="whitespace-nowrap text-xs">
                      por defecto: {flag.default ? "ON" : "OFF"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{flag.description}</p>
                  <p className="text-xs text-muted-foreground/80">
                    Última modificación: {fmt.datetime(flag.updatedAt)}
                  </p>
                </div>
                <Switch
                  checked={flag.value}
                  disabled={toggle.isPending}
                  onCheckedChange={(v) => handleToggle(flag.key, v)}
                  aria-label={`Activar o desactivar ${label}`}
                />
              </div>
            );
          })}

          {list.items.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No hay flags configurados.
            </div>
          ) : null}

          <LoadMoreButton
            onClick={list.loadMore}
            disabled={!list.hasMore}
            loading={list.isFetchingNextPage}
          />
        </div>
      )}
    </div>
  );
}
