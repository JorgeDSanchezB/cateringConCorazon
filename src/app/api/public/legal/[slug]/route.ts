import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { jsonOk, apiHandler } from "@/lib/http";

/**
 * GET /api/public/legal/:slug
 * Página legal editable (plantilla con disclaimer obligatorio mostrado por la UI).
 */
export const GET = apiHandler<{ params: Promise<{ slug: string }> }>(async (req, ctx) => {
  const { slug } = await ctx.params;
  const page = await db.legalPage.findUnique({
    where: { slug },
    select: { slug: true, title: true, content: true, updatedAt: true },
  });
  if (!page) throw new NotFoundError("Página legal");
  return jsonOk(page);
});
