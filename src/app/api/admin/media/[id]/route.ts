import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { apiHandler, jsonOk } from "@/lib/http";
import { rm } from "node:fs/promises";
import path from "node:path";

/**
 * DELETE /api/admin/media/:id  (ADMIN)
 * Elimina el registro y el archivo físico. Si el archivo ya no existe en
 * disco, el registro se elimina igual (degradación segura con warn).
 */
export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const asset = await db.mediaAsset.findUnique({ where: { id } });
  if (!asset) throw new NotFoundError("Medio");
  if (asset.url.startsWith("/uploads/")) {
    const filePath = path.join(process.cwd(), "public", asset.url);
    await rm(filePath, { force: true });
  } else {
    console.warn(`[MEDIA] URL externa no eliminable del disco: ${asset.url}`);
  }
  await db.mediaAsset.delete({ where: { id } });
  return jsonOk({ ok: true });
});
