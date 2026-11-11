import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";
import { pipelineAttributes } from "@/lib/domain/attributes";

/**
 * GET    /api/admin/products/:id  (ADMIN/STAFF/CONTADOR)
 * PATCH  /api/admin/products/:id  (ADMIN)
 * DELETE /api/admin/products/:id  (ADMIN) — borrado LÓGICO (isArchived).
 *
 * PATCH distingue explícitamente:
 * - campo ausente → no se toca;
 * - campo null (description/imageUrl/categoryId/attributes) → se limpia;
 * - dato inválido → 422 por campo, sin persistencia parcial.
 */
const productPatchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  type: z.enum(["PRODUCT", "BEVERAGE"]).optional(),
  categoryId: z.string().min(1).max(64).nullable().optional(),
  basePrice: z.number().int().min(0).max(10_000_000).optional(),
  description: z.string().max(1000).nullable().optional(),
  imageUrl: z
    .string()
    .max(300)
    .regex(/^(\/[\w\-./%?=&]+|https?:\/\/.+)$/, "Debe ser ruta interna (/...) o URL http(s)")
    .nullable()
    .optional(),
  isFeatured: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  attributes: z.unknown().optional(),
});

export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN", "STAFF", "CONTADOR"] });
  const { id } = await ctx.params;
  const product = await db.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      variants: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      stock: { select: { quantity: true, lowStockThreshold: true } },
    },
  });
  if (!product) throw new NotFoundError("Producto");
  return jsonOk(product);
});

export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const body = await parseBody(req, productPatchSchema);

  const product = await db.product.findUnique({ where: { id } });
  if (!product) throw new NotFoundError("Producto");

  if (body.categoryId) {
    const category = await db.category.findUnique({ where: { id: body.categoryId } });
    if (!category) {
      throw new ValidationError([{ field: "categoryId", message: "La categoría no existe." }]);
    }
  }

  // Atributos: presente/null/objeto se manejan de forma distinta (ver docstring).
  let attributesData: { attributes: string | null; attributeSchemaVersion: number | null } | undefined;
  if ("attributes" in body) {
    if (body.attributes === null) {
      attributesData = { attributes: null, attributeSchemaVersion: null };
    } else {
      // Validar contra la versión ALMACENADA del producto (compatibilidad).
      const storedVersion = product.attributeSchemaVersion;
      const schemaRecord = storedVersion
        ? await db.productAttributeSchema.findUnique({ where: { version: storedVersion } })
        : await db.productAttributeSchema.findFirst({ where: { isActive: true } });
      const json = pipelineAttributes(body.attributes, schemaRecord);
      attributesData = {
        attributes: json,
        attributeSchemaVersion: json && schemaRecord ? schemaRecord.version : null,
      };
    }
  }

  const updated = await db.product.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      ...(body.basePrice !== undefined ? { basePrice: body.basePrice } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
      ...(body.isFeatured !== undefined ? { isFeatured: body.isFeatured } : {}),
      ...(body.isVisible !== undefined ? { isVisible: body.isVisible } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      ...(attributesData ?? {}),
    },
    include: {
      category: { select: { id: true, name: true } },
      variants: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  return jsonOk(updated);
});

export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const product = await db.product.findUnique({ where: { id } });
  if (!product) throw new NotFoundError("Producto");
  // Borrado lógico: los pedidos históricos conservan sus snapshots.
  await db.product.update({
    where: { id },
    data: { isArchived: true, isVisible: false, isFeatured: false },
  });
  return jsonOk({ ok: true, archived: true });
});
