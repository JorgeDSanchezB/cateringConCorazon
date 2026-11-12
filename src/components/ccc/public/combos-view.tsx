"use client";

import { Layers } from "lucide-react";
import { useCursorList } from "@/components/ccc/admin/data-hooks";
import { useBootstrapData } from "@/components/ccc/shared/use-bootstrap";
import { apiErrorMessage } from "@/components/ccc/shared/api-client";
import { ErrorBlock, EmptyBlock } from "@/components/ccc/admin/ui-bits";
import { ComboCard, type PublicCombo } from "./combo-card";
import { PageContainer } from "./ui";

/**
 * Página de combos. Si el flag combos_enabled está apagado, la API devuelve
 * lista vacía y aquí se muestra un aviso claro (módulo conmutado, no error).
 */
export function CombosView() {
  const bootstrap = useBootstrapData();
  const combosEnabled = bootstrap?.flags.combos_enabled ?? false;
  const list = useCursorList<PublicCombo>("/api/public/combos", { limit: 12 });

  return (
    <PageContainer>
      <div className="space-y-6">
        <header className="space-y-2 text-center">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Combos</h1>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground sm:text-base">
            Precio fijo por combo o descuento sobre la suma de productos: la forma
            más sabrosa de completar tu evento.
          </p>
        </header>

        {!combosEnabled ? (
          <div className="mx-auto flex max-w-lg flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
            <Layers className="size-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Los combos están desactivados temporalmente. Vuelve pronto o arma tu
              pedido a la carta desde el catálogo.
            </p>
          </div>
        ) : list.isLoading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-96 animate-pulse rounded-xl border bg-muted/50" aria-hidden="true" />
            ))}
          </div>
        ) : list.isError ? (
          <ErrorBlock message={apiErrorMessage(list.error)} onRetry={() => void list.refetch()} />
        ) : list.items.length === 0 ? (
          <EmptyBlock message="Aún no hay combos publicados." />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {list.items.map((combo) => (
                <ComboCard key={combo.id} combo={combo} />
              ))}
            </div>
            {list.hasMore ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={list.loadMore}
                  disabled={list.isFetchingNextPage}
                  className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-card-foreground transition-colors hover:border-primary/40 disabled:opacity-60"
                >
                  {list.isFetchingNextPage ? "Cargando más…" : "Cargar más combos"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </PageContainer>
  );
}
