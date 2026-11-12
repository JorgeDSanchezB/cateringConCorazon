import { z } from "zod";

/**
 * Esquemas de campo compartidos entre rutas.
 * idSchema acepta UUID (generados por Prisma en operación normal) o ids
 * deterministas del seed ("seed-product-..."), ambos válidos como
 * identificadores estables.
 */
export const idSchema = z.string().min(1).max(64);

/** Monto en centavos (entero, no negativo, acotado a $1M técnico). */
export const centsSchema = z.number().int().min(0).max(100_000_000);
