import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiHandler, ascCursorClause, getPagination, jsonOk, listEnvelope, parseBody } from "@/lib/http";

/**
 * GET  /api/admin/categories  (ADMIN/STAFF)
 * POST /api/admin/categories  (ADMIN)
 */
const categoryCreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, "Slug: minúsculas, números y guiones").optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN", "STAFF", "CONTADOR"] });
  const { limit, cursor } = getPagination(req);
  const rows = await db.category.findMany({
    where: { ...(cursor ? ascCursorClause(cursor) : {}) } as Prisma.CategoryWhereInput,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    take: limit + 1,
    select: {
      id: true, name: true, slug: true, sortOrder: true, isActive: true, createdAt: true,
      _count: { select: { products: { where: { isArchived: false } } } },
    },
  });
  const { items, nextCursor } = listEnvelope(rows, limit, (row) => ({
    v1: String(row.sortOrder),
    v2: row.id,
  }));
  return jsonOk({
    items: items.map((row) => ({ ...row, productCount: row._count.products, _count: undefined })),
    nextCursor,
  });
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const body = await parseBody(req, categoryCreateSchema);
  const slug = body.slug ?? slugify(body.name);
  const category = await db.category.create({
    data: {
      name: body.name,
      slug,
      sortOrder: body.sortOrder ?? 0,
      isActive: body.isActive ?? true,
    },
  });
  return jsonOk(category, { status: 201 });
});
