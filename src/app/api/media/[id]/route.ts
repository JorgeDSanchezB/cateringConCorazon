import { NextRequest } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/media/:id  (público)
 *
 * Sirve una imagen almacenada DENTRO de la base de datos (modo de
 * almacenamiento "db" del adaptador de medios, ver src/lib/storage.ts y
 * ADR-012): la subida guarda el contenido base64 en MediaAsset.data y esta
 * ruta lo devuelve como binario con caché inmutable.
 *
 * - Sin autenticación: las imágenes son contenido público de la web (igual
 *   que /uploads/*.jpg). El id es un UUID no adivinable generado en la subida.
 * - Cache-Control inmutable: el contenido de un id nunca cambia (borrar y
 *   volver a subir genera otro id), así que navegador y CDN pueden cachear
 *   un año.
 * - Los medios con archivo externo (/uploads o https://) no pasan por aquí:
 *   su URL se sirve tal cual.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const asset = await db.mediaAsset.findFirst({
    where: { url: `/api/media/${id}` },
    select: { data: true, mimeType: true },
  });

  if (!asset?.data) {
    return new Response(
      JSON.stringify({ type: "not-found", title: "Medio no encontrado", status: 404 }),
      { status: 404, headers: { "Content-Type": "application/problem+json" } },
    );
  }

  const bytes = Uint8Array.from(Buffer.from(asset.data, "base64"));
  return new Response(bytes, {
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${id}"`,
    },
  });
}
