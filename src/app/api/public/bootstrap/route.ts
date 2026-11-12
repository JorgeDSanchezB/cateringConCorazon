import { getPublicBootstrap } from "@/lib/services/public-data";
import { jsonOk, apiHandler } from "@/lib/http";

/**
 * GET /api/public/bootstrap
 * Datos de primera pintura: settings, flags, tema, WhatsApp (solo disponibilidad
 * y etiqueta), banners, testimonios (si flag), FAQ y refs de páginas legales.
 */
export const GET = apiHandler(async () => {
  const bootstrap = await getPublicBootstrap();
  return jsonOk(bootstrap, {
    headers: { "Cache-Control": "no-store" },
  });
});
