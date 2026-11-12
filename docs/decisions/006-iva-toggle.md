# ADR-006 — IVA 15% en configuración con flag `tax_enabled` y snapshot por pedido

- **Estado**: aceptada.
- **Fecha**: 2025.

## Contexto

El negocio opera en Ecuador, donde el IVA vigente es del 15 %, pero su aplicabilidad y régimen pueden cambiar (actividad, transición, decisiones contables del titular). Hardcodear el 15 % en el código haría impensable cualquier cambio; activarlo por defecto cuando la operación real del negocio aún lo define contablemente sería peor. Además, un pedido histórico debe conservar el impuesto con el que realmente se cobró, aunque la configuración cambie después.

## Decisión

1. **El porcentaje vive en datos**: `SiteSetting.tax_percent` (sembrado en `15`, editable desde el panel "Ajustes", grupo "negocio"; validado 0-100). Nunca aparece una constante de IVA en el código de la UI o de las APIs.
2. **Flag independiente `tax_enabled`** (por defecto **OFF** en el seed): el porcentaje se **aplica solo si** el flag está activo. Flag y porcentaje se gestionan por separado (módulos "Flags" y "Ajustes"), porque responder "¿se cobra IVA?" y "¿cuánto?" son decisiones distintas.
3. **Modelo de aplicación**: los precios se publican **sin IVA incluido**; el impuesto se suma sobre la base imponible `(subtotal − descuento)` con redondeo entero (`Math.round`) de centavos (`src/lib/domain/tax.ts`, `totalsWithTax`).
4. **Snapshot por pedido**: `Order.taxPercent` guarda el porcentaje aplicado en el momento de crear el pedido; `null` significa "IVA desactivado entonces". Las facturas copian ese snapshot (`Invoice.taxPercent`). Cambiar el flag o el porcentaje no reescribe la historia.
5. **Venta ONSITE y reservas** usan el mismo cálculo en su transacción de creación; el POS del cliente muestra solo un preview (el backend recalcula).
6. La respuesta pública de crear pedido (`POST /api/public/orders`) y el mensaje de WhatsApp informan el IVA aplicado o la nota "No aplica (IVA desactivado)".

## Coste introducido

- **Dos lugares que revisar**: activar el IVA exige tocar el flag **y** verificar el porcentaje en Ajustes; olvidar el segundo aplica el último valor guardado (que es el correcto por defecto, pero conviene revisarlo).
- **No hay devengo retroactivo**: pedidos creados con IVA desactivado no pueden "rehacerse" con IVA salvo emitiendo la operación de nuevo; el snapshot es deliberadamente inmutable.
- **Preview del POS no es juramento**: mientras la creación viaja al servidor, el cliente ve un IVA calculado localmente con la misma configuración; el valor definitivo es el del backend (el POS está documentado así en su propio código).

## Alternativa descartada

**IVA hardcodeado (15 %) en código** o **precios con IVA incluido**: la primera congela una decisión contable del titular en binario y en cada despliegue; la segunda obligaría a desglosar hacia atrás (cálculo inverso con redondeos ambiguos) y contradice el desglose explícito que la operación quiere mostrar en el resumen del pedido y de la factura. También se descartó activar `tax_enabled` por defecto en el seed: prender un impuesto que la operación no ha decidido cobrar genera facturas y totales que el negocio después tendría que corregir.
