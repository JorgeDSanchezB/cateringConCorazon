import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { jsonOk, apiHandler } from "@/lib/http";

/**
 * GET /api/public/legal/:slug
 * Página legal editable (plantilla con disclaimer obligatorio mostrado por la UI).
 * Solo se sirven páginas ACTIVAS: si el admin la desactivó, responde 404 con un
 * detalle distinto al de "no existe" (Regla 4: distinguir fallos, no adivinar).
 */
export const GET = apiHandler<{ params: Promise<{ slug: string }> }>(async (req, ctx) => {
  const { slug } = await ctx.params;
  const page = await db.legalPage.findUnique({
    where: { slug },
    select: { slug: true, title: true, content: true, updatedAt: true, isActive: true },
  });
  if (!page) throw new NotFoundError("Página legal");
  if (!page.isActive) {
    throw new AppError({
      status: 404,
      type: "not-found",
      title: "No disponible",
      detail: "Esta página legal está desactivada temporalmente por el administrador.",
    });
  }
  return jsonOk({ slug: page.slug, title: page.title, content: page.content, updatedAt: page.updatedAt });
});
