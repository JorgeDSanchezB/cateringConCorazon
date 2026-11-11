import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";
import { getSettingDefsForAdmin, getSiteSettings, settingsUpdateSchema, updateSiteSettings } from "@/lib/settings";

/**
 * GET /api/admin/settings  (ADMIN)
 * PUT /api/admin/settings  (ADMIN) — actualización parcial validada.
 * Devuelve `problems` cuando algún valor en BD es inválido (config).
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const [defs, { values, problems }] = await Promise.all([getSettingDefsForAdmin(), getSiteSettings()]);
  return jsonOk({ defs, values, problems });
});

export const PUT = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const body = await parseBody(req, settingsUpdateSchema);
  await updateSiteSettings(body);
  const [defs, { values, problems }] = await Promise.all([getSettingDefsForAdmin(), getSiteSettings()]);
  return jsonOk({ defs, values, problems });
});
