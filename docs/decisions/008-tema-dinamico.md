# ADR-008 — Tema dinámico: variables CSS inyectadas en runtime con validación WCAG AA en servidor

- **Estado**: aceptada.
- **Fecha**: 2025.

## Contexto

El titular quiere ajustar colores, tipografías, radio/sombra, logo y favicon de la web sin pedir un despliegue y sin aprender CSS. La vía "canónica" en un proyecto Tailwind es recompilar (`tailwind.config.ts`) por cada cambio, algo imposible de operar desde un panel. Al mismo tiempo, abrir colores arbitrarios rompe la legibilidad si nadie vigila el contraste, y abrir tipografías arbitrarias crea dependencias externas y superficies de riesgo.

## Decisión

1. **El tema es una fila de BD** (`ThemeSetting`, singleton con `id="theme"`): 11 colores hex (#RRGGBB), `radiusLevel` (none/sm/md/lg/xl mapeados a píxeles en `src/lib/theme.ts`), `shadowLevel` (none/sm/md/lg), `fontHeading`/`fontBody` (claves de la whitelist de tipografías), `logoUrl`, `faviconUrl`.
2. **Variables CSS en runtime**: `themeToCss(theme)` genera el bloque `:root{ --background: <color>; --foreground: <color>; --primary: <color>; --radius: <px>; --font-heading: var(--font-x); }` y todas las variables derivadas (popover, sidebar, input, ring, sombra). Ese bloque se inyecta en dos momentos:
   - **Servidor (primera pintura)**: `src/app/page.tsx` emite `<style id="ccc-theme">` con el tema leído de BD en el render; no hay parpadeo de tema por defecto.
   - **Cliente (en caliente)**: al guardar desde el panel, `applyThemeCss` reescribe el mismo `<style>` sin recargar la página. No se recompila CSS ni se reinicia el servidor.
3. **Validación WCAG AA 4.5:1 en el servidor antes de guardar** (`src/lib/wcag.ts`): se evalúan 6 pares texto/fondo críticos (general/fondo, general/tarjeta, botón primario, acento, y dos pares de texto suave). Un par que no alcanza 4.5:1 produce 422 con el detalle del par que falla y su ratio; el guardado se bloquea (el editor también avisa en vivo, pero el servidor es quien manda).
4. **Tipografías por whitelist**: `src/lib/fonts.ts` registra 5 familias (playfair, lora, montserrat, inter, poppins) cargadas todas con `next/font` en el layout; el tema referencia sus variables CSS. Clave desconocida degrada a la sans de sistema. No se aceptan URLs de fuentes arbitrarias (seguridad y determinismo); añadir una fuente nueva es una decisión técnica de presentación (layout + registro), no un dato de negocio.
5. **Paleta sembrada** (terracota + crema) verificada contra los mismos 6 pares.

## Coste introducido

- **Carga de 7 familias de fuentes** (5 de la whitelist + Geist/Geist Mono) en el layout para permitir cambio en caliente sin recarga: mayor peso inicial de página; mitigado por `next/font` (self-hosted, sin red externa en runtime) y subsets latín.
- **`<style>` inline con `dangerouslySetInnerHTML`**: el contenido es generado por `themeToCss` desde valores validados (hex estricto y enumeraciones), no desde entrada libre del usuario; es la superficie deliberada para poder cambiar el tema sin recompilar.
- **Contraste solo en 6 pares declarados**: colores usados de formas no previstas (p. ej. un color nuevo en un componente a medida) quedan fuera del chequeo automático.

## Alternativa descartada

**Recompilar CSS/Tailwind por cambio de tema** (dark mode por `class`, tokens en `tailwind.config.ts`): exige despliegue o build por ajuste estético y hace imposible el editor "en caliente" desde el panel; también se descartó aceptar CSS/cadena de estilo libre desde el admin (riesgo de inyección de estilos y de romper el layout) y aceptar URLs de Google Fonts arbitrarias (dependencia externa no controlada).
