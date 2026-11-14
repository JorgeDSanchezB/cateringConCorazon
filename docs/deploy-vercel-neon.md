# Despliegue en Vercel + Neon (PostgreSQL)

Guía paso a paso para llevar este proyecto a producción con
**Vercel** (hosting serverless) y **Neon** (PostgreSQL serverless).
El desarrollo local sigue usando SQLite: nada de lo que hay aquí
afecta al sandbox o a `bun run dev`.

## Arquitectura resultante

| Pieza | Local (sandbox) | Producción (Vercel) |
|---|---|---|
| Hosting | `bun run dev` (puerto 3000) | Vercel (Next.js) |
| Base de datos | SQLite `db/custom.db` | Neon PostgreSQL |
| Subida de imágenes | disco `public/uploads` | **Dentro de Neon** (opcional: Vercel Blob) |
| Secreto de sesiones | fallback de desarrollo | `AUTH_SECRET` (obligatoria) |

Qué preparó el código:

- `vercel.json` define el build (`bun run build:vercel`): genera el esquema
  Postgres desde `prisma/schema.prisma` (fuente única), genera el cliente
  Prisma correcto y compila con `next build`.
- `scripts/neon-deploy.ts` orquesta la BD en Neon (`db:push-neon`,
  `db:migrate-neon`, `db:seed-neon`, `db:deploy-neon`).
- `src/lib/storage.ts` sube imágenes al almacén según el modo: **dentro de
  Neon** (base64 + `GET /api/media/<id>`) por defecto en Vercel, a Vercel
  Blob si existe `BLOB_READ_WRITE_TOKEN` (mejora opcional con CDN), o a
  disco local en desarrollo. Cero servicios extra obligatorios.
- `src/lib/config.ts` **aborta el arranque en Vercel sin `AUTH_SECRET`**
  (fail-fast en el deploy, no en producción con secreto débil).

## Paso 1 — Crear la base de datos en Neon

1. Crea una cuenta en [neon.tech](https://neon.tech) y un proyecto
   (p. ej. `catering-con-corazon`, región cercana a tus usuarios).
2. En el dashboard, abre **Connection Details** y copia las DOS cadenas:
   - **Pooled** (contiene `-pooler.`): para la app en Vercel.
   - **Direct** (sin `-pooler.`): para los scripts de migración de este repo.
   Ambas terminan en `?sslmode=require`.

## Paso 2 — Crear las tablas y cargar los datos

Desde el sandbox (o tu clon local con Bun instalado):

```bash
# Crea las tablas en Neon y copia TODOS los datos actuales del sandbox
# (productos, pedidos, banners con sus fotos, usuarios, ajustes, tema…):
NEON_DATABASE_URL="postgresql://…direct…" bun run db:deploy-neon
```

Alternativas:

```bash
bun run db:push-neon      # solo crear/actualizar tablas
bun run db:migrate-neon   # solo re-sincronizar datos (borra y reinserta en Neon)
bun run db:seed-neon      # datos de demostración limpios (en vez de los reales)
```

Notas:

- `migrate` es **destructivo con Neon, no con el SQLite de origen**: re-ejecutarlo
  vuelve a sincronizar desde cero (útil si el sandbox es tu fuente de verdad).
- Los scripts usan la cadena **directa** (el pooler/PgBouncer interfiere con DDL).
- Las imágenes ya subidas viven en `public/uploads` **versionado en git**, así que
  Vercel las sirve como assets estáticos: los datos migrados siguen funcionando.

## Paso 3 — Subidas de imágenes en producción (ya resuelto con Neon)

El filesystem de Vercel es de **solo lectura**, así que las imágenes nuevas
que subas desde el panel **no** pueden guardarse en disco. La solución por
defecto no requiere NINGÚN servicio adicional:

- **Modo `db` (automático en Vercel sin configurar nada)**: la imagen se
  guarda DENTRO de Neon (columna `MediaAsset.data`, base64) y se sirve por
  `GET /api/media/<id>` con caché inmutable de un año. Las imágenes ya
  subidas siguen siendo archivos estáticos del repo (`public/uploads`).
- **Modo `blob` (opcional)**: si algún día quieres CDN y descarga la BD,
  crea un store en Vercel (**Storage → Blob → Create**) y conéctalo al
  proyecto: al aparecer `BLOB_READ_WRITE_TOKEN` el adaptador cambia solo y
  las subidas nuevas irán a Blob. Las URL existentes siguen funcionando.
- Forzar un modo concreto: variable `MEDIA_STORAGE=local|db|blob` (raro que
  haga falta; útil en self-hosted).

## Paso 4 — Importar el proyecto en Vercel

1. En [vercel.com/new](https://vercel.com/new) importa el repo de GitHub
   (`JorgeDSanchezB/cateringConCorazon`). Framework: **Next.js** (auto-detectado).
   El `vercel.json` ya define el build command; no lo cambies.
2. **Settings → Environment Variables** (Production + Preview):

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | cadena **POOLED** de Neon (con `-pooler.` y `?sslmode=require`) |
   | `AUTH_SECRET` | `openssl rand -hex 32` (sin esto el deploy falla a propósito) |
   | `BLOB_READ_WRITE_TOKEN` | **Opcional**: solo si quieres Blob (Paso 3, modo blob) |

3. Deploy. La primera compilación tarda un poco (instala dependencias,
   genera el cliente Prisma Postgres y compila).

## Paso 5 — Verificación post-despliegue

- [ ] La home carga con tema y catálogo (datos de Neon).
- [ ] El carrusel de portada muestra las imágenes.
- [ ] `#/admin` → login con el usuario ADMIN (el migrado del sandbox o el del seed).
- [ ] **Cambiar la contraseña** del admin (si migraste datos de desarrollo).
- [ ] Contenido → Carrusel → editar una tarjeta → Elegir imagen → **subir una
      imagen nueva** (con el modo `db` por defecto debe aparecer con URL
      `/api/media/<uuid>`; si configuraste Blob, `blob.vercel-storage.com`).
- [ ] Crear un pedido de prueba desde la web pública y confirmar el WhatsApp.
- [ ] Contabilidad/POS cargan (lectura de Neon correcta).

## Limitaciones conocidas del modelo serverless

- **Rate limiting en memoria** (`src/lib/rate-limit.ts`): por instancia de
  función; con tráfico alto conviene un store compartido (Upstash Redis, etc.).
- **Borrador IA legal** (`/api/admin/ai/draft`): usa `z-ai-web-dev-sdk`;
  sin sus credenciales en Vercel devuelve un 500 controlado con mensaje claro
  y el editor manual sigue funcionando (degradación diseñada).
- **Cachés en memoria** (bootstrap público): refrescan por invalidación de
  TanStack Query del admin; en serverless la invalidación llega con la
  siguiente instancia fría (máx. ~60 s por TTL).
- `Caddyfile`, `.zscripts/` y `mini-services/` son artefactos del sandbox:
  Vercel los ignora.

## Mantenimiento

- Cambios de esquema: edita `prisma/schema.prisma` → `bun run db:push` (local)
  → `NEON_DATABASE_URL="…" bun run db:push-neon` (Neon) → redeploy en Vercel.
- Resincronizar datos del sandbox a Neon: `NEON_DATABASE_URL="…" bun run db:migrate-neon`
  (⚠️ reemplaza el contenido de Neon, incluidas las imágenes guardadas en la
  BD por el modo `db`: lo que se haya subido directamente en producción se
  perdería; haz antes un backup o exporta esos assets).
- El cliente Prisma local siempre es SQLite: los scripts de Neon restauran el
  estado local al terminar (`prisma generate`).
