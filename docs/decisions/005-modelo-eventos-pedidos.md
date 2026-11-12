# ADR-005 — Modelo de eventos y pedidos: dos canales, máquina de estados y stock

- **Estado**: aceptada.
- **Fecha**: 2025.

## Contexto

El negocio vende de dos formas reales y distintas: (1) el cliente arma su pedido en la web y lo envía por WhatsApp para una fecha futura (reserva que un humano confirma), y (2) durante el evento, el staff vende directamente en la mesa (venta inmediata, pago inmediato, sin carro de espera). El inventario, el estado del pedido y la contabilidad deben reflejar ambas realidades sin doble registro manual.

## Decisión

1. **Dos canales en `Order.channel`**:
   - `EVENT_BOOKING`: la reserva web (`POST /api/public/orders`) nace `PENDING_CONFIRMATION`; el negocio la confirma por WhatsApp y la gestiona después desde el panel. La confirmación es humana: el sistema no la da por hecha al crearla.
   - `ONSITE`: la venta directa en el evento (`POST /api/admin/orders/onsite`, módulo "Punto de venta", objetivo de registro en menos de 30 segundos): nace `COMPLETED`, con pago inmediato registrado, stock descontado en la misma transacción y factura opcional si `invoicing_enabled` está activo.
2. **Máquina de estados** (`src/lib/services/orders.ts`, aplicada en `PATCH /api/admin/orders/:id/status`):

   ```text
   PENDING_CONFIRMATION → CONFIRMED | CANCELLED
   CONFIRMED            → IN_PREPARATION | COMPLETED | CANCELLED
   IN_PREPARATION       → COMPLETED | CANCELLED
   COMPLETED            → CANCELLED            (reingresa el stock aplicado)
   CANCELLED            → (terminal)
   ```

   Una transición no permitida produce 409 `INVALID_TRANSITION` con las transiciones válidas en el detalle. El detalle del pedido devuelve `allowedTransitions` para que la UI ofrezca solo lo posible.
3. **Stock con momentos distintos por canal** (campo `Order.stockApplied`):
   - `ONSITE`: descuenta **al registrar** la venta (misma transacción; motivo del movimiento: `Venta en evento {código}`).
   - `EVENT_BOOKING`: descuenta **al pasar a `COMPLETED`** (día del evento), si aún no se había aplicado.
   - `CANCELLED` con `stockApplied=true`: **reingresa** el stock con movimiento de motivo `Cancelación del pedido {código}`.
   - Todo consumo/reingreso verifica disponibilidad antes de escribir (`assertStockAvailable`); el faltante produce 409 `INSUFFICIENT_STOCK`.
4. **Eventos y mínimo por evento**: `Event` agenda fecha/lugar/notas y puede sobrescribir el mínimo global (`minOrderOverride` en centavos; el global vive en `SiteSetting.global_min_order_cents`, sembrado en $50.00). La reserva web aplica el mínimo global; la venta ONSITE no exige mínimo (venta en mano). El mínimo no alcanzado produce 409 `MIN_ORDER_NOT_MET`.
5. **Códigos legibles y contadores atómicos**: cada pedido recibe `CCC-000001` (prefijo `order_prefix` + contador `Counter` incrementado dentro de la transacción; SQLite serializa escrituras, ver ADR-001). Los ítems guardan snapshot de nombre/variante/precio (`OrderItem`), así que editar o archivar el catálogo después no muta pedidos históricos.
6. **Precios siempre del servidor**: el carrito/POS del cliente es solo preview; el backend recalcula cada línea contra el catálogo vigente y rechaza ítem por ítem los productos archivados/invisibles (422 con código `PRODUCT_UNAVAILABLE`).

## Coste introducido

- **Confirmación humana obligatoria**: el flujo web no termina "solo"; alguien debe tocar el pedido en el panel o responder por WhatsApp. Es exactamente el proceso de negocio buscado, no un defecto, pero acopla la operación diaria al panel.
- **Estados irreversibles hacia atrás**: no existe "reabrir" un `CANCELLED`; corregir una cancelación equivocada exige registrar el caso de nuevo. Se eligió mantener la máquina pequeña y auditable.
- **Stock de reservas desfasado hasta completar**: entre confirmar y completar una reserva, ese stock está "prometido" pero no descontado; el responsable debe completar el pedido el día del evento.

## Alternativa descartada

**Un único canal de venta** (todo pasa por confirmación manual) o **estados libres** (cualquier estado a cualquier otro): la primera habría obligado al staff a registrar la venta en sitio como "reserva pendiente" (roce operativo real en medio del evento); la segunda habría hecho el inventario y la contabilidad impredecibles. También se descartó descontar stock al crear la reserva web: un cliente que reserva y nunca confirma congelaría inventario de productos perecederos.
