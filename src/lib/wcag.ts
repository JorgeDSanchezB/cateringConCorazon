/**
 * Contraste WCAG AA para el editor de tema.
 * Se valida ANTES de guardar (cliente y servidor). Un par de colores que
 * no alcanza 4.5:1 bloquea el guardado con detalle del par que falla.
 */

export interface ThemeColorsLike {
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
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized) && !/^[0-9a-fA-F]{3}$/.test(normalized)) return null;
  const full = normalized.length === 3
    ? normalized.split("").map((c) => c + c).join("")
    : normalized;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Luminancia relativa WCAG 2.x. */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export const WCAG_AA_TEXT = 4.5;

export interface ContrastPair {
  label: string;
  foreground: string;
  background: string;
  ratio: number;
  pass: boolean;
}

/** Pares críticos texto/fondo que deben cumplir AA (4.5:1). */
export function checkThemeContrast(theme: ThemeColorsLike): ContrastPair[] {
  const pairs: { label: string; foreground: string; background: string }[] = [
    { label: "Texto general / Fondo", foreground: theme.foreground, background: theme.background },
    { label: "Texto general / Tarjeta", foreground: theme.cardForeground, background: theme.card },
    { label: "Texto de botón primario / Botón primario", foreground: theme.primaryForeground, background: theme.primary },
    { label: "Texto de acento / Fondo de acento", foreground: theme.accentForeground, background: theme.accent },
    { label: "Texto suave / Fondo", foreground: theme.mutedForeground, background: theme.background },
    { label: "Texto suave / Fondo suave", foreground: theme.mutedForeground, background: theme.muted },
  ];
  return pairs.map((p) => {
    const ratio = contrastRatio(p.foreground, p.background);
    return { ...p, ratio: Math.round(ratio * 100) / 100, pass: ratio >= WCAG_AA_TEXT };
  });
}

export function themeContrastProblems(theme: ThemeColorsLike): { pair: string; message: string }[] {
  return checkThemeContrast(theme)
    .filter((p) => !p.pass)
    .map((p) => ({
      pair: p.label,
      message: `El par «${p.label}» tiene contraste ${p.ratio}:1 (mínimo AA ${WCAG_AA_TEXT}:1).`,
    }));
}

export function isValidHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}
