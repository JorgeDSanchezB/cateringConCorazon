import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiHandler, ascCursorClause, getPagination, jsonOk, listEnvelope, parseBody } from "@/lib/http";

/**
 * GET  /api/admin/content/banners  (ADMIN)
 * POST /api/admin/content/banners  (ADMIN)
 */
const bannerCreateSchema = z.object({
  title: z.string().trim().max(120).nullable().optional(),
  subtitle: z.string().trim().max(200).nullable().optional(),
  imageUrl: z.string().max(300).nullable().optional(),
  linkUrl: z.string().max(300).nullable().optional(),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { limit, cursor } = getPagination(req);
  const rows = await db.banner.findMany({
    where: { ...(cursor ? ascCursorClause(cursor) : {}) } as Prisma.BannerWhereInput,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  const { items, nextCursor } = listEnvelope(rows, limit, (row) => ({
    v1: String(row.sortOrder),
    v2: row.id,
  }));
  return jsonOk({ items, nextCursor });
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const body = await parseBody(req, bannerCreateSchema);
  const banner = await db.banner.create({
    data: {
      title: body.title ?? null,
      subtitle: body.subtitle ?? null,
      imageUrl: body.imageUrl ?? null,
      linkUrl: body.linkUrl ?? null,
      isVisible: body.isVisible ?? true,
      sortOrder: body.sortOrder ?? 0,
    },
  });
  return jsonOk(banner, { status: 201 });
});
