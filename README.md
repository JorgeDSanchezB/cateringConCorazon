# CATERING CON CORAZÓN — Catering para eventos privados en Ecuador

Aplicación completa (web pública + panel interno) para un catering que se monta en el lugar del evento: menús artesanales (sándwiches de pollo, cubanos, dorilocos, bebidas naturales), combos, reservas por WhatsApp, punto de venta en sitio (POS), inventario con kardex, contabilidad de ingresos/egresos, facturación interna y contenido editable (textos, SEO, tema visual, legales) sin tocar código.

La web pública arma el pedido en el carrito y lo envía como mensaje estructurado a **un único WhatsApp** del negocio; el personal confirma por ese canal. No hay pagos en línea: la forma de pago se coordina con el cliente (ver [docs/decisions/011-whatsapp-unico-canal.md](docs/decisions/011-whatsapp-unico-canal.md)).

## Requisitos

- **Node 20+** o **Bun 1.1+** (en este entorno se usa Bun; el proyecto es Next.js estándar y funciona con ambos).
- **SQLite embebido** (archivo local; Prisma lo genera, no hace falta instalar nada).
- Nada externo obligatorio: sin pasarela de pago, sin servicio de correo, sin bucket S3, sin API key de IA para operar el negocio (el borrador legal asistido es opcional y degrada si el servicio no está disponible).

## Instalación

```bash
bun install    # recomendado en este entorno
# o bien: npm install
```

## Configuración

```bash
cp .env.example .env
```

Luego ajusta `DATABASE_URL` en `.env` (lee los comentarios del propio archivo). Detalle importante de Prisma con SQLite: **las rutas relativas se interpretan respecto al directorio de `prisma/schema.prisma`**, de modo que `file:../db/custom.db` apunta a la carpeta `db/` de la raíz del proyecto (la usada aquí); una ruta absoluta también sirve y es lo que usa este sandbox (`file:/home/z/my-project/db/custom.db`). Define `AUTH_SECRET` (32+ caracteres aleatorios) antes de salir del entorno de desarrollo: sin ella, el servidor deriva un secreto de desarrollo estable y registra un error de configuración.

Las variables de entorno son solo **técnicas** (límites, TTL de sesión, rate limits). Los datos de negocio (IVA %, WhatsApp, textos, tema, moneda) NO van aquí: viven en la base de datos y se editan desde el panel (ver `.env.example`).

## Base de datos

```bash
bun run db:push     # crea el esquema en SQLite (prisma db push)
bun run db:seed     # datos iniciales idempotentes (bun prisma/seed.ts)
```

El seed es **idempotente** (upserts sobre claves únicas e ids deterministas `seed-*`): re-ejecutarlo no duplica nada y es seguro. Siembra:

- 3 usuarios (ver "Acceso al panel").
- 2 categorías (Salados, Bebidas) y 4 productos con atributos v1, imagen e inventario inicial (200 uds. c/u con su movimiento "Ajuste inicial").
- 2 combos ("Combo Fiesta con Corazón" a precio fijo y "Combo Noche de Fiesta" con 10 % de descuento).
- Esquema de atributos v1 (sinGluten, vegetariano, nivelPicante, notas).
- Los 6 feature flags (IVA off, facturación off, variantes off, testimonios off, combos on, descuentos on) y todos los ajustes de negocio (IVA 15 % guardado pero apagado, mínimo por evento $50.00, prefijo de pedido `CCC-`, prefijo de factura `001-001-` con 9 dígitos, textos de marca/hero/SEO, disclaimer legal, pie).
- Tema visual (terracota + crema, verificado WCAG AA) y WhatsApp de ejemplo `+593000000000` con su plantilla de mensaje.
- 4 páginas legales completas, 6 preguntas de FAQ, 2 banners y 3 testimonios (los testimonios no se muestran hasta activar el flag).
- Contadores de pedidos y facturas en 0.

Nota: el seed **no** crea códigos de descuento. El primero (p. ej. `BIENVENIDA10`) se crea en un minuto desde el panel (Descuentos → Nuevo) o con `POST /api/admin/discounts` autenticado (ejemplo en [docs/runbook.md](docs/runbook.md)).

