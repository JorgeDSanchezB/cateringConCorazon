import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { apiHandler, jsonOk } from "@/lib/http";
import { deleteImageByUrl } from "@/lib/storage";

/**
 * DELETE /api/admin/media/:id  (ADMIN)
 * Elimina el registro y el objeto físico (archivo local u objeto de Vercel
 * Blob según el adaptador). Si el objeto ya no existe, el registro se
 * elimina igual (degradación segura con warn).
 */
export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const asset = await db.mediaAsset.findUnique({ where: { id } });
  if (!asset) throw new NotFoundError("Medio");
  await deleteImageByUrl(asset.url);
  await db.mediaAsset.delete({ where: { id } });
  return jsonOk({ ok: true });
});
