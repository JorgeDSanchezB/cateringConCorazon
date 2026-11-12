# ADR-014 — Catálogo CSR paginado sobre bootstrap SSR: SEO y primera pintura en servidor, listado en cliente

- **Estado**: aceptada.
- **Fecha**: 2025.

## Contexto

La página pública compite por búsqueda local ("catering para eventos en Ecuador"): el título, la descripción, el hero y el contenido de marca deben llegar desde el servidor con datos reales de la base de datos (nada de textos vacíos en el HTML o dependencia del primer fetch del cliente). Pero el catálogo es un listado paginado y filtrable que cambia con la operación diaria (precios, visibilidad, stock de presentación) y que el admin edita a mitad de operación; renderizarlo entero en el servidor en cada visita acarrearía latencia y cachés por invalidar.

## Decisión

1. **Primera pintura SSR con datos de BD**: `src/app/page.tsx` es un Server Component `force-dynamic` que llama a `getPublicBootstrap()` (settings completos, flags, tema, WhatsApp, banners, testimonios si el flag, FAQ, referencias legales, categorías) y pasa todo como `initialBootstrap` a la SPA. El HTML llega con el hero real (`hero_title`, `hero_subtitle`, CTAs), textos de marca, tema inyectado y metadatos SEO.
2. **SEO dinámico desde datos**: `generateMetadata()` lee `seo_title`/`seo_description` de `SiteSetting` (editables en "Ajustes", grupo "seo"), añade OpenGraph y favicon del tema. Nada de SEO hardcodeado; el título por defecto del layout es solo un respaldo.
3. **Catálogo (y combos, eventos, listados admin) en cliente**: la vista de catálogo consume `GET /api/public/catalog?limit&cursor&type&category&featured&q` con `useInfiniteQuery` ("cargar más"), orden `sortOrder` ascendente; las tarjetas (`ProductCard`, memoizada) renderizan atributos dinámicamente sin conocer claves (ADR-003) y los precios con el formato de moneda del bootstrap.
4. **Refresco sin recargar**: el cliente refresca el bootstrap periódicamente (60 s) y al invalidar tras guardar en el panel; el catálogo consulta la API en vivo en cada interacción (la fuente de verdad del catálogo es el endpoint, no el bootstrap).
5. **Detalle de producto y combos** también son consultas de cliente (`/api/public/products/:id`, `/api/public/combos`), con degradación a lista vacía si el flag de combos está apagado.

## Coste introducido

- **SEO efectivo solo de la portada** (`/`): las "páginas" internas son fragmentos de hash no indexables (ADR-002); los productos no tienen URL propia indexable. Para el tipo de búsqueda local objetivo (marca + servicio) se consideró suficiente; si algún día se exige SEO por producto, esta decisión y la 002 deben revisarse juntas.
- **Dos mecanismos de datos** que entender: bootstrap inicial (SSR, prop) y queries de cliente (API). Se mitigó unificando el shape: el bootstrap que sirve el servidor es el mismo contrato que expone `/api/public/bootstrap`.
- **`force-dynamic`**: cada visita a `/` consulta la BD (no hay caché de página estática); es el precio de que los cambios del panel se reflejen al instante.

## Alternativa descartada

**Catálogo SSR completo** (renderizar cada página del listado en servidor, con SSG/ISR por producto): latencia por visita o invalidaciones de caché por cada edición del panel (que ocurren a diario), y conflicto directo con la SPA de hash router; además el listado paginado "cargar más" no encaja bien con rutas de página SSR. Se descartó por coste sin beneficio real para este negocio.
