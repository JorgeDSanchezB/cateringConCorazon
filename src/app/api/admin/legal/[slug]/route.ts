import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";
import { getSiteSettings } from "@/lib/settings";

/**
 * GET /api/admin/legal/:slug  (ADMIN)
 * PUT /api/admin/legal/:slug  (ADMIN)
 * El disclaimer legal global (setting) se devuelve junto a la página para
 * mostrar el aviso de revisión legal también dentro del editor.
 */
const legalPutSchema = z.object({
  title: z.string().trim().min(4).max(120),
  content: z.string().trim().min(50, "El contenido legal es demasiado corto").max(40_000),
});

export const GET = apiHandler<{ params: Promise<{ slug: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { slug } = await ctx.params;
  const [page, { values: settings }] = await Promise.all([
    db.legalPage.findUnique({ where: { slug } }),
    getSiteSettings(),
  ]);
  if (!page) throw new NotFoundError("Página legal");
  return jsonOk({ page, disclaimer: settings.legalDisclaimer });
});

export const PUT = apiHandler<{ params: Promise<{ slug: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { slug } = await ctx.params;
  const body = await parseBody(req, legalPutSchema);
  const page = await db.legalPage.upsert({
    where: { slug },
    update: { title: body.title, content: body.content },
    create: { slug, title: body.title, content: body.content },
  });
  return jsonOk(page);
});
