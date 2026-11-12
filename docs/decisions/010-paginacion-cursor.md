# ADR-010 — Paginación por cursor (?limit=&cursor=) en todos los listados

- **Estado**: aceptada.
- **Fecha**: 2025.

## Contexto

Los listados del proyecto crecen sin límite conocido: pedidos ONSITE se acumulan por evento, movimientos de inventario por cada ajuste y venta, facturas, gastos, medios. Con `OFFSET/LIMIT` clásico, cada página se encarece con el tamaño de la tabla (SQLite debe saltar N filas), y las filas nuevas insertadas durante la navegación desplazan el "corte" produciendo duplicados o saltos entre páginas.

## Decisión

1. **Todos los listados exponen `?limit=` y `?cursor=`** con el mismo contrato (`src/lib/http.ts`):
   - `limit` ausente → `DEFAULT_PAGE_LIMIT` (24); inválido → 422 `LIMIT_INVALID`; mayor que `MAX_PAGE_LIMIT` → 422 `LIMIT_TOO_LARGE` informando el máximo (por defecto 50, configurable por entorno hasta 500).
   - `cursor` es base64url de `{"v1": "...", "v2": "..."}`: primer componente de ordenación + id como desempate. Cursor corrupto → 422 `CURSOR_MALFORMED` (nunca se ignora en silencio).
2. **Keyset pagination**: la página siguiente se lee con la cláusula equivalente a `(campo >|< c1) OR (campo = c1 AND id >|< c2)`, según el orden natural del listado:
   - descendente por fecha: pedidos, descuentos, movimientos, medios, facturas (`issuedAt`), pagos (`receivedAt`), gastos (`spentAt`), inventario (`updatedAt`);
   - ascendente por `sortOrder,id`: catálogo público, productos admin, categorías, combos, banners, FAQ, testimonios;
   - ascendente por fecha del evento: próximos eventos públicos.
3. **Lectura con `take = limit + 1`**: si llegó una fila más, se recorta y el último ítem devuelto genera el `nextCursor`; `nextCursor: null` significa fin. Respuesta uniforme `{ "items": [...], "nextCursor": string|null }`.
4. **Índices compuestos declarados** en `schema.prisma` (`@@index([createdAt, id])`, `@@index([sortOrder, id])`, y equivalentes por tabla) para que la cláusula keyset use índice.
5. La UI consume esto como "cargar más" (`useInfiniteQuery` en el panel; botón "Cargar más" en catálogo), con virtualización en las tablas que crecen.

## Coste introducido

- **Sin "página N de M"**: el cliente no conoce el total; solo sabe si hay más. No hay salto a página arbitraria, solo avance (y volver a empezar).
- **Cursores opacos**: aunque viajan en claro dentro del base64, el formato es interno del servidor y puede cambiar; los clientes no deben fabricarlos a mano (usar el `nextCursor` devuelto).
- **Contrato más verboso** que `?page=2` y un helper obligatorio (`getPagination`) en cada endpoint de listado: la uniformidad lo compensa.

## Alternativa descartada

**OFFSET/OFFSET+LIMIT**: O(offset) en SQLite, duplicación/salto de filas con escrituras concurrentes (las ventas ONSITE se registran justo mientras el staff pagina), y contadores totales extraños en tablas que crecen por segundo. Se descartó por corrección y coste. También se descartó "traerlo todo" (sin paginar) para tablas como movimientos de inventario o pedidos: crece sin cota con la operación del negocio.
