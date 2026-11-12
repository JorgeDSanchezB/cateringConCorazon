# ADR-015 — Testing: qué existe, qué no existe, y cómo añadirlo

- **Estado**: aceptada (documentación honesta).
- **Fecha**: 2025.

## Contexto

En este entorno de desarrollo no se escribieron pruebas automatizadas: la restricción operativa del sandbox limitó el alcance de verificación a la comprobación estática y al ejercicio manual de los flujos. Publicar un directorio de tests sin haberlos ejecutado, o declarar "cobertura verde" sin evidencia, sería mentir en la documentación; esta ADR deja constancia del estado real y del plan concreto para cerrar la deuda.

La lógica que más lo merece está deliberadamente aislada en módulos puros (`src/lib/domain/**`), sin dependencias de red ni de base de datos, precisamente para ser testeable cuando haya runner disponible.

## Decisión

1. **Declaración honesta**: el repositorio no incluye tests automatizados ejecutados. La verificación disponible y documentada en el README es:
   - `bun run lint` (ESLint sobre `.` con la configuración `eslint.config.mjs`); se espera 0 errores.
   - `bunx tsc --noEmit` (comprobación de tipos del proyecto según `tsconfig.json`); se espera 0 errores.
   El ejercicio funcional documentado (cómo reproducirlo por comandos, sin afirmar ejecuciones ajenas) vive en `docs/runbook.md`.
2. **Plan concreto para añadir tests (cuando el entorno lo permita)**:
   - **Runner**: Vitest (`vitest`) como framework de pruebas unitarias — compatible con el proyecto TypeScript/ESM — y el runner nativo `bun test` como alternativa inmediata en este entorno (ambos pueden coexistir; elegir uno y registrarlo como script `test` en `package.json`).
   - **Objetivo prioritario**: los módulos puros de `src/lib/domain/`:
     - `money.ts`: `formatMoney` (positivo, negativo, cero, magnitudes con agrupación de miles, símbolo configurable), `parseMoneyToCents` ("3.50", "3,50", "3", entradas inválidas → null), `requireCents` (negativos, flotantes, sobre el tope de $1M).
     - `tax.ts`: `applyTax` (redondeo half-up al centavo, base negativa → error, porcentaje fuera de 0-100 → error), `totalsWithTax` con `taxEnabled` off (taxPercent null, total = base) y on (snapshot del %).
     - `discount.ts`: `evaluateDiscount` con los 6 rechazos (`DISABLED`, `INACTIVE`, `NOT_STARTED`, `EXPIRED`, `MIN_SUBTOTAL`, `MAX_USES`), porcentaje y monto fijo, y el cap "descuento nunca supera el subtotal".
     - `pricing.ts`: `computeUnitPrice` (base, delta positivo/negativo, variante inexistente → null), `comboUnitPrice` (FIXED_PRICE, PERCENT_DISCOUNT con redondeo, configuración incompleta → null), `subtotalOf`.
     - `order.ts`: `cartSchema` (exactamente productId o comboId, cantidad 1-99, tope 60 ítems), `buildOrderLines` con catálogo falso en memoria: producto archivado/invisible → `PRODUCT_UNAVAILABLE`, variante desactivada → `VARIANT_UNAVAILABLE`, combos apagados → `COMBOS_DISABLED`, variante sobre combo → `VARIANT_ON_COMBO`, y el caso feliz con snapshots de nombre/precio correctos.
     - `attributes.ts`: shape con claves peligrosas → rechazo; límites de claves/bytes/profundidad; `validateAgainstSchema` contra una versión dada (producto v1 con esquema v1 aunque exista v2 activa); `parseAttributesForRender` con JSON corrupto → `{}`.
   - **Segundo nivel (tests de API con BD en memoria o transaccional)**: los contratos RFC 7807 (422 por campo, 409 `MIN_ORDER_NOT_MET`/`INSUFFICIENT_STOCK`/`INVALID_TRANSITION`, 409 `FLAG_*`), la paginación por cursor (idempotencia de `nextCursor`, `LIMIT_TOO_LARGE`) y la máquina de estados con sus efectos de stock. Requieren levantar la app contra una BD SQLite de prueba (p. ej. `DATABASE_URL=file:./test.db` + `db:push` + seed mínimo).
3. **Convención de honestidad en adelante**: cualquier test que se añada debe poder ejecutarse con un comando documentado y su resultado reportarse sin adornos; los tests se ejecutan antes de declararlos "pasando".

## Coste introducido

- **Deuda de calidad real y reconocida**: los módulos puros y los endpoints se verificaron estáticamente (lint/tsc) y por ejercicio manual documentado, no por suite automatizada; regresiones silenciosas son posibles hasta cerrar la deuda.
- **Costo de mantenimiento futuro**: adoptar Vitest añade dependencias y scripts; se asume al considerarlo menor que el riesgo de no tener red.

## Alternativa descartada

**Entregar tests sin verificar fingiendo que pasan** (esqueletos `*.test.ts` con expects triviales, "verdes" sin ejecutar): documentaría una garantía inexistente, la peor clase de deuda técnica porque se camufla de activo. Se descartó por honestidad epistémica. También se descartó "no documentar la ausencia": ocultaría el estado real del proyecto a quien lo opere después.
