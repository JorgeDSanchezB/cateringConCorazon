import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR } from "./config";

/**
 * Adaptador de almacenamiento de medios (ADR-012):
 * - "blob"  → Vercel Blob (producción): el filesystem de Vercel es de solo
 *   lectura, así que las subidas van a Blob Storage y vuelven como URL
 *   pública absoluta. Se activa automáticamente si existe BLOB_READ_WRITE_TOKEN.
 * - "local" → disco local en public/uploads (desarrollo/sandbox/self-hosted).
 *
 * El resto de la app (MediaAsset.url en BD, galería, ImageField) es agnóstico:
 * solo guarda la URL que devuelve el adaptador.
 */

export type StorageMode = "local" | "blob";

export function storageMode(): StorageMode {
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
}

export interface PutImageOptions {
  buffer: Buffer;
  mimeType: string;
  /** Extensión sin punto, derivada del MIME whitelist (jpg, png…). */
  ext: string;
}

export interface StoredImage {
  /** URL pública relativa (/uploads/…) o absoluta (https://…public.blob.vercel-storage.com/…). */
  url: string;
  filename: string;
}

export async function putImage(opts: PutImageOptions): Promise<StoredImage> {
  const filename = `${randomUUID()}.${opts.ext}`;

  if (storageMode() === "blob") {
    // Import dinámico: en modo local el SDK de Blob ni siquiera se carga.
    const { put } = await import("@vercel/blob");
    const blob = await put(filename, opts.buffer, {
      access: "public",
      contentType: opts.mimeType,
    });
    return { url: blob.url, filename };
  }

  const dir = path.join(process.cwd(), UPLOAD_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), opts.buffer);
  return { url: `/uploads/${filename}`, filename };
}

/**
 * Elimina el objeto físico asociado a una URL de medio.
 * - Local: borra el archivo de public/uploads (si ya no existe, degradación
 *   segura sin error — la fila de BD se elimina igual).
 * - Blob: borra el objeto del store; si la URL no pertenece al store o ya fue
 *   eliminado, se registra un warn y se continúa (degradación segura).
 */
export async function deleteImageByUrl(url: string): Promise<void> {
  if (url.startsWith("/uploads/")) {
    await rm(path.join(process.cwd(), "public", url), { force: true });
    return;
  }
  if (storageMode() === "blob" && /^https?:\/\//.test(url)) {
    try {
      const { del } = await import("@vercel/blob");
      await del(url);
    } catch (err) {
      console.warn(`[STORAGE] No se pudo eliminar el objeto Blob (${url}): ${(err as Error).message}`);
    }
  }
  // URL externa en modo local (https://… de terceros): no es eliminable; la
  // fila de la galería se quita igualmente (comportamiento previo documentado).
}
