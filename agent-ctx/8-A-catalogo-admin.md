# Task 8-A — Vistas admin de CATÁLOGO (productos, categorías, combos, descuentos, eventos, esquemas de atributos)

Agente: 8-A (catálogo admin). Stack: Next.js 16 App Router + React 19 + TS + Tailwind 4 + shadcn/ui (New York) + TanStack Query.

## Archivos creados (todos `"use client"`, `export default function ...View()`, sin props)

| Archivo | Líneas | Contenido |
|---|---|---|
| `src/components/ccc/admin/products-view.tsx` | 1010 | Toolbar (tipo/categoría/visibilidad/búsqueda debounced 400ms + "Nuevo producto"), VirtualTable (imagen 32px con fallback a ícono Utensils/CupSoda, tipo badge, categoría, precio `fmt.money`, destacado estrella, visibilidad badge Visible/Oculto/Archivado, stock `stock?.quantity ?? "—"`, `variantCount`, acciones Editar/Variantes/Archivar(AlertDialog)/Restaurar). Dialog editor completo con bloque "Atributos dinámicos (JSON)": resumen del esquema ACTIVO (`useDetail("/api/admin/attribute-schemas")`, propiedades con tipo + enum), chips de previsualización en vivo (`parseAttributesForRender` + `prettyAttributeLabel`), errores 422 mapeados al campo. Sub-dialog Variantes (solo si `flags.variants_enabled`): lista (nombre, delta con signo, SKU, switch activo → PATCH, eliminar con AlertDialog) + alta (nombre, delta con signo Input decimal paso 0.01 → centavos, SKU opcional). POST/PATCH productos, DELETE=archivar, POST variantes, PATCH/DELETE variantes. |
| `src/components/ccc/admin/categories-view.tsx` | 334 | VirtualTable (nombre, slug mono, orden, activo badge, nº productos, acciones). Dialog crear/editar con slug auto-sugerido (slugify igual que backend, editable al tocar). DELETE con AlertDialog; 409 CATEGORY_HAS_PRODUCTS llega por toast del hook. |
| `src/components/ccc/admin/combos-view.tsx` | 600 | Alert amarillo si `!flags.combos_enabled` (tabla operativa igualmente). Tabla: nombre, modo badge Precio fijo/% descuento, `unitPrice`, items resumidos ("4 u. · 2 × Sándwiches…"), visible, destacado, acciones. Editor: nombre, descripción, imagen (ImageField+MediaPicker), modo (MoneyInput o Input % 1-99), editor de items con Select de productos (`/api/admin/products?visibility=visible&limit=50` + "Cargar más"), cantidad 1-50, quitar fila, "Añadir producto" (máx 12), switches visible/destacado, orden. POST/PATCH (PATCH envía items completo). |
| `src/components/ccc/admin/discounts-view.tsx` | 519 | Tabla: código mono MAYÚSCULAS, tipo badge, valor (% o `fmt.money`), mínimo, usos `usedCount/maxUses|∞`, vigencia (inicio→fin o "Sin límite"), activo con Switch inline → PATCH `{isActive}`, acciones. Editor: código, tipo Select, valor (MoneyInput si FIXED_AMOUNT / % si PERCENT), mínimo MoneyInput (vacío→0), máximo usos (vacío→null), inicio/fin `datetime-local` ↔ ISO (`new Date(v).toISOString()`), activo. POST/PATCH/DELETE. |
| `src/components/ccc/admin/events-view.tsx` | 485 | Tabla: nombre, fecha `fmt.datetime`, lugar, mínimo override (`fmt.money` o "Global"), pedidos (orderCount), activo badge, acciones Ver/Editar/Eliminar(AlertDialog). Dialog detalle (`GET /api/admin/events/:id`): datos + últimos 20 pedidos en VirtualTable (código mono, ChannelBadge, StatusBadge, total). Editor: nombre, fecha datetime-local, lugar, notas, mínimo override MoneyInput (vacío→null), activo. POST/PATCH/DELETE (409 EVENT_HAS_ORDERS por toast). |
| `src/components/ccc/admin/attribute-schemas-view.tsx` | 303 | Párrafo explicando versionado (productos validan contra SU versión; nueva versión no rompe existentes; properties string/number/boolean, enum = type string+enum; additionalProperties:false forzado). Lista de versiones (VirtualTable: versión, descripción, activa badge, fecha, "Ver JSON" → Dialog con `<pre>` pretty). "Nueva versión" → Dialog descripción + Textarea JSON con plantilla v1 (sinGluten, vegetariano, nivelPicante enum, notas maxLength 80); validación client-side de JSON parseable antes de POST. |

