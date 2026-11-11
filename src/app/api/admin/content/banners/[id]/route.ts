import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";

/**
 * PATCH  /api/admin/content/banners/:id  (ADMIN)
 * DELETE /api/admin/content/banners/:id  (ADMIN)
 */
const bannerPatchSchema = z.object({
  title: z.string().trim().max(120).nullable().optional(),
  subtitle: z.string().trim().max(200).nullable().optional(),
  imageUrl: z.string().max(300).nullable().optional(),
  linkUrl: z.string().max(300).nullable().optional(),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const body = await parseBody(req, bannerPatchSchema);
  const existing = await db.banner.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Banner");
  const updated = await db.banner.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.subtitle !== undefined ? { subtitle: body.subtitle } : {}),
      ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
      ...(body.linkUrl !== undefined ? { linkUrl: body.linkUrl } : {}),
      ...(body.isVisible !== undefined ? { isVisible: body.isVisible } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    },
  });
  return jsonOk(updated);
});

export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const existing = await db.banner.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Banner");
  await db.banner.delete({ where: { id } });
  return jsonOk({ ok: true });
});
