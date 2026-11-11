import { db } from "./db";

/**
 * Feature flags en base de datos, editables desde el admin.
 * Nunca se cachean entre request salvo lectura directa: activar facturación
 * o IVA a mitad de operación surte efecto en el siguiente request, sin
 * reiniciar el servidor.
 */

export type FlagKey =
  | "tax_enabled"
  | "invoicing_enabled"
  | "variants_enabled"
  | "testimonials_enabled"
  | "combos_enabled"
  | "discounts_enabled";

export type FlagMap = Record<FlagKey, boolean>;

/** Única fuente de verdad de los defaults (también usada por el seed). */
export const FLAG_DEFAULTS: FlagMap = {
  tax_enabled: false,
  invoicing_enabled: false,
  variants_enabled: false,
  testimonials_enabled: false,
  combos_enabled: true,
  discounts_enabled: true,
};

export const FLAG_DESCRIPTIONS: Record<FlagKey, string> = {
  tax_enabled: "Aplicar el IVA (%) configurado en Ajustes sobre los pedidos.",
  invoicing_enabled: "Habilitar el módulo de facturación interna numerada.",
  variants_enabled: "Activar variantes de producto (tamaño/sabor) en catálogo y pedidos.",
  testimonials_enabled: "Mostrar el bloque de testimonios en la página pública.",
  combos_enabled: "Activar el módulo de combos (creación y venta).",
  discounts_enabled: "Activar la validación y aplicación de códigos de descuento.",
};

export async function getFlags(): Promise<FlagMap> {
  const rows = await db.featureFlag.findMany();
  const map = new Map(rows.map((r) => [r.key as FlagKey, r.value]));
  const result = { ...FLAG_DEFAULTS };
  for (const key of Object.keys(FLAG_DEFAULTS) as FlagKey[]) {
    const value = map.get(key);
    if (value === undefined) {
      // Clave faltante: se advierte (seed incompleto) y se usa el default.
      console.warn(`[CONFIG] FeatureFlag faltante: ${key} → se usa default (${FLAG_DEFAULTS[key]})`);
      continue;
    }
    result[key] = value;
  }
  return result;
}

export async function getFlag(key: FlagKey): Promise<boolean> {
  const row = await db.featureFlag.findUnique({ where: { key } });
  if (row) return row.value;
  console.warn(`[CONFIG] FeatureFlag faltante: ${key} → se usa default (${FLAG_DEFAULTS[key]})`);
  return FLAG_DEFAULTS[key];
}
