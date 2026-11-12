# 8-B — Vistas admin de OPERACIÓN (pedidos, POS, inventario)

Agente: 8-B · Fecha: 2026-11-11 · Estado: COMPLETADO

## Archivos creados (exactamente los 3 pedidos, nada más)

| Archivo | Líneas | Contenido |
|---|---|---|
| `src/components/ccc/admin/orders-view.tsx` | 804 | `export default function OrdersView()` — listado + dialog detalle |
| `src/components/ccc/admin/pos-view.tsx` | 817 | `export default function PosView()` — punto de venta ONSITE |
| `src/components/ccc/admin/inventory-view.tsx` | 532 | `export default function InventoryView()` — tabs Stock/Movimientos |

## Decisiones de implementación (no triviales)

- **Flags en snake_case**: la spec hablaba de `flags.invoicingEnabled` etc., pero el
  contrato real (`FlagMap` de `/api/public/bootstrap`) usa `invoicing_enabled`,
  `tax_enabled`, `variants_enabled`, `combos_enabled`. Accedí a las claves reales.
- **Radix Select no admite `value=""`**: los "Todos/Sin evento" usan centinela
  (`"ALL"` / `"NONE"`) que se mapea a `undefined` antes de `buildUrl`.
- **Estados**: `STATUS_LABELS` de ui-bits (Pendiente/Confirmado/…). Los
  `allowedTransitions` se toman SIEMPRE de la respuesta de
  `/api/admin/orders/:id` (nunca hardcodeados). `PAYMENT_METHOD_LABELS` definido
  localmente tal como pidió la spec.
- **Mutaciones**: `useBodyMutation` con TVar `{orderId, status}` para derivar la URL
  del body-variable (evita cierres obsoletos). Invalidación por prefijo
  `["/api/admin/orders"]` refresca listado Y detalle (matching parcial de TanStack).
- **Dialog detalle** montado con `key={selectedId}` → formularios se resetean al
  cambiar de pedido.
- **POS**: `useInfiniteQuery` SIN genéricos explícitos (TPageParam se infiere de
  `initialPageParam: null as string | null`; con genéricos parciales pageParam caía
  a `unknown` y rompía tsc — ver problemas detectados). IVA del ticket es SOLO
  preview con `settings.taxPercent` del bootstrap; el servidor recalcula. Diálogo
  de comprobante con CSS `@media print` inyectado (`.pos-receipt-print`) para que
  "Imprimir" imprima solo el comprobante, no la página entera. Stepper nunca baja
  de 1 (la línea se elimina solo con el botón de papelera, evita borrados
  accidentes con prisa). En móvil el ticket va primero (order-1) y es sticky
  top-0 con `max-h-[70vh]` y scroll interno; en lg es columna derecha sticky.
- **POS roles**: ADMIN/STAFF venden; CONTADOR ve aviso ámbar y botón deshabilitado
  (el POST onsite daría 403 igualmente — feedback anticipado).
- **Inventario**: ambos listados con VirtualTable; opciones del filtro de producto
  del kardex salen de las filas de stock ya cargadas; ajuste con radios
  Entrada/Salida, validación cliente (entero > 0, motivo ≥ 3 chars) + preview
  "Nuevo stock" en rojo si quedaría bajo el umbral. Botón "Ajustar" oculto para
  CONTADOR (POST requiere ADMIN/STAFF).

## Verificación realizada

- `bunx eslint` sobre los 3 archivos: **0 errores** (2 warnings "unused
  eslint-disable directive" por los comentarios `no-img-element` que la spec
  exige incluir; el proyecto desactiva esa regla globalmente y el propio
  `media-picker.tsx` preexistente emite los mismos warnings — convención del repo).
- `bunx tsc --noEmit`: 0 errores en los 3 archivos (filtré mi nombre de archivo).
- curl con cookie admin:
  - `POST /api/admin/orders/onsite` (CASH, producto) → 201, respuesta `{order, invoiceNumber:null}` verificada.
  - `POST /api/admin/orders/onsite` (TRANSFER + combo + producto) → 201 OK (payload `comboId` aceptado).
  - `POST /api/admin/orders/:id/payments` → 201 (y 422 con `errors[].field="amount"` cuando amount=0).
  - `POST /api/admin/inventory/adjust` ±5 (revertido) → 201; motivo corto → 422 `field="reason"`.
- Sin imports de módulos de servidor (`@/lib/db`, `@/lib/services/*`, `@/lib/auth`) —
  solo ccc/client, ui, react, tanstack, lucide.

## Problemas de API/backend detectados (NO corregidos, solo reportados)

1. **`data-hooks.ts` (preexistente) error de tipos**: `useCursorList` llama
   `useInfiniteQuery<CursorPage<T>>({...})` con UN solo genérico → `TPageParam`
   cae a `unknown` → `pageParam ?? undefined` produce `{} | undefined` y tsc
   emite TS2322 en `buildUrl`. No rompe el runtime (SWC no tipa) pero `tsc
   --noEmit`/`next build` fallaría. Mi POS lo evitó no pasando genéricos; el fix
   para data-hooks sería idéntico (quitar el genérico explícito o tipar
   `pageParam as string | null`).
2. **`GET /api/admin/inventory?lowStock=true`** filtra DESPUÉS de paginar
   (`take: limit+1` y luego `rows.filter(isLow)`): las páginas con el filtro
   activo pueden devolver menos ítems que `limit` aunque existan más filas con
   bajo stock más allá de la ventana leída. El cursor sigue siendo consistente
   (se calcula sobre la fila límite ya filtrada), así que la paginación no se
   rompe, solo rinde páginas cortas. Curiosidad menor.
3. **`POST /api/admin/orders/:id/payments`** responde el pago creado con
   `registeredById` (uuid) pero SIN `registeredBy: {name}` — el detalle GET sí lo
   incluye. No afecta a la vista (invalido y refetcheo), pero el tipo de la
   respuesta POST difiere del GET.
4. Otros errores tsc PREEXISTENTES ajenos a mi scope (reportados por cortesía):
   `src/app/api/public/discounts/validate/route.ts` (TS2345 x2, DiscountCode.type
   string vs `DiscountType`), `src/lib/services/orders.ts` (TS2345 en
   evaluateDiscount y en consumptionWithNames por `string | null` vs optional),
   `src/lib/services/public-data.ts` (ThemeData no exportado desde ./theme).

## Cómo montar las vistas (para el agente del shell/admin)

```tsx
import OrdersView from "@/components/ccc/admin/orders-view";
import PosView from "@/components/ccc/admin/pos-view";
import InventoryView from "@/components/ccc/admin/inventory-view";
```
Todas son `"use client"`, default export, sin props. Dependen de que el árbol
tenga QueryClientProvider y Toaster (sonner) ya configurados (igual que el resto
del admin).
