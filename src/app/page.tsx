import type { Metadata } from "next";
import { getPublicBootstrap } from "@/lib/services/public-data";
import { themeToCss } from "@/lib/theme";
import { App } from "@/components/ccc/app";

/**
 * Server Component raíz (única ruta visible "/").
 * - Bootstrap SSR: la primera pintura llega con settings/tema/contenido
 *   reales de la BD (sin parpadeo ni doble fetch).
 * - SEO dinámico desde SiteSetting (seo_title / seo_description), nunca
 *   hardcodeado.
 * - El <style id="ccc-theme"> inyecta las variables CSS del tema; el cliente
 *   lo actualiza en caliente cuando el admin guarda cambios.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { settings, theme } = await getPublicBootstrap();
  return {
    title: settings.seoTitle,
    description: settings.seoDescription,
    applicationName: settings.brandName,
    icons: theme.faviconUrl
      ? { icon: theme.faviconUrl }
      : { icon: "/images/favicon-512.png" },
    openGraph: {
      title: settings.seoTitle,
      description: settings.seoDescription,
      siteName: settings.brandName,
      type: "website",
      images: ["/images/hero.png"],
    },
  };
}

export default async function Home() {
  const bootstrap = await getPublicBootstrap();
  return (
    <>
      <style
        id="ccc-theme"
        dangerouslySetInnerHTML={{ __html: themeToCss(bootstrap.theme) }}
      />
      <App initialBootstrap={bootstrap} />
    </>
  );
}
