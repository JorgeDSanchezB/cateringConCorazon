import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiHandler, jsonOk } from "@/lib/http";

/**
 * GET /api/admin/legal  (ADMIN)
 * Lista de páginas legales (título + slug + estado + updatedAt).
 * Devuelve TODAS (activas y desactivadas): el admin decide qué publicar.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const rows = await db.legalPage.findMany({
    orderBy: { slug: "asc" },
    select: { slug: true, title: true, isActive: true, updatedAt: true },
  });
  return jsonOk({ items: rows });
});
