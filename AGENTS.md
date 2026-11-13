# AGENTS.md — Guía para agentes de IA en este repositorio

Proyecto: **Catering con Corazón** — web pública + panel interno de una empresa
ecuatoriana de catering para eventos privados. Todo el texto visible al usuario
está en español (es-EC). La interfaz se administra 100 % desde el panel: **cero
hardcoding de contenido, precios ni configuración** — todo vive en la base de
datos o en ajustes editables.

## Stack (no negociable)

- Next.js 16 (App Router) + TypeScript 5 estricto.
- Tailwind CSS 4 + componentes shadcn/ui (estilo New York) + Lucide.
- Prisma ORM con SQLite (`db/custom.db`), client vía `import { db } from "@/lib/db"`.
- TanStack Query (server state) + Zustand (client state, p. ej. carrito).
- Runtime: **bun** (nunca npm/yarn/pnpm).
- zod para validación en APIs; bcryptjs + JWT (jose) para auth con cookie httpOnly.

## Comandos

```bash
bun run dev        # dev server en puerto 3000 (loguea a dev.log)
bun run lint       # ESLint — debe pasar sin errores antes de terminar
bun run db:push    # aplica prisma/schema.prisma a la BD (regenera el client)
bun run db:seed    # seed idempotente (prisma/seed.ts)
```

Nunca usar `bun run build` ni `next build` en este entorno. El server de
desarrollo debe correr siempre en el puerto 3000 y en segundo plano.

## Arquitectura de la app

Es una **SPA con hash router sobre una sola página** (ADR-002): el usuario solo
ve `/` (`src/app/page.tsx` → `src/components/ccc/app.tsx` despacha por hash).
Rutas públicas: `#/inicio`, `#/catalogo`, `#/combos`, `#/eventos`, `#/faq`,
`#/carrito`, `#/legal/:slug`. Panel: `#/admin/*`.

La API sí es REST bajo `src/app/api/`:

- `api/public/*` — sin auth, cacheable, rate-limited.
- `api/admin/*` — requiere cookie de sesión; roles `ADMIN`, `STAFF`, `CONTADOR`
  (ver ADR-004). Usar `requireUser(req, { roles: [...] })`.
- `api/auth/*` — login/logout/me/change-password.

## Mapa de directorios

```
prisma/schema.prisma      Modelo de datos. Tipos primitivos únicamente (sin listas).
prisma/seed.ts            Seed IDEMPOTENTE: los upsert no deben pisar decisiones
                          del admin (p. ej. isActive/isVisible de contenido).
src/lib/http.ts           apiHandler, jsonOk, parseBody, paginación por cursor.
src/lib/errors.ts         AppError y helpers → problemas RFC 7807.
src/lib/domain/           money, tax, pricing, order, discount, attributes…
src/lib/services/         Consultas Prisma (public-data, catalog, orders…).
src/components/ccc/public/    Vistas de la web pública (SPA).
src/components/ccc/admin/     Vistas del panel. Comparten piezas en ui-bits.tsx.
src/components/ccc/shared/    api-client, providers, hash-router, use-bootstrap.
src/components/ccc/store/     Zustand (carrito).
docs/decisions/           ADRs 001–015 — LEER el relevante antes de tocar un área.
docs/api-contract.md      Contrato de la API y envolventes de respuesta.
```

## Convenciones no negociables

1. **Dinero en centavos USD (enteros)** — nunca float ni strings en la BD ni en
   las APIs. Formatear con `fmt.money` / `formatMoney`; parsear con
   `parseMoneyToCents` (ADR-009). El componente admin `MoneyInput` conserva el
   texto mientras se teclea (permite "4.50", coma decimal es-EC) y normaliza al
   blur — no convertir a número en cada `onChange`.
2. **Errores como RFC 7807**: lanzar `AppError`/`NotFoundError`/`ValidationError`
   desde los handlers envueltos en `apiHandler`; nunca `NextResponse.json` de
   error crudo.
3. **Paginación por cursor** en todos los listados (ADR-010): envolvente
   `{ items, nextCursor }` con `ascCursorClause`/`descCursorClause`.
4. **WhatsApp es el único canal de pedido** (ADR-011): no inventar checkout
   online ni pasarelas de pago. El carrito genera el mensaje de WhatsApp.
5. **Feature flags** (ADR-007) controlan módulos visibles (IVA, facturación,
   combos, testimonios…). El public bootstrap expone `flags` + `settings` +
   `banners` + `legalPages`; no hardcodear habilitaciones en el cliente.
6. **Locale es-EC, moneda USD**, zona America/Guayaquil: números con punto
   decimal y coma de miles ($1,250.50), fechas es-EC.
7. **Seed idempotente**: los `update` de los upsert solo tocan texto/contenido,
   jamás `isActive`/`isVisible`/precios que el admin ya cambió.
8. **Claves de TanStack Query**: el bootstrap público usa la clave `"public-bootstrap"`
   (¡no la URL!). Invalidarla tras cualquier CRUD de contenido/ajustes que
   afecte la web pública.
9. **zod en toda entrada de API** (`parseBody`) con límites de longitud; precios
   validados como enteros en centavos (`requireCents`).

## Reglas del entorno sandbox

- El gateway solo expone el puerto 3000. Para llamar a otro mini-servicio, usar
  path relativo con `?XTransformPort=<puerto>`; nunca `http://localhost:<otro>`.
- El SDK `z-ai-web-dev-sdk` solo en backend (`src/app/api/**` o scripts
  server-side), jamás en componentes cliente.
- Mini-servicios en `mini-services/` con su propio `package.json` y puerto fijo.
- Verificación end-to-end con agent-browser apuntando a `http://127.0.0.1:3000`
  (no `localhost`). Flujo mínimo: abrir `/`, ejercitar el cambio hecho,
  revisar `agent-browser errors`/`console`, `bun run lint` y el final de
  `dev.log` (solo las líneas recientes).

## Credenciales de prueba

Admin: `admin@cateringconcorazon.ec` / `CorazonAdmin2025!` (la BD versionada
incluye datos de desarrollo; en producción regenerarla).

## Antes de dar por terminada una tarea

1. `bun run lint` sin errores (el warning preexistente de TanStack Virtual es aceptable).
2. `dev.log` sin errores de runtime tras probar.
3. Verificación en navegador del flujo afectado (ver arriba).
4. Footer fijo con `min-h-screen flex flex-col` + `mt-auto` en layouts nuevos.
5. Accesibilidad: labels/aria en controles, textos alternativos, foco visible.
