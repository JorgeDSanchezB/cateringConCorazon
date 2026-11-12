"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCursorList } from "@/components/ccc/admin/data-hooks";
import { useBootstrapData } from "@/components/ccc/shared/use-bootstrap";
import { apiErrorMessage } from "@/components/ccc/shared/api-client";
import { ErrorBlock, EmptyBlock } from "@/components/ccc/admin/ui-bits";
import { ProductCard, type PublicProduct } from "./product-card";
import { PageContainer } from "./ui";

/**
 * Catálogo público: búsqueda + filtro por tipo + categorías (chips activos).
 * Paginación por CURSOR (regla de la lista infinita): 12 por página,
 * "Cargar más" bajo demanda. Claves estables = product.id.
 */
const CATALOG_PAGE_SIZE = 12;

export function CatalogView() {
  const bootstrap = useBootstrapData();
  const categories = bootstrap?.categories ?? [];

  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | "PRODUCT" | "BEVERAGE">("all");
  const [categorySlug, setCategorySlug] = useState<string | null>(null);

  // Búsqueda con debounce (300ms) para no golpear la API en cada tecla.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(rawQuery.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [rawQuery]);

  const params = useMemo(
    () => ({
      q: query || undefined,
      type: type === "all" ? undefined : type,
      category: categorySlug ?? undefined,
      limit: CATALOG_PAGE_SIZE,
    }),
    [query, type, categorySlug],
  );

  const list = useCursorList<PublicProduct>("/api/public/catalog", params);

  return (
    <PageContainer>
      <div className="space-y-6">
        <header className="space-y-2 text-center">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Nuestro menú</h1>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground sm:text-base">
            Preparado artesanalmente para tu evento. Añade al carrito y arma tu pedido:
            la confirmación final se hace por WhatsApp.
          </p>
        </header>

        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={rawQuery}
                onChange={(e) => setRawQuery(e.target.value)}
                placeholder="Buscar en el menú…"
                aria-label="Buscar productos en el catálogo"
                className="pl-9"
              />
            </div>
            <Tabs
              value={type}
              onValueChange={(v) => setType(v as typeof type)}
              aria-label="Filtrar por tipo de producto"
            >
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="all" className="flex-1">Todos</TabsTrigger>
                <TabsTrigger value="PRODUCT" className="flex-1">Comida</TabsTrigger>
                <TabsTrigger value="BEVERAGE" className="flex-1">Bebidas</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {categories.length > 0 ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
              <button
                type="button"
                aria-pressed={categorySlug === null}
                onClick={() => setCategorySlug(null)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  categorySlug === null
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                Todas
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={categorySlug === category.slug}
                  onClick={() => setCategorySlug(category.slug)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    categorySlug === category.slug
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {list.isLoading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-80 animate-pulse rounded-xl border bg-muted/50" aria-hidden="true" />
            ))}
          </div>
        ) : list.isError ? (
          <ErrorBlock
            message={apiErrorMessage(list.error)}
            onRetry={() => void list.refetch()}
          />
        ) : list.items.length === 0 && !list.isFetching ? (
          <EmptyBlock message="No encontramos productos con esos filtros. Prueba con otra búsqueda." />
        ) : (
          <>
            <div
              className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
              aria-live="polite"
            >
              {list.items.map((product) => (
                <ProductCard key={product.id} product={product} />
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
                  {list.isFetchingNextPage ? "Cargando más…" : "Cargar más productos"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </PageContainer>
  );
}
