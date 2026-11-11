import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getFlags } from "@/lib/flags";
import { ascCursorClause, getPagination, jsonOk, apiHandler, listEnvelope } from "@/lib/http";
import { parseAttributesForRender } from "@/lib/domain/attributes";

/**
 * GET /api/public/catalog?limit&cursor&type&category&featured&q
 * Catálogo público paginado por cursor (sortOrder asc, id asc).
 * SELECT explícito de columnas (nunca SELECT * implícito).
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const { limit, cursor } = getPagination(req);
  const params = req.nextUrl.searchParams;
  const type = params.get("type");
  const categorySlug = params.get("category");
  const featured = params.get("featured");
  const q = params.get("q")?.trim() ?? "";

  const flags = await getFlags();

  const where: Prisma.ProductWhereInput = {
    isVisible: true,
    isArchived: false,
    ...(type === "PRODUCT" || type === "BEVERAGE" ? { type } : {}),
    ...(featured === "true" ? { isFeatured: true } : {}),
    ...(categorySlug ? { category: { slug: categorySlug } } : {}),
    ...(q ? { name: { contains: q } } : {}),
  };

  const rows = await db.product.findMany({
    where: {
      ...where,
      ...(cursor ? ascCursorClause(cursor) : {}),
    } as Prisma.ProductWhereInput,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    take: limit + 1,
    select: {
      id: true,
      name: true,
      type: true,
      basePrice: true,
      description: true,
      imageUrl: true,
      isFeatured: true,
      attributes: true,
      attributeSchemaVersion: true,
      sortOrder: true,
      category: { select: { name: true, slug: true } },
      ...(flags.variants_enabled
        ? { variants: { where: { isActive: true }, select: { id: true, name: true, priceDelta: true } } }
        : {}),
    },
  });

  const { items, nextCursor } = listEnvelope(rows, limit, (row) => ({
    v1: String(row.sortOrder),
    v2: row.id,
  }));

  return jsonOk({
    items: items.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      basePrice: row.basePrice,
      description: row.description,
      imageUrl: row.imageUrl,
      isFeatured: row.isFeatured,
      attributes: parseAttributesForRender(row.attributes),
      attributeSchemaVersion: row.attributeSchemaVersion,
      category: row.category,
      variants: flags.variants_enabled ? row.variants ?? [] : [],
    })),
    nextCursor,
  });
});
