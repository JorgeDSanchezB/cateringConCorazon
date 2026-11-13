import { z } from "zod";

/**
 * Configuración TÉCNICA del servidor (no datos de negocio).
 *
 * Regla del proyecto: cualquier dato de negocio (IVA %, mínimo por evento,
 * moneda, WhatsApp, textos, colores, precios) vive en la base de datos
 * (SiteSetting / ThemeSetting / WhatsAppSetting) y NUNCA aquí.
 *
 * Solo constantes técnicas justificadas: límites de seguridad, tamaños y
 * tiempos de expiración. Todas son overrideables por variables de entorno
 * y validadas con Zod en el arranque (error de configuración explícito).
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16).optional(),
  /** Límite máximo aceptado en ?limit= de cualquier listado. */
  MAX_PAGE_LIMIT: z.coerce.number().int().min(1).max(500).default(50),
  /** Límite por defecto si el cliente no envía ?limit=. */
  DEFAULT_PAGE_LIMIT: z.coerce.number().int().min(1).max(200).default(24),
  /** Rate limits (intentos por minuto) — seguridad técnica. */
  LOGIN_MAX_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  ORDER_MAX_PER_MINUTE: z.coerce.number().int().min(1).default(6),
  DISCOUNT_MAX_PER_MINUTE: z.coerce.number().int().min(1).default(20),
  /** Borradores con IA por minuto (protege el coste del servicio). */
  AI_DRAFT_MAX_PER_MINUTE: z.coerce.number().int().min(1).default(6),
  /** Límites de atributos dinámicos (Fase 4). */
  ATTRIBUTES_MAX_BYTES: z.coerce.number().int().min(1024).default(16384),
  ATTRIBUTES_MAX_DEPTH: z.coerce.number().int().min(1).max(4).default(2),
  ATTRIBUTES_MAX_KEYS: z.coerce.number().int().min(4).default(32),
  /** Uploads de medios (almacenamiento local; S3 documentado como opcional). */
  UPLOAD_MAX_BYTES: z.coerce.number().int().default(5_242_880),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).default(12),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Error de configuración: se registra con detalle y se aborta el arranque
  // del módulo. No se degrada silenciosamente una configuración inválida.
  const detail = parsed.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  throw new Error(`[CONFIG] Variables de entorno inválidas → ${detail}`);
}

export const config = parsed.data;

// En Vercel el secreto de sesiones es OBLIGATORIO: sin él no se permite el
// arranque (el fallback de desarrollo está pensado solo para el sandbox).
// Se detecta por VERCEL (presente solo en esa plataforma) para no afectar al
// despliegue standalone del sandbox, que corre en producción sin AUTH_SECRET.
if (process.env.VERCEL && !parsed.data.AUTH_SECRET) {
  throw new Error(
    "[CONFIG] AUTH_SECRET es obligatoria en Vercel. Genera un secreto con `openssl rand -hex 32` " +
      "y configúralo como variable de entorno del proyecto (ver docs/deploy-vercel-neon.md).",
  );
}

/** Directorio (dentro de /public) donde se guardan los medios subidos. */
export const UPLOAD_DIR = "public/uploads";

/** MIME types permitidos para medios (whitelist técnica de seguridad). */
export const ALLOWED_UPLOAD_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;
