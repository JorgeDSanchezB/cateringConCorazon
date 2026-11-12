import { z } from "zod";
import { db } from "./db";

/**
 * Ajustes de NEGOCIO en tabla clave-valor (SiteSetting). Nada de esto se
 * hardcodea en la UI: hero, SEO, moneda, locale, timezone, IVA %, mínimo por
 * evento, prefijos de pedido/factura, disclaimer legal, pie.
 *
 * Tolerancia a fallos: un valor almacenado inválido se registra como problema
 * de configuración (log crítico), se usa el valor por defecto para no tumbar
 * la web pública, y `problems` se expone al admin para su corrección.
 */

export interface SiteSettings {
  brandName: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaPrimary: string;
  heroCtaSecondary: string;
  aboutTitle: string;
  aboutText: string;
  seoTitle: string;
  seoDescription: string;
  currency: string;
  currencySymbol: string;
  locale: string;
  timezone: string;
  /** Porcentaje de IVA (0-100). Se APLICA solo si el flag tax_enabled está activo. */
  taxPercent: number;
  /** Mínimo por evento global en centavos (puede haber override por evento). */
  globalMinOrderCents: number;
  orderPrefix: string;
  invoicePrefix: string;
  invoicePadding: number;
  legalDisclaimer: string;
  footerText: string;
}

export type SettingProblem = { key: string; message: string };

const DEFAULT_DISCLAIMER =
  "Esta plantilla es un borrador generado automáticamente y no constituye asesoría legal. " +
  "Revísala con un abogado colegiado en Ecuador antes de publicarla.";

/** Definiciones: esquema Zod + valor por defecto + metadatos para el admin. */
export const SETTING_DEFS = {
  brand_name: { schema: z.string().min(1).max(80), default: "Catering con Corazón", label: "Nombre de la marca", group: "marca" },
  hero_title: { schema: z.string().min(1).max(120), default: "Catering con corazón para eventos inolvidables", label: "Título principal (hero)", group: "hero" },
  hero_subtitle: { schema: z.string().min(1).max(400), default: "Menús artesanales para fiestas y celebraciones: sándwiches, cubanos, dorilocos y bebidas naturales.", label: "Subtítulo del hero", group: "hero" },
  hero_cta_primary: { schema: z.string().min(1).max(40), default: "Ver el menú", label: "Texto botón principal", group: "hero" },
  hero_cta_secondary: { schema: z.string().min(1).max(40), default: "Reservar por WhatsApp", label: "Texto botón secundario", group: "hero" },
  about_title: { schema: z.string().min(1).max(80), default: "Sobre nosotros", label: "Título «Sobre nosotros»", group: "marca" },
  about_text: {
    schema: z.string().min(1).max(2000),
    default:
      "Somos un catering ecuatoriano que prepara cada menú como si fuera para nuestra propia familia: " +
      "ingredientes frescos, recetas artesanales y un servicio cálido que convierte cada celebración en un recuerdo.\n\n" +
      "Nos montamos en tu evento — fiestas, quinceañeras, celebraciones empresariales o reuniones donde la gente " +
      "quiere bailar, comer y disfrutar. Sin entregas a domicilio: el sabor llega al evento.",
    label: "Texto «Sobre nosotros»",
    group: "marca",
  },
  seo_title: { schema: z.string().min(1).max(120), default: "Catering con Corazón — Catering para eventos privados en Ecuador", label: "Título SEO", group: "seo" },
  seo_description: { schema: z.string().min(1).max(300), default: "Catering para fiestas y eventos privados en Ecuador: sándwiches de pollo, cubanos de alta calidad, dorilocos y bebidas naturales. Reserva por WhatsApp.", label: "Descripción SEO", group: "seo" },
  currency: { schema: z.string().regex(/^[A-Z]{3}$/, "Código ISO 4217 de 3 letras"), default: "USD", label: "Moneda (ISO 4217)", group: "negocio" },
  currency_symbol: { schema: z.string().min(1).max(3), default: "$", label: "Símbolo de moneda", group: "negocio" },
  locale: { schema: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/, "Formato es-EC"), default: "es-EC", label: "Locale", group: "negocio" },
  timezone: { schema: z.string().regex(/^[A-Za-z]+(\/[A-Za-z0-9_+-]+)?$/, "Zona IANA"), default: "America/Guayaquil", label: "Zona horaria (IANA)", group: "negocio" },
  tax_percent: { schema: z.coerce.number().int().min(0).max(100), default: 15, label: "IVA (%)", group: "negocio" },
  global_min_order_cents: { schema: z.coerce.number().int().min(0), default: 5000, label: "Mínimo por evento global (centavos)", group: "negocio" },
  order_prefix: { schema: z.string().regex(/^[A-Z0-9-]{0,8}$/), default: "CCC-", label: "Prefijo de pedido", group: "sistema" },
  invoice_prefix: { schema: z.string().regex(/^[0-9A-Z-]{0,12}$/), default: "001-001-", label: "Prefijo de factura", group: "sistema" },
  invoice_padding: { schema: z.coerce.number().int().min(4).max(12), default: 9, label: "Dígitos de numeración de factura", group: "sistema" },
  legal_disclaimer: { schema: z.string().min(1).max(600), default: DEFAULT_DISCLAIMER, label: "Disclaimer legal", group: "legal" },
  footer_text: { schema: z.string().min(1).max(300), default: "Hecho con corazón en Ecuador.", label: "Texto del pie de página", group: "marca" },
} as const;

