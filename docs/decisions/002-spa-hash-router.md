# ADR-002 — SPA en "/" con router hash (#/ruta): un único dominio, sin rutas extra

- **Estado**: aceptada.
- **Fecha**: 2025.

## Contexto

El entorno de publicación del proyecto sirve la aplicación bajo un único dominio y una única ruta visible; crear rutas HTTP nuevas (`/catalogo`, `/admin`) no está disponible para la operación en este entorno. Al mismo tiempo, el negocio necesita: web pública (inicio, catálogo, combos, eventos, FAQ, legales, carrito), panel de administración con múltiples módulos, y navegación directa por enlace (p. ej. "Panel interno" en el pie de la web).

La aplicación pública además debe recibir su primera pintura con datos reales de la base de datos (sin parpadeo ni doble carga) para que el SEO y la experiencia no dependan solo del JavaScript del cliente.

## Decisión

1. **Toda la aplicación vive en la ruta `/`**: `src/app/page.tsx` es un Server Component (`export const dynamic = "force-dynamic"`) que consulta la base de datos una vez (`getPublicBootstrap()`) y entrega la SPA con: metadatos SEO dinámicos (`generateMetadata` lee `seo_title`/`seo_description` de `SiteSetting`), variables CSS del tema inyectadas en un `<style id="ccc-theme">` (ADR-008) y el bootstrap inicial como prop (`<App initialBootstrap={...}>`).
2. **Navegación por hash**: `src/components/ccc/shared/hash-router.ts` implementa un router mínimo sobre `window.location.hash` (`#/ruta`) con escucha de `hashchange`. Rutas soportadas: `inicio`, `catalogo`, `combos`, `eventos`, `carrito`, `faq`, `legal/:slug`, `admin`, `admin/login` y `admin/<modulo>`.
3. **Un solo árbol de componentes**: `src/components/ccc/app.tsx` decide con el hash si renderiza la web pública (`SiteShell` + vistas de `ccc/public/*`) o el panel (`ccc/admin/admin-app.tsx`). El panel reutiliza el mismo bootstrap público para flags y formato de moneda.
4. **Enlaces internos**: cualquier enlace apunta a `href="#/..."` (helper `hashHref`), incluidos los banners del carrusel (`Banner.linkUrl` guarda valores como `#/catalogo`).
5. **Actualización de datos**: el bootstrap del cliente se refresca periódicamente (60 s) y tras guardar cambios en el panel, sin recargar la página.

## Coste introducido

- **SEO por sección**: los fragmentos de hash no son URL indexables por los buscadores; el SEO recae íntegramente en la pintura servida de `/` (ADR-014). No hay `<title>` distinto por "página" interna.
- **Sin `history` de navegador real**: atrás/adelante funcionan vía `hashchange`, pero no hay estados de historial con datos asociados; el scroll se normaliza a tope en cada navegación (decisión deliberada en el router).
- **Carga inicial de la SPA**: la primera visita descarga el JavaScript completo de la aplicación (pública y panel), aunque la primera pintura útil no depende de él.

## Alternativa descartada

**Rutas reales múltiples** (`/catalogo`, `/admin/pos`, rutas anidadas de App Router): es la arquitectura canónica de Next.js y daría SEO por sección, pero este entorno solo sirve `/`; además duplicaría la lógica de guardas de sesión en cada layout. Se descartó por requisito operativo, no por preferencia técnica.
