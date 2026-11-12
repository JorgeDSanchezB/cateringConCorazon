"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Router hash (#/ruta) — toda la app vive en "/" (requisito del entorno de
 * preview). Navegación declarada en ADR-002.
 * Rutas: inicio, catalogo, combos, eventos, carrito, legal/:slug,
 * admin, admin/login, admin/<modulo>.
 */
export function parseHash(): string {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const clean = raw.replace(/\/+$/, "").trim();
  return clean === "" ? "inicio" : clean;
}

export function useHashRoute(): { path: string; navigate: (to: string) => void } {
  const [path, setPath] = useState<string>("inicio");

  useEffect(() => {
    const update = () => setPath(parseHash());
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  const navigate = useCallback((to: string) => {
    const target = to.replace(/^#?\/?/, "");
    window.location.hash = `/${target}`;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  return { path, navigate };
}

/** Enlace interno como href de hash router. */
export function hashHref(path: string): string {
  return `#/${path.replace(/^#?\/?/, "")}`;
}
