import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { apiHandler, ascCursorClause, getPagination, jsonOk, listEnvelope, parseBody } from "@/lib/http";
import { pipelineAttributes } from "@/lib/domain/attributes";

/**
 * GET  /api/admin/products?limit&cursor&type&category&visibility&q  (ADMIN)
 * POST /api/admin/products                                                    (ADMIN)
 *
 * Pipeline de creación (Fase 4):
 * Controller → Zod (shape base) → esquema activo de atributos (JSON Schema
 * ajv, mundo cerrado) → límites (tamaño/profundidad/claves peligrosas) →
 * persistencia JSON + attributeSchemaVersion.
 */
const productCreateSchema = z.object({
  name: z.string().trim().min(2, "Nombre demasiado corto").max(80),
  type: z.enum(["PRODUCT", "BEVERAGE"]),
  categoryId: z.string().min(1).max(64).nullable().optional(),
  basePrice: z.number().int().min(0, "Precio inválido").max(10_000_000),
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

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN", "STAFF", "CONTADOR"] });
  const { limit, cursor } = getPagination(req);
  const params = req.nextUrl.searchParams;
  const type = params.get("type");
  const categoryId = params.get("category");
  const visibility = params.get("visibility");
  const q = params.get("q")?.trim() ?? "";

  const where: Prisma.ProductWhereInput = {
    ...(type === "PRODUCT" || type === "BEVERAGE" ? { type } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(visibility === "visible" ? { isVisible: true, isArchived: false } : {}),
    ...(visibility === "hidden" ? { isVisible: false, isArchived: false } : {}),
    ...(visibility === "archived" ? { isArchived: true } : {}),
    ...(q ? { name: { contains: q } } : {}),
  };

  const rows = await db.product.findMany({
    where: { ...where, ...(cursor ? ascCursorClause(cursor) : {}) } as Prisma.ProductWhereInput,
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
      isVisible: true,
      isArchived: true,
      sortOrder: true,
      attributes: true,
      attributeSchemaVersion: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { id: true, name: true } },
      variants: { select: { id: true } },
      stock: { select: { quantity: true, lowStockThreshold: true } },
    },
  });

  const { items, nextCursor } = listEnvelope(rows, limit, (row) => ({
    v1: String(row.sortOrder),
    v2: row.id,
  }));

  return jsonOk({
    items: items.map((row) => ({
      ...row,
      attributes: row.attributes, // JSON crudo para el editor del admin
      variantCount: row.variants.length,
    })),
    nextCursor,
  });
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const body = await parseBody(req, productCreateSchema);

  if (body.categoryId) {
    const category = await db.category.findUnique({ where: { id: body.categoryId } });
    if (!category) {
      throw new ValidationError([{ field: "categoryId", message: "La categoría no existe." }]);
    }
  }

  const activeSchema = await db.productAttributeSchema.findFirst({ where: { isActive: true } });
  const attributesJson = pipelineAttributes(
    body.attributes ?? null,
    activeSchema ? { version: activeSchema.version, schemaJson: activeSchema.schemaJson } : null,
  );

  const product = await db.product.create({
    data: {
      name: body.name,
      type: body.type,
      categoryId: body.categoryId ?? null,
      basePrice: body.basePrice,
      description: body.description ?? null,
      imageUrl: body.imageUrl ?? null,
      isFeatured: body.isFeatured ?? false,
      isVisible: body.isVisible ?? true,
      sortOrder: body.sortOrder ?? 0,
      attributes: attributesJson,
      attributeSchemaVersion: attributesJson && activeSchema ? activeSchema.version : null,
    },
    include: { category: { select: { id: true, name: true } }, variants: { where: { isActive: true } } },
  });
  return jsonOk(product, { status: 201 });
});
