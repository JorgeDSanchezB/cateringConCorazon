import { NextRequest } from "next/server";
import { RateLimitError } from "./errors";

/**
 * Rate limiting en memoria (por proceso). Suficiente para un despliegue
 * único en Vercel/Node; documentado en ADR-001 que un Redis compartido sería la
 * alternativa si se escala horizontalmente (descartada por anti-sobreingeniería).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

function prune(now: number) {
  if (buckets.size > 50_000) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }
}

/**
 * `rateLimit("login", ip, 10)` → permite 10 intentos por minuto; lanza 429.
 * @param max     Intentos máximos por ventana.
 * @param windowMs Tamaño de la ventana (ms). Por defecto 60s.
 */
export function rateLimit(
  scope: string,
  identifier: string,
  max: number,
  windowMs = 60_000,
): void {
  const now = Date.now();
  prune(now);
  const key = `${scope}:${identifier}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > max) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new RateLimitError(retryAfter, scope);
  }
}

/** IP del cliente detrás del gateway; identidad local si no hay cabeceras. */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "local";
}
