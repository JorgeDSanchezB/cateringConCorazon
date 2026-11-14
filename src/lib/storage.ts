import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR, config } from "./config";

/**
 * Adaptador de almacenamiento de medios (ADR-012):
 * - "blob"  → Vercel Blob (opcional): las subidas van a Blob Storage y
 *   vuelven como URL pública absoluta (CDN). Se activa automáticamente si
 *   existe BLOB_READ_WRITE_TOKEN (o con MEDIA_STORAGE=blob).
 * - "db"    → la imagen vive DENTRO de la base de datos (base64 en
 *   MediaAsset.data) y se sirve por GET /api/media/<id>: cero servicios
 *   extra, ideal para serverless (Vercel) sin almacén de objetos. Es el
 *   modo por defecto en Vercel cuando no hay token de Blob.
 * - "local" → disco local en public/uploads (desarrollo/sandbox/self-hosted).
 *
 * Override manual: MEDIA_STORAGE=local|db|blob (ver src/lib/config.ts).
 *
 * El resto de la app (MediaAsset.url en BD, galería, ImageField) es agnóstico:
 * solo guarda la URL que devuelve el adaptador.
 */

export type StorageMode = "local" | "db" | "blob";

export function storageMode(): StorageMode {
  const override = config.MEDIA_STORAGE;
  if (override) return override;
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  // El filesystem de Vercel es de solo lectura: sin Blob, la BD es el almacén.
  if (process.env.VERCEL) return "db";
  return "local";
}

export interface PutImageOptions {
  buffer: Buffer;
  mimeType: string;
  /** Extensión sin punto, derivada del MIME whitelist (jpg, png…). */
  ext: string;
}

export interface StoredImage {
  /** URL pública relativa (/uploads/…, /api/media/…) o absoluta (https://…). */
  url: string;
  filename: string;
  /** Contenido base64 SOLO en modo "db" (la ruta de subida lo guarda en MediaAsset.data). */
  data?: string;
}

export async function putImage(opts: PutImageOptions): Promise<StoredImage> {
  const mode = storageMode();

  if (mode === "db") {
    // Un mismo UUID para nombre de archivo y URL de servicio (/api/media/<id>).
    const id = randomUUID();
    return {
      url: `/api/media/${id}`,
      filename: `${id}.${opts.ext}`,
      data: opts.buffer.toString("base64"),
    };
  }

  const filename = `${randomUUID()}.${opts.ext}`;

  if (mode === "blob") {
    // Import dinámico: en el resto de modos el SDK de Blob ni siquiera se carga.
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
  if (url.startsWith("/api/media/")) {
    // Modo "db": el contenido vive en la fila MediaAsset que se está
    // eliminando; no hay objeto físico adicional que borrar.
    return;
  }
  if (url.startsWith("/uploads/")) {
    // En serverless el FS puede ser de solo lectura: EROFS se degrada
    // igual que ENOENT (la fila de BD se elimina igualmente).
    await rm(path.join(process.cwd(), "public", url), { force: true }).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") {
        console.warn(`[STORAGE] No se pudo borrar el archivo local (${url}): ${err.message}`);
      }
    });
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