export type SettingKey = keyof typeof SETTING_DEFS;

const SETTING_KEYS = Object.keys(SETTING_DEFS) as SettingKey[];

/** Esquema de actualización parcial desde el admin. */
export const settingsUpdateSchema = z.object(
  Object.fromEntries(
    SETTING_KEYS.map((k) => [k, SETTING_DEFS[k].schema.optional()]),
  ),
);

export type SettingsUpdate = z.output<typeof settingsUpdateSchema>;

export interface SiteSettingsResult {
  values: SiteSettings;
  problems: SettingProblem[];
}

/** Lee y valida todos los ajustes. Los inválidos caen a default con problema registrado. */
export async function getSiteSettings(): Promise<SiteSettingsResult> {
  const rows = await db.siteSetting.findMany();
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const problems: SettingProblem[] = [];

  const raw: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const def = SETTING_DEFS[key];
    const value = stored.get(key);
    if (value === undefined) {
      raw[key] = def.default;
      continue;
    }
    const parsed = def.schema.safeParse(value);
    if (parsed.success) {
      raw[key] = parsed.data;
    } else {
      // Error de configuración: log crítico + default + problema visible al admin.
      console.error(`[CONFIG] Ajuste inválido en base de datos: ${key}=${JSON.stringify(value)} → se usa default`);
      problems.push({ key, message: `Valor inválido para «${def.label}»; se está usando el valor por defecto.` });
      raw[key] = def.default;
    }
  }

  return {
    values: {
      brandName: raw.brand_name as string,
      heroTitle: raw.hero_title as string,
      heroSubtitle: raw.hero_subtitle as string,
      heroCtaPrimary: raw.hero_cta_primary as string,
      heroCtaSecondary: raw.hero_cta_secondary as string,
      aboutTitle: raw.about_title as string,
      aboutText: raw.about_text as string,
      seoTitle: raw.seo_title as string,
      seoDescription: raw.seo_description as string,
      currency: raw.currency as string,
      currencySymbol: raw.currency_symbol as string,
      locale: raw.locale as string,
      timezone: raw.timezone as string,
      taxPercent: raw.tax_percent as number,
      globalMinOrderCents: raw.global_min_order_cents as number,
      orderPrefix: raw.order_prefix as string,
      invoicePrefix: raw.invoice_prefix as string,
      invoicePadding: raw.invoice_padding as number,
      legalDisclaimer: raw.legal_disclaimer as string,
      footerText: raw.footer_text as string,
    },
    problems,
  };
}

/** Escritura parcial (upsert por clave). Valida antes de escribir. */
export async function updateSiteSettings(update: SettingsUpdate): Promise<void> {
  const txOps = SETTING_KEYS
    .filter((k) => (update as Record<string, unknown>)[k] !== undefined)
    .map((k) =>
      db.siteSetting.upsert({
        where: { key: k },
        update: { value: String((update as Record<string, unknown>)[k]) },
        create: { key: k, value: String((update as Record<string, unknown>)[k]) },
      }),
    );
  await db.$transaction(txOps);
}

/** Metadatos de ajustes para la UI de admin (labels/grupos/valores actuales). */
export async function getSettingDefsForAdmin(): Promise<
  { key: SettingKey; label: string; group: string; value: string; default: string; type: "text" | "multiline" | "number" | "money" }[]
> {
  const rows = await db.siteSetting.findMany();
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const { values } = await getSiteSettings();
  const typed = values as unknown as Record<string, unknown>;
  return SETTING_KEYS.map((k) => {
    const def = SETTING_DEFS[k];
    const current = stored.get(k) ?? String(def.default);
    const isMultiline = k === "about_text" || k === "seo_description" || k === "legal_disclaimer" || k === "hero_subtitle";
    const isNumber = k === "tax_percent" || k === "invoice_padding";
    const isMoney = k === "global_min_order_cents";
    return {
      key: k,
      label: def.label,
      group: def.group,
      value: isMoney ? String(typed[k]) : current,
      default: String(def.default),
      type: isMultiline ? "multiline" : isNumber ? "number" : isMoney ? "money" : "text",
    } as { key: SettingKey; label: string; group: string; value: string; default: string; type: "text" | "multiline" | "number" | "money" };
  });
}
