/**
 * Registro técnico de tipografías (whitelist).
 *
 * El admin elige por CLAVE entre fuentes cargadas con next/font en el layout.
 * No se permiten URLs arbitrarias de fuentes (seguridad + determinismo).
 * Añadir una fuente nueva = añadirla al layout + a este registro: es una
 * decisión técnica de presentación, no un dato de negocio.
 */
export const FONT_REGISTRY = {
  playfair: { label: "Playfair Display (elegante serif)", cssVar: "--font-playfair" },
  lora: { label: "Lora (serif cálida)", cssVar: "--font-lora" },
  montserrat: { label: "Montserrat (moderna sans)", cssVar: "--font-montserrat" },
  inter: { label: "Inter (neutral sans)", cssVar: "--font-inter" },
  poppins: { label: "Poppins (redondeada)", cssVar: "--font-poppins" },
} as const;

export type FontKey = keyof typeof FONT_REGISTRY;
export const FONT_KEYS = Object.keys(FONT_REGISTRY) as FontKey[];

export function fontCssVar(key: string | null | undefined): string {
  if (key && key in FONT_REGISTRY) {
    return `var(${FONT_REGISTRY[key as FontKey].cssVar})`;
  }
  // Clave desconocida/null → fallback determinista (no error: degradación segura).
  return "var(--font-geist-sans)";
}
