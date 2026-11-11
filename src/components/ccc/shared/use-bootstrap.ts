"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api-client";
import type { PublicBootstrap } from "@/lib/services/public-data";
import { formatMoney } from "@/lib/domain/money";

/**
 * Hook de bootstrap público (settings/flags/tema/whatsapp/contenido).
 * staleTime 60s: los cambios del admin se reflejan al refrescar la vista
 * o al invalidar tras guardar.
 */
export function useBootstrap() {
  return useQuery({
    queryKey: ["public-bootstrap"],
    queryFn: () => api<PublicBootstrap>("/api/public/bootstrap"),
    staleTime: 60_000,
  });
}

export function useBootstrapData(): PublicBootstrap | null {
  const { data } = useBootstrap();
  return data ?? null;
}

/** Formateo de dinero/fecha con los settings del sitio (sin hardcoding). */
export function useSiteFormat() {
  const bootstrap = useBootstrapData();
  const symbol = bootstrap?.settings.currencySymbol ?? "$";
  const timezone = bootstrap?.settings.timezone ?? "America/Guayaquil";
  const locale = bootstrap?.settings.locale ?? "es-EC";
  return {
    money: (cents: number) => formatMoney(cents, symbol),
    date: (iso: string | Date | null | undefined) => {
      if (!iso) return "—";
      try {
        return new Intl.DateTimeFormat(locale, {
          timeZone: timezone,
          dateStyle: "medium",
        }).format(new Date(iso));
      } catch {
        return new Date(iso).toISOString().slice(0, 10);
      }
    },
    datetime: (iso: string | Date | null | undefined) => {
      if (!iso) return "—";
      try {
        return new Intl.DateTimeFormat(locale, {
          timeZone: timezone,
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(iso));
      } catch {
        return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
      }
    },
    symbol,
    timezone,
    locale,
  };
}