## Ejecución

```bash
bun run dev        # http://localhost:3000 (next dev -p 3000)
# o bien: npm run dev
```

NO uses `npm run build` en este entorno sandbox: la compilación de producción de este proyecto está pensada para otro flujo de despliegue y aquí solo se opera en desarrollo (ver limitaciones más abajo).

## Acceso al panel

1. Abre la web y baja al pie: enlace **"Panel interno"** (o ve directo a `http://localhost:3000/#/admin`).
2. Inicia sesión con una de las cuentas sembradas:

   | Rol | Email | Contraseña |
   |---|---|---|
   | Administrador | `admin@cateringconcorazon.ec` | `CorazonAdmin2025!` |
   | Staff de evento | `staff@cateringconcorazon.ec` | `CorazonStaff2025!` |
   | Contador | `contador@cateringconcorazon.ec` | `CorazonContador2025!` |

3. **Cambia estas contraseñas cuanto antes** desde el módulo **Usuarios** del panel (cada usuario puede cambiar la suya en "Contraseña" de la cabecera; un ADMIN puede forzar un reset con contraseña temporal de un solo uso).

Matriz de módulos por rol y máquina de estados de pedidos: [docs/decisions/004-roles.md](docs/decisions/004-roles.md) y [docs/decisions/005-modelo-eventos-pedidos.md](docs/decisions/005-modelo-eventos-pedidos.md).

## Estructura del repositorio

```text
prisma/                  schema.prisma (modelo completo) y seed.ts (idempotente)
src/lib/                 núcleo del servidor
  config.ts                variables técnicas (Zod) + whitelist MIME de subidas
  auth.ts http.ts errors.ts rate-limit.ts    sesión JWT, paginación cursor, RFC 7807, límites
  settings.ts flags.ts whatsapp.ts wcag.ts theme.ts fonts.ts    datos de negocio, IVA/flags/plantilla/contraste
  domain/                  PURA y testeable: money, tax, pricing, discount, order (buildOrderLines), attributes (ajv)
  services/                capa de aplicación: orders (booking/onsite/estados), catalog, inventory, invoices,
                           counters, payments/expenses vía rutas, public-data (bootstrap), theme, users
src/app/                 App Router: page.tsx (SSR de "/" con bootstrap) y layout.tsx (fuentes next/font)
  api/public/              bootstrap, catalog, products/:id, combos, events, legal/:slug,
                           discounts/validate, orders (reserva)
  api/auth/                login, logout, me, change-password
  api/admin/              overview, orders (+onsite, status, payments), inventory (+adjust, movements),
                           products/variants, categories, combos, discounts, events, attribute-schemas,
                           accounting/summary, payments, expenses, invoices (+void), users (+reset-password),
                           theme, settings, flags, whatsapp, content (banners/testimonials/faqs), legal,
                           media, ai/draft
src/components/ccc/      la aplicación (SPA hash router, ADR-002)
  public/                 site-shell, home, catalogo, combos, eventos, carrito, faq, legal, tarjetas
  admin/                  admin-app (módulos por rol), pos, pedidos, inventario, contabilidad, facturación,
                           catálogo, contenido, legales, usuarios, tema, whatsapp, flags, ajustes
  shared/                 hash-router, api-client, bootstrap, theme-apply, providers
  store/                  carrito (zustand)
src/components/ui/       primitivas shadcn/ui (button, dialog, tabs, select, tabla virtual)
public/                  images (semilla), uploads (medios subidos), robots.txt, logo.svg
db/                      custom.db (SQLite local; respaldar con la app detenida)
docs/                    decisions/ (ADRs 001-015), api-contract.md, runbook.md
scripts/                 generate-images.ts (imágenes semilla generadas con IA)
```

## Extensibilidad end-to-end: añadir un atributo nuevo (ej. `sabor`) sin tocar el núcleo

Todo el pipeline de atributos es genérico: la tarjeta del catálogo renderiza los atributos presentes sin conocer las claves (`AttributeChips`), el dominio valida contra el JSON Schema versionado y el pedido recalcula precios del servidor. Añadir `sabor` (o cambiar cualquier atributo) no toca `src/`:

