import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";
import { FONT_REGISTRY } from "@/lib/fonts";
import { RADIUS_LEVELS, SHADOW_LEVELS, themeUpdateSchema } from "@/lib/theme";
import { checkThemeContrast } from "@/lib/wcag";
import { getTheme, updateTheme } from "@/lib/services/theme";

/**
 * GET /api/admin/theme  (ADMIN)
 * PUT /api/admin/theme  (ADMIN)
 * PUT valida contraste WCAG AA en servidor ANTES de guardar (además del
 * chequeo en vivo del editor). El cambio se refleja en la web pública sin
 * reiniciar: el cliente reinyecta las variables CSS al vuelo.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const theme = await getTheme();
  return jsonOk({
    theme,
    contrast: checkThemeContrast(theme),
    fonts: Object.entries(FONT_REGISTRY).map(([key, f]) => ({ key, label: f.label })),
    radiusLevels: Object.keys(RADIUS_LEVELS),
    shadowLevels: Object.keys(SHADOW_LEVELS),
  });
});

export const PUT = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const body = await parseBody(req, themeUpdateSchema);
  const theme = await updateTheme(body);
  return jsonOk({ theme, contrast: checkThemeContrast(theme) });
});
