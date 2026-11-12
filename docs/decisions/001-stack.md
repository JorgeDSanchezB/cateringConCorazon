# ADR-001 — Stack: Next.js 16 App Router + TypeScript + Prisma + SQLite (objetivo de producción: PostgreSQL)

- **Estado**: aceptada.
- **Fecha**: 2025.

## Contexto

CATERING CON CORAZÓN es un negocio ecuatoriano de catering para eventos privados que necesita tres cosas simultáneas: una web pública con SEO digno, una API propia para el carrito y el panel interno, y una operación sin costes de infraestructura mientras el negocio arranca. El equipo es reducido (una persona de operación y soporte técnico puntual), por lo que cada pieza añadida debe justificarse.

En este entorno de desarrollo (sandbox) la base de datos debe ser un archivo local sin servicio externo obligatorio; en producción el negocio crecerá hacia un hosting con PostgreSQL. El entorno de ejecución del sandbox es Bun (bun.lock, scripts `db:seed` con bun), pero el proyecto es un Next.js estándar que corre igual con Node 20+.

## Decisión

1. **Next.js 16 App Router** (`next ^16.1.1`) como marco único para web pública y API (`src/app/api/**` son Route Handlers del propio framework). Una sola aplicación, un solo despliegue, cero backend separado.
2. **TypeScript** estricto en todo el código (`tsconfig.json` con `strict`, verificación con `bunx tsc --noEmit`).
3. **Prisma** (`^6.11.1`) como ORM: esquema declarativo único (`prisma/schema.prisma`), cliente tipado y migraciones controladas (`db:push`, `db:migrate`, `db:reset` definidos en `package.json`).
4. **SQLite embebido** en este entorno: `DATABASE_URL` apunta a `db/custom.db`. SQLite no soporta enums ni columnas Json nativas, por lo que:
   - los "enums" del dominio (roles, estados de pedido, canales, modos de precio) se modelan como `String` y se validan en la capa de aplicación con Zod (unión de literales);
   - `Product.attributes` se guarda como `String` JSON (equivalente funcional a JSONB) y se valida con JSON Schema + ajv (ADR-003).
5. **PostgreSQL como objetivo documentado de producción**: la migración prevista es (a) cambiar el `datasource` de `schema.prisma` a `postgresql` con su `DATABASE_URL` correspondiente y (b) activar el tipo `Json` real para `Product.attributes`, dejando el resto del modelo sin cambios. Esta previsión está declarada en la cabecera del propio `schema.prisma`.
6. **Runtime**: el entorno sandbox usa Bun (`bun install`, `bun run dev`, `bun run db:seed`); el proyecto no depende de extensiones exclusivas de Bun y funciona con Node 20+ (`npm install`, `npm run dev`). Las contraseñas usan bcryptjs (puro JavaScript, sin binarios nativos) y el JWT usa `jose`, ambas librerías portátiles entre runtimes.

Por qué este stack y no otro: App Router permite mezclar Server Components (primera pintura con datos de BD, SEO dinámico) con una SPA cliente (ADR-002 y ADR-014) sin duplicar framework; Prisma da tipado de BD a TypeScript con costo de aprendizaje mínimo; SQLite cumple el requisito de "funcionar sin servicios externos" del sandbox y tiene un camino documentado a PostgreSQL.

## Coste introducido

- **Duplicación de validación de "enums"**: al no existir enums SQL, cada valor restringido (rol, estado, canal, método de pago) se valida dos veces conceptualmente: Zod en entrada y disciplina de escritura en salida. Un valor corrupto escrito fuera de la aplicación no lo bloquea la BD.
- **`Product.attributes` sin JSONB real**: en SQLite no hay operadores JSON nativos ni índices sobre el contenido; las consultas por atributo exigen leer y parsear en aplicación.
- **SQLite es single-writer**: la serialización de escrituras la aprovecha deliberadamente el contador atómico de pedidos/facturas (`src/lib/services/counters.ts`), pero descarta despliegues multi-instancia hasta pasar a PostgreSQL.
- **Dependencia de `next dev`** para operar el panel en este entorno (ver README: no se usa `next build` en el sandbox).

## Alternativa descartada

**PostgreSQL desde el primer día** (o un servicio gestionado): se descartó para el sandbox porque exige un servicio externo en marcha antes de poder ejecutar nada, lo que contradice el requisito de arranque sin dependencias. El coste asumido es el punto de migración documentado en la decisión 5.

**MongoDB/Mongoose o microservicio + SPA separada**: se descartaron por introducir dos fuentes de verdad de tipado y duplicar despliegues para un equipo mínimo; no hay requisito que lo justifique (anti-sobreingeniería).
