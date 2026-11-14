import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { config, ALLOWED_UPLOAD_MIME } from "@/lib/config";
import { requireUser } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { apiHandler, descCursorClause, getPagination, jsonOk, listEnvelope } from "@/lib/http";
import { putImage } from "@/lib/storage";

/**
 * GET  /api/admin/media  (ADMIN) — galería paginada por cursor.
 * POST /api/admin/media  (ADMIN) — upload multipart (form-data: file, alt?).
 *
 * Almacenamiento vía adaptador (src/lib/storage.ts, ADR-012): Vercel Blob
 * si hay token, dentro de la BD (MediaAsset.data + GET /api/media/<id>) en
 * serverless sin Blob, o disco local public/uploads en desarrollo. La URL
 * pública resultante es agnóstica para el resto del sistema.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { limit, cursor } = getPagination(req);
  const rows = await db.mediaAsset.findMany({
    where: { ...(cursor ? descCursorClause("createdAt", cursor) : {}) } as Prisma.MediaAssetWhereInput,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: { id: true, url: true, filename: true, mimeType: true, sizeBytes: true, alt: true, createdAt: true },
  });
  const { items, nextCursor } = listEnvelope(rows, limit, (row) => ({
    v1: row.createdAt.toISOString(),
    v2: row.id,
  }));
  return jsonOk({ items, nextCursor });
});

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export const POST = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const form = await req.formData().catch(() => null);
  if (!form) {
    throw new ValidationError([], "Se esperaba multipart/form-data con un campo 'file'.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new ValidationError([{ field: "file", message: "Archivo ausente." }]);
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_UPLOAD_MIME.includes(mime as (typeof ALLOWED_UPLOAD_MIME)[number])) {
    throw new ValidationError([
      { field: "file", message: `Tipo no permitido (${mime}). Use PNG, JPEG, WebP o SVG.` },
    ]);
  }
  if (file.size > config.UPLOAD_MAX_BYTES) {
    throw new ValidationError([
      {
        field: "file",
        message: `El archivo supera ${Math.floor(config.UPLOAD_MAX_BYTES / (1024 * 1024))} MB.`,
      },
    ]);
  }
  const alt = (form.get("alt") as string | null)?.trim().slice(0, 120) || null;

  const stored = await putImage({ buffer: Buffer.from(await file.arrayBuffer()), mimeType: mime, ext: EXT_BY_MIME[mime] ?? "bin" });

  const asset = await db.mediaAsset.create({
    data: {
      url: stored.url,
      filename: stored.filename,
      mimeType: mime,
      sizeBytes: file.size,
      alt,
      // Modo "db": contenido base64; en local/blob es undefined (null).
      data: stored.data ?? null,
    },
    // La respuesta NO incluye el contenido base64 (misma whitelist que la
    // galería GET): evita devolver cientos de KB innecesarios.
    select: { id: true, url: true, filename: true, mimeType: true, sizeBytes: true, alt: true, createdAt: true },
  });
  return jsonOk(asset, { status: 201 });
});
