"use client";

import { useEffect, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  CupSoda,
  Eye,
  EyeOff,
  Layers,
  Pencil,
  Plus,
  Search,
  Star,
  Utensils,
} from "lucide-react";
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
import {
  useCursorList,
  useDetail,
  useBodyMutation,
  useAdminMutation,
  useEndpointMutation,
} from "./data-hooks";
import {
  FormField,
  LoadMoreButton,
  LoadingBlock,
  ErrorBlock,
  MoneyInput,
  ViewHeader,
} from "./ui-bits";
import { VirtualTable, type Column } from "./virtual-table";
import { ImageField, MediaPicker } from "./media-picker";
import { useBootstrap, useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { ApiError, apiErrorMessage } from "@/components/ccc/shared/api-client";
import { useSession } from "./session";
import {
  parseAttributesForRender,
  prettyAttributeLabel,
  type AttributesValue,
} from "@/lib/domain/attributes-render";

// ── Tipos del contrato de /api/admin/products ──

type ProductType = "PRODUCT" | "BEVERAGE";

interface ProductRow {
  id: string;
  name: string;
  type: ProductType;
  basePrice: number;
  description: string | null;
  imageUrl: string | null;
  isFeatured: boolean;
  isVisible: boolean;
  isArchived: boolean;
  sortOrder: number;
  attributes: string | null;
  attributeSchemaVersion: number | null;
  category: { id: string; name: string } | null;
  variantCount: number;
  stock: { quantity: number; lowStockThreshold: number } | null;
}

interface ProductDetail extends ProductRow {
  categoryId: string | null;
  variants: VariantRow[];
}

interface VariantRow {
  id: string;
  productId: string;
  name: string;
  priceDelta: number;
  sku: string | null;
  isActive: boolean;
  sortOrder: number;
}

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

interface SchemaRow {
  id: string;
  version: number;
  schemaJson: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ProductBody {
  name: string;
  type: ProductType;
  categoryId: string | null;
  basePrice: number;
  description: string | null;
  imageUrl: string | null;
  isFeatured: boolean;
  isVisible: boolean;
  sortOrder: number;
  attributes: Record<string, unknown> | null;
}

interface VariantBody {
  name: string;
  priceDelta: number;
  sku: string | null;
}

/** Mensaje de error de campo del servidor (RFC 7807) si existe. */
function fieldError(mutation: { error: Error | null }, field: string): string | null {
  return mutation.error instanceof ApiError ? mutation.error.fieldMessage(field) : null;
}

/** Resumen del esquema activo: [{clave, tipo, enum?}] para mostrarlo legible. */
function summarizeSchema(schemaJson: string): { key: string; type: string; enumValues?: string[] }[] {
  try {
    const parsed = JSON.parse(schemaJson) as {
      properties?: Record<string, { type?: string; enum?: unknown[] }>;
    };
    const props = parsed.properties;
    if (!props || typeof props !== "object") return [];
    return Object.entries(props).map(([key, prop]) => ({
      key,
      type: String(prop?.type ?? "—"),
      ...(Array.isArray(prop?.enum) ? { enumValues: prop.enum.map((v) => String(v)) } : {}),
    }));
  } catch {
    return [];
  }
}

/** Valor bonito de un atributo para los chips de previsualización. */
function prettyAttributeValue(value: unknown): string {
  if (value === null || value === undefined) return "No especificado";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Re-formatea el JSON almacenado para el editor (JSON corrupto → vacío). */
function prettyStoredJson(json: string | null): string {
  if (!json || json === "{}") return "";
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return "";
  }
}

/** Dinero con signo para deltas de variante (acepta negativos). */
function parseSignedMoneyToCents(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const normalized = trimmed.replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

// ───────────────────────── Vista principal ─────────────────────────

export default function ProductsView() {
  const fmt = useSiteFormat();
  const flags = useBootstrap().data?.flags;
  const variantsEnabled = flags?.variants_enabled ?? false;
  const { user } = useSession();
  const canWrite = user?.role === "ADMIN";

  // Filtros del toolbar (la búsqueda se debouncea para no machacar la API).
  const [typeFilter, setTypeFilter] = useState<"ALL" | ProductType>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [visibilityFilter, setVisibilityFilter] = useState<"ALL" | "visible" | "hidden" | "archived">("ALL");
  const [searchText, setSearchText] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQ(searchText.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  const list = useCursorList<ProductRow>("/api/admin/products", {
    type: typeFilter === "ALL" ? undefined : typeFilter,
    category: categoryFilter === "ALL" ? undefined : categoryFilter,
    visibility: visibilityFilter === "ALL" ? undefined : visibilityFilter,
    q: q === "" ? undefined : q,
    limit: 24,
  });
  const categories = useCursorList<CategoryRow>("/api/admin/categories", { limit: 50 });

  // Diálogos: editor (producto nuevo = null) y variantes.
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [variantsFor, setVariantsFor] = useState<ProductRow | null>(null);

  const archive = useEndpointMutation<{ ok: boolean; archived: boolean }, string>(
    "DELETE",
    (id) => `/api/admin/products/${id}`,
    {
      successMessage: "Producto archivado.",
      invalidate: [["/api/admin/products"], ["/api/admin/categories"]],
    },
  );
  // Restauración de archivado: el backend aplica isVisible; ver reporte
  // (el PATCH actual no acepta isArchived y lo descarta).
  const restore = useBodyMutation<ProductRow, string>(
    "PATCH",
    (id) => `/api/admin/products/${id}`,
    () => ({ isArchived: false, isVisible: true }),
    {
      successMessage: "Producto restaurado.",
      invalidate: [["/api/admin/products"], ["/api/admin/categories"]],
    },
  );

  const columns: Column<ProductRow>[] = [
    {
      key: "img",
      header: "",
      width: "56px",
      align: "center",
      render: (row) =>
        row.imageUrl ? (
          // Imagen por URL dinámica subida en runtime: Next <Image> no aplica
          // (regla no-img-element deshabilitada globalmente en este proyecto).
          <img
            src={row.imageUrl}
            alt={`Foto de ${row.name}`}
            className="size-8 rounded object-cover"
            loading="lazy"
          />
        ) : row.type === "BEVERAGE" ? (
          <CupSoda className="mx-auto size-4 text-muted-foreground" aria-hidden />
        ) : (
          <Utensils className="mx-auto size-4 text-muted-foreground" aria-hidden />
        ),
    },
    {
      key: "name",
      header: "Nombre",
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "type",
      header: "Tipo",
      width: "92px",
      render: (row) =>
        row.type === "BEVERAGE" ? (
          <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-900">
            Bebida
          </Badge>
        ) : (
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
            Comida
          </Badge>
        ),
    },
    {
      key: "category",
      header: "Categoría",
      width: "130px",
      render: (row) => row.category?.name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "basePrice",
      header: "Precio base",
      width: "110px",
      align: "right",
      render: (row) => <span className="tabular-nums">{fmt.money(row.basePrice)}</span>,
    },
    {
      key: "featured",
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
      key: "visibility",
      header: "Visibilidad",
      width: "104px",
      render: (row) => {
        if (row.isArchived) {
          return <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-900">Archivado</Badge>;
        }
        return row.isVisible ? (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-900">
            <Eye className="size-3" aria-hidden /> Visible
          </Badge>
        ) : (
          <Badge variant="outline" className="border-zinc-300 bg-zinc-100 text-zinc-700">
            <EyeOff className="size-3" aria-hidden /> Oculto
          </Badge>
        );
      },
    },
    {
      key: "stock",
      header: "Stock",
      width: "90px",
      align: "right",
      render: (row) =>
        row.stock ? (
          <span
            className={`tabular-nums ${
              row.stock.quantity <= row.stock.lowStockThreshold ? "text-destructive font-medium" : ""
            }`}
          >
            {row.stock.quantity}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "variants",
      header: "Var.",
      width: "64px",
      align: "right",
      render: (row) => <span className="tabular-nums">{row.variantCount}</span>,
    },
    {
      key: "actions",
      header: "Acciones",
      width: "160px",
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
          {canWrite && variantsEnabled ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Variantes de ${row.name}`}
              title="Variantes"
              onClick={() => setVariantsFor(row)}
            >
              <Layers className="size-4" aria-hidden />
            </Button>
          ) : null}
          {canWrite && !row.isArchived ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Archivar ${row.name}`}
                  title="Archivar"
                  className="text-destructive hover:text-destructive"
                >
                  <Archive className="size-4" aria-hidden />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Archivar “{row.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se ocultará del catálogo y no podrá añadirse a pedidos nuevos. Los pedidos
                    históricos conservan su snapshot. Se puede restaurar desde la pestaña
                    “Archivado”.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => archive.mutate(row.id)}>Archivar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          {canWrite && row.isArchived ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Restaurar ${row.name}`}
              title="Restaurar"
              onClick={() => restore.mutate(row.id)}
              disabled={restore.isPending}
            >
              <ArchiveRestore className="size-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Productos"
        description="Catálogo de comidas y bebidas: precios en centavos USD, atributos dinámicos validados por esquema versionado."
        actions={
          canWrite ? (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden /> Nuevo producto
            </Button>
          ) : null
        }
      />

      {/* Toolbar de filtros */}
      <div className="flex flex-wrap items-center gap-2" role="search">
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "ALL" | ProductType)}>
          <SelectTrigger className="w-[130px]" aria-label="Filtrar por tipo">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los tipos</SelectItem>
            <SelectItem value="PRODUCT">Comida</SelectItem>
            <SelectItem value="BEVERAGE">Bebida</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[170px]" aria-label="Filtrar por categoría">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas las categorías</SelectItem>
            {categories.items.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={visibilityFilter}
          onValueChange={(v) => setVisibilityFilter(v as typeof visibilityFilter)}
        >
          <SelectTrigger className="w-[150px]" aria-label="Filtrar por visibilidad">
            <SelectValue placeholder="Visibilidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas (visibilidad)</SelectItem>
            <SelectItem value="visible">Visibles</SelectItem>
            <SelectItem value="hidden">Ocultos</SelectItem>
            <SelectItem value="archived">Archivados</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="pl-8"
            placeholder="Buscar por nombre…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            aria-label="Buscar producto por nombre"
          />
        </div>
      </div>

      {list.isLoading ? (
        <LoadingBlock label="Cargando productos…" />
      ) : list.isError ? (
        <ErrorBlock message={apiErrorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <>
          <VirtualTable
            rows={list.items}
            columns={columns}
            rowKey={(row) => row.id}
            emptyMessage="No hay productos con estos filtros."
          />
          <LoadMoreButton
            onClick={list.loadMore}
            disabled={!list.hasMore}
            loading={list.isFetchingNextPage}
          />
        </>
      )}

      {editing !== null ? (
        <ProductDialog
          key={editing === "new" ? "new" : editing.id}
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {variantsFor ? (
        <VariantsDialog
          key={variantsFor.id}
          product={variantsFor}
          onClose={() => setVariantsFor(null)}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────── Dialog editor de producto ───────────────────────

function ProductDialog({ product, onClose }: { product: ProductRow | null; onClose: () => void }) {
  const fmt = useSiteFormat();
  const categories = useCursorList<CategoryRow>("/api/admin/categories", { limit: 50 });
  const schemas = useAdminSchemaList();
  const activeSchema = schemas.items.find((s) => s.isActive) ?? null;
  const activeSummary = activeSchema ? summarizeSchema(activeSchema.schemaJson) : [];

  const [name, setName] = useState(product?.name ?? "");
  const [type, setType] = useState<ProductType>(product?.type ?? "PRODUCT");
  const [categoryId, setCategoryId] = useState(product?.category?.id ?? "none");
  const [basePrice, setBasePrice] = useState<number | null>(product?.basePrice ?? null);
  const [description, setDescription] = useState(product?.description ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl ?? null);
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);
  const [isVisible, setIsVisible] = useState(product?.isVisible ?? true);
  const [sortOrder, setSortOrder] = useState(String(product?.sortOrder ?? 0));
  const [attributesJson, setAttributesJson] = useState(prettyStoredJson(product?.attributes ?? null));
  const [mediaOpen, setMediaOpen] = useState(false);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const invalidate = [["/api/admin/products"], ["/api/admin/categories"]];
  const create = useAdminMutation<ProductRow, ProductBody>("POST", "/api/admin/products", {
    successMessage: "Producto creado.",
    invalidate,
    onDone: onClose,
  });
  const update = useBodyMutation<ProductRow, { id: string; body: ProductBody }>(
    "PATCH",
    (v) => `/api/admin/products/${v.id}`,
    (v) => v.body,
    {
      successMessage: "Producto actualizado.",
      invalidate: [...invalidate, product ? [`/api/admin/products/${product.id}`] : []],
      onDone: onClose,
    },
  );
  const mutation = product ? update : create;

  // Previsualización en vivo de los atributos del textarea.
  const parsedAttrs: AttributesValue = parseAttributesForRender(attributesJson.trim() || "null");

  function handleSubmit() {
    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = "El nombre necesita al menos 2 caracteres.";
    if (basePrice === null) errors.basePrice = "Indica el precio base (en dólares).";
    const sort = Number(sortOrder);
    if (!Number.isInteger(sort) || sort < 0 || sort > 9999) {
      errors.sortOrder = "Orden: entero entre 0 y 9999.";
    }
    let attributes: Record<string, unknown> | null = null;
    if (attributesJson.trim() !== "") {
      try {
        const parsed = JSON.parse(attributesJson) as unknown;
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          errors.attributes = "Los atributos deben ser un objeto JSON {\"clave\": valor}.";
        } else {
          attributes = parsed as Record<string, unknown>;
        }
      } catch {
        errors.attributes = "JSON no válido. Corrige la sintaxis antes de guardar.";
      }
    }
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const body: ProductBody = {
      name: name.trim(),
      type,
      categoryId: categoryId === "none" ? null : categoryId,
      basePrice: basePrice ?? 0,
      description: description.trim() === "" ? null : description.trim(),
      imageUrl,
      isFeatured,
      isVisible,
      sortOrder: Number(sortOrder),
      attributes,
    };
    if (product) {
      update.mutate({ id: product.id, body });
    } else {
      create.mutate(body);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? `Editar: ${product.name}` : "Nuevo producto"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <FormField label="Nombre" required error={fieldError(mutation, "name") ?? clientErrors.name ?? null}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </FormField>

            <FormField label="Tipo" required error={fieldError(mutation, "type")}>
              <Select value={type} onValueChange={(v) => setType(v as ProductType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRODUCT">Comida</SelectItem>
                  <SelectItem value="BEVERAGE">Bebida</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            <FormField
              label="Categoría"
              error={fieldError(mutation, "categoryId")}
              hint="Opcional: agrupa el producto en la carta pública."
            >
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin categoría</SelectItem>
                  {categories.items.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField
              label="Precio base"
              required
              error={fieldError(mutation, "basePrice") ?? clientErrors.basePrice ?? null}
              hint={`Se muestra al público como ${fmt.money(basePrice ?? 0)}.`}
            >
              <MoneyInput cents={basePrice} onCentsChange={setBasePrice} />
            </FormField>

            <FormField label="Descripción" error={fieldError(mutation, "description")}>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Descripción breve para la carta…"
              />
            </FormField>

            <FormField label="Imagen" error={fieldError(mutation, "imageUrl")}>
              <ImageField
                url={imageUrl}
                onPick={setImageUrl}
                onOpen={() => setMediaOpen(true)}
              />
            </FormField>
          </div>

          <div className="space-y-4">
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="product-featured" className="text-sm">
                  Destacado
                </Label>
                <Switch id="product-featured" checked={isFeatured} onCheckedChange={setIsFeatured} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="product-visible" className="text-sm">
                  Visible en el catálogo
                </Label>
                <Switch id="product-visible" checked={isVisible} onCheckedChange={setIsVisible} />
              </div>
            </div>

            <FormField
              label="Orden"
              error={fieldError(mutation, "sortOrder") ?? clientErrors.sortOrder ?? null}
              hint="Menor número = antes en la carta."
            >
              <Input
                type="number"
                min={0}
                max={9999}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-28"
              />
            </FormField>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Atributos dinámicos (JSON)
              </Label>
              {activeSummary.length > 0 ? (
                <div className="rounded-md border bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">
                    Esquema activo: v{activeSchema?.version}
                    {product?.attributeSchemaVersion && product.attributeSchemaVersion !== activeSchema?.version ? (
                      <>
                        {" "}· este producto valida contra su versión v{product.attributeSchemaVersion}
                      </>
                    ) : null}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {activeSummary.map((p) => (
                      <li key={p.key} className="flex flex-wrap items-baseline gap-1 text-xs">
                        <span className="font-medium">{prettyAttributeLabel(p.key)}</span>
                        <span className="text-muted-foreground">· {p.type}</span>
                        {p.enumValues ? (
                          <span className="text-muted-foreground/80">
                            · {p.enumValues.join(" | ")}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No hay esquema activo: solo se validará la estructura del JSON.
                </p>
              )}
              <Textarea
                value={attributesJson}
                onChange={(e) => setAttributesJson(e.target.value)}
                rows={6}
                className="font-mono text-xs"
                placeholder='{"sinGluten": true, "nivelPicante": "suave"}'
                aria-label="Atributos en JSON"
              />
              {fieldError(mutation, "attributes") ?? clientErrors.attributes ? (
                <p className="text-xs text-destructive" role="alert">
                  {fieldError(mutation, "attributes") ?? clientErrors.attributes}
                </p>
              ) : null}
              {Object.keys(parsedAttrs).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(parsedAttrs).map(([key, value]) => (
                    <Badge key={key} variant="secondary" className="gap-1 font-normal">
                      <span className="font-medium">{prettyAttributeLabel(key)}:</span>
                      {prettyAttributeValue(value)}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando…" : product ? "Guardar cambios" : "Crear producto"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <MediaPicker
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onPick={setImageUrl}
        currentUrl={imageUrl}
      />
    </Dialog>
  );
}

// ─────────────────────── Dialog de variantes ───────────────────────

function VariantsDialog({ product, onClose }: { product: ProductRow; onClose: () => void }) {
  const fmt = useSiteFormat();
  const detail = useAdminProductDetail(product.id);
  const [name, setName] = useState("");
  const [deltaText, setDeltaText] = useState("");
  const [sku, setSku] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  const add = useAdminMutation<VariantRow, VariantBody>(
    "POST",
    `/api/admin/products/${product.id}/variants`,
    {
      successMessage: "Variante añadida.",
      invalidate: [[`/api/admin/products/${product.id}`], ["/api/admin/products"]],
    },
  );
  const toggle = useBodyMutation<VariantRow, { id: string; isActive: boolean }>(
    "PATCH",
    (v) => `/api/admin/variants/${v.id}`,
    (v) => ({ isActive: v.isActive }),
    {
      successMessage: "Variante actualizada.",
      invalidate: [[`/api/admin/products/${product.id}`], ["/api/admin/products"]],
    },
  );
  const remove = useEndpointMutation<{ ok: boolean }, string>(
    "DELETE",
    (id) => `/api/admin/variants/${id}`,
    {
      successMessage: "Variante eliminada.",
      invalidate: [[`/api/admin/products/${product.id}`], ["/api/admin/products"]],
    },
  );

  function handleAdd() {
    const priceDelta = parseSignedMoneyToCents(deltaText);
    if (name.trim() === "") {
      setClientError("El nombre de la variante es obligatorio.");
      return;
    }
    if (priceDelta === null) {
      setClientError("El delta de precio debe ser un monto en dólares (admite negativos).");
      return;
    }
    setClientError(null);
    add.mutate(
      { name: name.trim(), priceDelta, sku: sku.trim() === "" ? null : sku.trim() },
      {
        onSuccess: () => {
          setName("");
          setDeltaText("");
          setSku("");
        },
      },
    );
  }

  const variants = detail.data?.variants ?? [];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Variantes · {product.name}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Precio final = precio base {fmt.money(product.basePrice)} + delta de cada variante.
        </p>

        {detail.isLoading ? (
          <LoadingBlock label="Cargando variantes…" />
        ) : detail.isError ? (
          <ErrorBlock message={apiErrorMessage(detail.error)} onRetry={() => void detail.refetch()} />
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-lg border">
            {variants.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Este producto todavía no tiene variantes.
              </p>
            ) : (
              <ul className="divide-y">
                {variants.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{v.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {v.priceDelta === 0
                          ? "Sin delta"
                          : `${v.priceDelta > 0 ? "+" : ""}${fmt.money(v.priceDelta)}`}
                        {v.sku ? ` · SKU ${v.sku}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="sr-only" htmlFor={`variant-active-${v.id}`}>
                        Variante activa
                      </Label>
                      <Switch
                        id={`variant-active-${v.id}`}
                        checked={v.isActive}
                        disabled={toggle.isPending}
                        onCheckedChange={(checked) => toggle.mutate({ id: v.id, isActive: checked })}
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            aria-label={`Eliminar variante ${v.name}`}
                            title="Eliminar variante"
                          >
                            <Archive className="size-4" aria-hidden />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar la variante “{v.name}”?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Se elimina de forma definitiva. Los pedidos históricos guardan su
                              snapshot de nombre y precio, por lo que no se pierde histórico.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove.mutate(v.id)}>
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Formulario de alta de variante */}
        <div className="space-y-3 rounded-lg border border-dashed p-4">
          <p className="text-sm font-medium">Añadir variante</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Nombre" required error={fieldError(add, "name")}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="Grande, Picante…"
              />
            </FormField>
            <FormField
              label="Delta de precio (USD)"
              required
              error={fieldError(add, "priceDelta") ?? clientError}
              hint="Admite negativos, p. ej. -0.50."
            >
              <Input
                inputMode="decimal"
                step={0.01}
                placeholder="0.00"
                value={deltaText}
                onChange={(e) => setDeltaText(e.target.value)}
              />
            </FormField>
            <FormField label="SKU" error={fieldError(add, "sku")}>
              <Input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                maxLength={40}
                placeholder="Opcional"
              />
            </FormField>
          </div>
          <Button size="sm" onClick={handleAdd} disabled={add.isPending}>
            <Plus className="size-4" aria-hidden /> Añadir variante
          </Button>
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

/** Detalle de producto (incluye variants) reutilizable en los diálogos. */
function useAdminProductDetail(id: string) {
  return useDetail<ProductDetail>(`/api/admin/products/${id}`, 5_000);
}

/** Lista de esquemas de atributos (GET sin cursor, {items}). */
function useAdminSchemaList(): { items: SchemaRow[] } {
  return useDetail<{ items: SchemaRow[] }>("/api/admin/attribute-schemas", 15_000).data ?? {
    items: [],
  };
}
