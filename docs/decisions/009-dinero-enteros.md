# ADR-009 — Dinero en centavos USD enteros con formato determinista manual

- **Estado**: aceptada.
- **Fecha**: 2025.

## Contexto

Ecuador está dolarizado: la moneda es USD y los precios del catering se manejan en dólares con centavos. Toda la cadena (catálogo, carrito, POS, pedidos, pagos, gastos, facturas, contabilidad) necesita sumas, descuentos porcentuales e impuestos que cuadren al centavo, sin errores de coma flotante y sin formatos que dependan del entorno del navegador o del servidor: reglas de redondeo de `Intl` distintas por locale y versión, notación científica para magnitudes raras o espacios finos como separadores en algunos entornos. La UI además recibe entrada humana ("3.50", "3,50", "3") en el panel.

## Decisión

1. **Todo dinero es un entero en centavos USD** en BD (`Int`, columnas `basePrice`, `unitPrice`, `lineTotal`, `subtotal`, `amount`, `fixedPrice`, `value` de descuento fijo y umbrales de mínimo) y en todos los contratos de API. Ningún precio viaja como flotante.
2. **Cálculos con redondeo entero explícito**: impuesto `Math.round(base*% /100)`, descuento porcentual `Math.round(subtotal*valor/100)`, precio de combo por descuento `Math.round(suma*factor)`. La base imponible de IVA es `max(0, subtotal − descuento)` y el descuento nunca supera el subtotal (cap explícito).
3. **Formato determinista manual** (`src/lib/domain/money.ts`): `formatMoney` produce notación US-style `$1,250.50` (agrupación de miles con coma, centavos siempre a 2 dígitos, signo menos delante si es negativo) sin usar `Intl.NumberFormat`. La convención es la habitual de Ecuador dolarizado; símbolo configurable (`currency_symbol` en Ajustes, por defecto `$`).
4. **Entrada del panel**: `parseMoneyToCents` acepta `"3.50"`, `"3,50"` y `"3"` (la coma se normaliza a punto, máximo 2 decimales) y devuelve centavos; lo no parseable es error de campo, nunca conversión silenciosa.
5. **Cotas técnicas anti-desbordes**: `requireCents` y `centsSchema` limitan montos a 100 000 000 centavos ($1 000 000); precios de producto a 10 000 000; deltas no acotados a excepción de esa misma cota.

## Coste introducido

- **La UI debe convertir**: los formularios del panel convierten decimal↔centavos en los extremos; cualquier integración futura debe respetar el contrato "enteros en centavos" (documentado en `docs/api-contract.md`).
- **Sin redondeo bancario/contable configurable**: el redondeo es half-up clásico del entero más cercano; para la escala y naturaleza de los montos del negocio se considera suficiente y previsible.
- **Notación de moneda fija en formato**: el estilo del separador es una decisión de código, no un dato de BD (sí lo es el símbolo); cambiar la convención gráfica de agrupación tocaría `formatMoney`.

## Alternativa descartada

**Flotantes (`number`/`float`) con `Intl.NumberFormat`**: los errores binarios de representación (0.1+0.2) se infiltran en sumas de líneas y en el IVA, y el formato de `Intl` varía por locale/versión/runtime (incluyendo separadores no estándar), lo que rompe parsing posterior de los mismos textos. Se descartó por no determinismo. También se descartó dinero como cadena decimal (`"3.50"`) serializada: duplica conversiones en cada frontera sin ganar nada frente a centavos enteros.
