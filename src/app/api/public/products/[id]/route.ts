import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getFlags } from "@/lib/flags";
import { NotFoundError } from "@/lib/errors";
import { jsonOk, apiHandler } from "@/lib/http";
import { parseAttributesForRender } from "@/lib/domain/attributes";

/**
 * GET /api/public/products/:id
 * Detalle público de producto: variantes solo si el flag está activo
 * (leído en caliente, sin reinicio).
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const flags = await getFlags();
  const product = await db.product.findFirst({
    where: { id, isVisible: true, isArchived: false },
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
      category: { select: { name: true, slug: true } },
      variants: flags.variants_enabled
        ? { where: { isActive: true }, select: { id: true, name: true, priceDelta: true } }
        : false,
    },
  });
  if (!product) throw new NotFoundError("Producto");
  return jsonOk({
    ...product,
    attributes: parseAttributesForRender(product.attributes),
    variants: flags.variants_enabled ? product.variants ?? [] : [],
  });
});
