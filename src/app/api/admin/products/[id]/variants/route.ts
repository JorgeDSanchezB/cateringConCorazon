import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";

/**
 * POST /api/admin/products/:id/variants  (ADMIN)
 * Crea una variante (tamaño/sabor). El módulo completo se activa con el flag
 * variants_enabled, pero las variantes pueden gestionarse en cualquier
 * momento (aparecen/desaparecen del catálogo en caliente).
 */
const variantCreateSchema = z.object({
  name: z.string().trim().min(1, "Nombre de variante obligatorio").max(60),
  priceDelta: z.number().int().min(-100_000).max(100_000),
  sku: z.string().trim().max(40).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const body = await parseBody(req, variantCreateSchema);
  const product = await db.product.findUnique({ where: { id } });
  if (!product) throw new NotFoundError("Producto");
  const variant = await db.productVariant.create({
    data: {
      productId: id,
      name: body.name,
      priceDelta: body.priceDelta,
      sku: body.sku ?? null,
      sortOrder: body.sortOrder ?? 0,
      isActive: body.isActive ?? true,
    },
  });
  return jsonOk(variant, { status: 201 });
});