## Convenciones seguidas
- Listados con `useCursorList` + `VirtualTable` + `LoadMoreButton`; estados `isLoading→LoadingBlock`, `isError→ErrorBlock onRetry={refetch}`.
- Mutaciones vía `useAdminMutation` / `useBodyMutation` / `useEndpointMutation` (toast + invalidación: `["/api/admin/products"]` etc.).
- Errores de campo: `mutation.error instanceof ApiError && mutation.error.fieldMessage("campo")`.
- Dinero siempre `fmt.money` (useSiteFormat); fechas `fmt.datetime`/`fmt.date`.
- Flags reales del API en snake_case: `flags.variants_enabled`, `flags.combos_enabled`.
- Confirmaciones destructivas con AlertDialog; editores con Dialog.
- `useSession()` → `canWrite = user?.role === "ADMIN"` para ocultar acciones de escritura a STAFF/CONTADOR en las vistas de lectura mixta (productos/categorías/eventos).
- Sin emojis (íconos lucide). Variables en inglés, UI en castellano. `<img>` permitido: la regla `@next/next/no-img-element` está OFF en eslint.config.mjs (comentario explicativo dejado en el código).

## Verificación
- `bunx eslint <6 archivos>` → 0 errores, 0 warnings.
- `bunx tsc --noEmit` → mis 6 archivos SIN errores (12 errores restantes son de otros módulos en construcción: examples/, skills/, public-data theme export, data-hooks interno, pos-view).
- Contratos probados con curl (login admin): GET/POST/PATCH/DELETE products, variants (POST/PATCH isActive/DELETE), categories (POST/DELETE), combos (POST con items PERCENT_DISCOUNT + DELETE), discounts (POST body completo / PATCH isActive / DELETE), events (POST / GET detalle con `_count.orders` + `orders[]` / DELETE), attribute-schemas (POST JSON inválido → 422 field `schemaJson`).

## PROBLEMA DE API DETECTADO (no modificado, solo reportado)
1. **`PATCH /api/admin/products/:id` NO acepta `isArchived`**: el Zod `productPatchSchema` no incluye la clave y la descarta silenciosamente. Envié (según especificación) `{isArchived:false, isVisible:true}` para "Restaurar" y verificado con curl: responde 200 pero `isArchived` sigue `true` (solo cambia `isVisible`). La restauración real es imposible con el API actual: falta añadir `isArchived: z.boolean().optional()` al PATCH (o un endpoint de restaurar). Mientras tanto, la vista muestra el toast de éxito y el producto permanece archivado → el equipo backend debe corregirlo.
2. (Observación preexistente de otro módulo) `src/components/ccc/admin/data-hooks.ts` línea 46 tiene un error TS interno (`{} | undefined` no asignable) — no lo toqué (archivo compartido de otro agente); no afecta a mis vistas.
3. (Observación) `GET /api/admin/events/:id` devuelve el campo `_count` en formato crudo (`_count: {orders: N}`) — lo tipoé correctamente en `EventDetail`.

## Notas para el agente del shell admin
Montar las vistas por hash-route (p. ej. `admin/productos`, `admin/categorias`, `admin/combos`, `admin/descuentos`, `admin/eventos`, `admin/esquemas`): export default `ProductsView`, `CategoriesView`, `CombosView`, `DiscountsView`, `EventsView`, `AttributeSchemasView`. No requieren props (usan `useSession` internamente solo para ocultar acciones de escritura).
