import { db } from "../db";
import { getSiteSettings, type SiteSettings } from "../settings";
import { getFlags, type FlagMap } from "../flags";
import { getTheme, type ThemeData } from "./theme";
import {
  DEFAULT_WHATSAPP_TEMPLATE,
  buildWhatsAppUrl,
  isValidWhatsAppPhone,
  renderTemplate,
} from "../whatsapp";

/**
 * Bootstrap público: todos los datos que la primera pintura de la web
 * necesita. Se usa tanto en el server component (page.tsx) como en la
 * API pública /api/public/bootstrap (para refrescar tras cambios del admin).
 */

export interface PublicBanner {
  id: string;
  title: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
}

export interface PublicTestimonial {
  id: string;
  customerName: string;
  text: string;
  rating: number;
}

export interface PublicFaq {
  id: string;
  question: string;
  answer: string;
}

export interface PublicLegalPageRef {
  slug: string;
  title: string;
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
}

export interface PublicBootstrap {
  settings: SiteSettings;
  flags: FlagMap;
  theme: ThemeData;
  whatsapp: { available: boolean; buttonLabel: string; waUrl: string | null };
  banners: PublicBanner[];
  testimonials: PublicTestimonial[];
  faqs: PublicFaq[];
  legalPages: PublicLegalPageRef[];
  categories: PublicCategory[];
}

export async function getPublicBootstrap(): Promise<PublicBootstrap> {
  const [{ values: settings }, flags, theme, wa, banners, testimonials, faqs, legalPages, categories] =
    await Promise.all([
      getSiteSettings(),
      getFlags(),
      getTheme(),
      db.whatsAppSetting.findUnique({ where: { id: "whatsapp" } }),
      db.banner.findMany({
        where: { isVisible: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 12,
      }),
      db.testimonial.findMany({
        where: { isVisible: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 12,
      }),
      db.faq.findMany({
        where: { isVisible: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 30,
      }),
      db.legalPage.findMany({
        select: { slug: true, title: true },
        orderBy: { slug: "asc" },
      }),
      db.category.findMany({
        where: { isActive: true },
        select: { id: true, name: true, slug: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        take: 30,
      }),
    ]);

  // WhatsApp: número público del negocio. URL de contacto derivada de la
  // primera frase de la plantilla editable (sin textos hardcodeados aquí).
  const phone = wa?.phoneNumber?.trim() || null;
  const phoneOk = phone !== null && isValidWhatsAppPhone(phone);
  const template = wa?.defaultMessage?.trim() || DEFAULT_WHATSAPP_TEMPLATE;
  const greeting = renderTemplate(template, { BRAND: settings.brandName }).split("\n\n")[0]?.trim() ?? "";
  const waUrl = phoneOk && greeting !== "" ? buildWhatsAppUrl(phone!, greeting) : null;

  return {
    settings,
    flags,
    theme,
    whatsapp: {
      available: phoneOk,
      buttonLabel: wa?.buttonLabel?.trim() || "Reservar por WhatsApp",
      waUrl,
    },
    banners: banners.map((b) => ({
      id: b.id,
      title: b.title,
      subtitle: b.subtitle,
      imageUrl: b.imageUrl,
      linkUrl: b.linkUrl,
    })),
    testimonials: flags.testimonials_enabled
      ? testimonials.map((t) => ({
          id: t.id,
          customerName: t.customerName,
          text: t.text,
          rating: t.rating,
        }))
      : [],
    faqs: faqs.map((f) => ({ id: f.id, question: f.question, answer: f.answer })),
    legalPages,
    categories,
  };
}

export const DEFAULT_BUTTON_LABEL = "Reservar por WhatsApp";
export { DEFAULT_WHATSAPP_TEMPLATE };
