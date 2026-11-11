"use client";

import type { ThemeData } from "@/lib/theme";
import { themeToCss } from "@/lib/theme";

/**
 * Aplica el tema inyectando/actualizando el <style id="ccc-theme"> con las
 * variables CSS. El servidor lo pinta la primera vez (page.tsx); este módulo
 * lo actualiza en caliente tras guardar desde el admin — sin recargar el
 * servidor ni la página.
 */
export function applyThemeCss(theme: ThemeData): void {
  if (typeof document === "undefined") return;
  let el = document.getElementById("ccc-theme");
  if (!el) {
    el = document.createElement("style");
    el.id = "ccc-theme";
    document.head.appendChild(el);
  }
  el.textContent = themeToCss(theme);
}