1. **Publicar el esquema v2** — panel → módulo **Esquemas** (`#/admin/schemas`, ADMIN) → crear la versión 2 copiando la v1 y añadiendo la clave:

   ```json
   {
     "type": "object",
     "properties": {
       "sinGluten": { "type": "boolean" },
       "vegetariano": { "type": "boolean" },
       "nivelPicante": { "type": "string", "enum": ["suave", "medio", "fuerte"] },
       "notas": { "type": "string", "maxLength": 80 },
       "sabor": { "type": "string", "enum": ["dulce", "salado", "agridulce"] }
     },
     "additionalProperties": false
   }
   ```

   Al guardar, el backend fuerza `additionalProperties:false` (mundo cerrado) y la activa como esquema vigente; los productos existentes siguen validando contra su propia versión (v1) al editarse — compatibilidad hacia atrás (ADR-003).

2. **Editar los productos** — panel → módulo **Productos** (`#/admin/products`, ADMIN) → editar cada producto → pestaña de atributos → añadir `sabor: "salado"`. Flujo real de esa edición: Controller (`/api/admin/products/:id`) → Zod (shape base) → pipeline de atributos (`inspectAttributes`: claves peligrosas bloqueadas, ≤32 claves, ≤16 KB, profundidad ≤2) → ajv contra la versión declarada del producto → persistencia como JSON en texto (`Product.attributes` + `attributeSchemaVersion`) → snapshot de nombre/precio intacto en pedidos históricos.
3. **Ver el resultado** — web pública → catálogo: la tarjeta del producto muestra el chip "Sabor: salado" sin ningún cambio de código (el render dinámico usa etiquetas legibles derivadas de la clave, p. ej. `sinGluten` → "Sin gluten").

Comandos de verificación equivalentes por API (con sesión ADMIN) están en [docs/runbook.md](docs/runbook.md).

## Estado de calidad

Verificado en este entorno:

- `bun run lint` → **0 errores** (1 warning informativo conocido: `react-hooks/incompatible-library` en `src/components/ccc/admin/virtual-table.tsx`, emitido por el React Compiler al usar `useVirtualizer()` de TanStack Virtual, que devuelve funciones no memoizables; es un aviso de la propia librería, no un defecto del código).
- `bunx tsc --noEmit` → **0 errores**.

Cómo reproducirlo tú mismo:

```bash
bun run lint         # se espera: "0 errors" (puede mostrar el warning citado)
bunx tsc --noEmit    # se espera: sin salida (exit 0)
```

**Tests automatizados: no incluidos en este entorno** (restricción operativa del sandbox). El plan concreto para añadirlos (Vitest / `bun test` sobre `src/lib/domain/`: money, tax, discount, pricing, order, attributes) está documentado en [docs/decisions/015-testing.md](docs/decisions/015-testing.md).

## Limitaciones conocidas (honestidad del alcance)

- **Sin pasarela de pago**: el pago se coordina por WhatsApp y se registra manualmente en el panel (decisión de negocio, ADR-011).
- **Sin multiidioma**: idioma único español de Ecuador (`layout.tsx` con `lang="es"`; locale configurable en Ajustes para formato).
- **Sin integración SRI real**: la facturación es interna con numeración configurable; no emite comprobantes electrónicos oficiales (ADR-013).
- **Sin entregas a domicilio**: por decisión de negocio el catering se monta en el lugar del evento (los términos sembrados y el FAQ lo declaran).
- **Imágenes semilla generadas con IA** (`scripts/generate-images.ts`): sustituibles desde el panel (Contenido/Medios y Productos).
- **Entorno sandbox**: se opera con `bun run dev`; no se usa `npm run build` aquí. SQLite en archivo local (migración a PostgreSQL documentada en ADR-001).
- **Rate limiting en memoria** (por proceso): suficiente para un despliegue único; horizontalizar exigiría Redis o equivalente.

## Documentación

- Decisiones de arquitectura: [docs/decisions/](docs/decisions/) (ADR-001 a ADR-015).
- Contratos de API: [docs/api-contract.md](docs/api-contract.md).
- Operación diaria, respaldos y solución de problemas: [docs/runbook.md](docs/runbook.md).
