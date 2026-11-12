import { z } from "zod";
import type { ThemeSetting } from "@prisma/client";
import { fontCssVar, FONT_KEYS } from "./fonts";
import { isValidHexColor } from "./wcag";

/**
 * Tema visual editable desde admin (ThemeSetting singleton).
 * Los valores NO viven en CSS compilado: se inyectan como variables CSS en
 * runtime (servidor y cliente) → cambiar colores/tipografías se refleja en
 * la web pública SIN reiniciar el servidor.
 */

export interface ThemeData {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  radiusLevel: "none" | "sm" | "md" | "lg" | "xl";
  shadowLevel: "none" | "sm" | "md" | "lg";
  fontHeading: string;
  fontBody: string;
  logoUrl: string | null;
  faviconUrl: string | null;
}

/**
 * Paleta por defecto (también usada por el seed y como fallback):
 * terracota + crema, "con corazón". Verificada AA: todos los pares
 * texto/fondo superan 4.5:1 (ver tests de verificación en el runbook).
 */
export const DEFAULT_THEME: ThemeData = {
  background: "#FFF9F2",
  foreground: "#3B241A",
  card: "#FFFFFF",
  cardForeground: "#3B241A",
  primary: "#9E2B1E",
  primaryForeground: "#FFFFFF",
  accent: "#E8A33D",
  accentForeground: "#3B241A",
  muted: "#F6EBDD",
  mutedForeground: "#7A655C",
  border: "#E5D5C5",
  radiusLevel: "lg",
  shadowLevel: "md",
  fontHeading: "playfair",
  fontBody: "inter",
  logoUrl: null,
  faviconUrl: null,
};

/** Niveles de radio (mapeo técnico clave → píxeles). */
export const RADIUS_LEVELS: Record<ThemeData["radiusLevel"], string> = {
  none: "0px",
  sm: "6px",
  md: "10px",
  lg: "14px",
  xl: "20px",
};

/** Niveles de sombra (mapeo técnico clave → box-shadow). */
export const SHADOW_LEVELS: Record<ThemeData["shadowLevel"], string> = {
  none: "none",
  sm: "0 1px 2px rgba(59, 36, 26, 0.08)",
  md: "0 4px 12px rgba(59, 36, 26, 0.10)",
  lg: "0 12px 32px rgba(59, 36, 26, 0.16)",
};

const hexField = z.string().refine(isValidHexColor, { message: "Color hex inválido (#RRGGBB)" });
const pathOrNull = z
  .string()
  .max(300)
  .regex(/^(\/[\w\-./%?=&]+|https?:\/\/.+)$/, "Debe ser ruta interna (/...) o URL http(s)")
  .nullable()
  .optional();

/** Esquema de actualización del tema (validación servidor). */
export const themeUpdateSchema = z.object({
  background: hexField,
  foreground: hexField,
  card: hexField,
  cardForeground: hexField,
  primary: hexField,
  primaryForeground: hexField,
  accent: hexField,
  accentForeground: hexField,
  muted: hexField,
  mutedForeground: hexField,
  border: hexField,
  radiusLevel: z.enum(["none", "sm", "md", "lg", "xl"]),
  shadowLevel: z.enum(["none", "sm", "md", "lg"]),
  fontHeading: z.enum(FONT_KEYS as [string, ...string[]]),
  fontBody: z.enum(FONT_KEYS as [string, ...string[]]),
  logoUrl: pathOrNull,
  faviconUrl: pathOrNull,
});

export type ThemeUpdate = z.output<typeof themeUpdateSchema>;

/** Fila de BD → ThemeData (tolera campos nulos con defaults par a par). */
export function rowToTheme(row: ThemeSetting | null | undefined): ThemeData {
  if (!row) return { ...DEFAULT_THEME };
  return {
    background: row.background,
    foreground: row.foreground,
    card: row.card,
    cardForeground: row.cardForeground,
    primary: row.primary,
    primaryForeground: row.primaryForeground,
    accent: row.accent,
    accentForeground: row.accentForeground,
    muted: row.muted,
    mutedForeground: row.mutedForeground,
    border: row.border,
    radiusLevel: (["none", "sm", "md", "lg", "xl"].includes(row.radiusLevel)
      ? row.radiusLevel
      : "lg") as ThemeData["radiusLevel"],
    shadowLevel: (["none", "sm", "md", "lg"].includes(row.shadowLevel)
      ? row.shadowLevel
      : "md") as ThemeData["shadowLevel"],
    fontHeading: row.fontHeading,
    fontBody: row.fontBody,
    logoUrl: row.logoUrl ?? null,
    faviconUrl: row.faviconUrl ?? null,
  };
}

/**
 * Genera el bloque `:root{...}` con las variables CSS del tema.
 * Se usa en el server component (primera pintura) y en el cliente (tras
 * guardar el tema desde admin, actualizando el <style id="ccc-theme">).
 */
export function themeToCss(theme: ThemeData): string {
  const radius = RADIUS_LEVELS[theme.radiusLevel] ?? RADIUS_LEVELS.lg;
  const shadow = SHADOW_LEVELS[theme.shadowLevel] ?? SHADOW_LEVELS.md;
  return [
    `:root{`,
    `--background:${theme.background};`,
    `--foreground:${theme.foreground};`,
    `--card:${theme.card};`,
    `--card-foreground:${theme.cardForeground};`,
    `--popover:${theme.card};`,
    `--popover-foreground:${theme.cardForeground};`,
    `--primary:${theme.primary};`,
    `--primary-foreground:${theme.primaryForeground};`,
    `--secondary:${theme.muted};`,
    `--secondary-foreground:${theme.foreground};`,
    `--muted:${theme.muted};`,
    `--muted-foreground:${theme.mutedForeground};`,
    `--accent:${theme.accent};`,
    `--accent-foreground:${theme.accentForeground};`,
    `--border:${theme.border};`,
    `--input:${theme.border};`,
    `--ring:${theme.primary};`,
    `--sidebar:${theme.card};`,
    `--sidebar-foreground:${theme.cardForeground};`,
    `--sidebar-primary:${theme.primary};`,
    `--sidebar-primary-foreground:${theme.primaryForeground};`,
    `--sidebar-accent:${theme.muted};`,
    `--sidebar-accent-foreground:${theme.foreground};`,
    `--sidebar-border:${theme.border};`,
    `--sidebar-ring:${theme.primary};`,
    `--radius:${radius};`,
    `--theme-shadow:${shadow};`,
    `--font-heading:${fontCssVar(theme.fontHeading)};`,
    `--font-body:${fontCssVar(theme.fontBody)};`,
    `}`,
  ].join("");
}
