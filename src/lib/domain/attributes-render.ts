import { z } from "zod";

/**
 * Helpers de ATRIBUTOS para RENDERIZADO (cliente y servidor).
 *
 * Módulo CLIENTE-SEGURO: no importa nada de servidor (config/db) para poder
 * usarse desde componentes web sin romper la evaluación en el navegador.
 * La validación de escritura (ajv + límites de config) vive en
 * lib/domain/attributes.ts, exclusivamente de servidor.
 */

const FORBIDDEN_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "length",
]);

const primitiveValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const nestedValue = z.record(z.string().min(1).max(64), primitiveValue);
const attributeValue = z.union([primitiveValue, nestedValue]);

export const attributesShapeSchema = z
  .record(z.string().min(1).max(64), attributeValue)
  .refine(
    (obj) => Object.keys(obj).every((k) => !FORBIDDEN_KEYS.has(k)),
    { message: "El objeto contiene claves peligrosas no permitidas." },
  );

export type AttributesValue = z.output<typeof attributesShapeSchema>;

/** Parseo tolerante para LECTURA (renderizado): JSON corrupto → {} + warn. */
export function parseAttributesForRender(json: string | null): AttributesValue {
  if (json === null || json === "") return {};
  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as AttributesValue;
  } catch {
    console.warn("[RENDER] attributes JSON corrupto ignorado en renderizado");
    return {};
  }
}

/** camelCase/snake_case → etiqueta legible: "sinGluten" → "Sin gluten". */
export function prettyAttributeLabel(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export type RenderableAttributeValue =
  | boolean
  | string
  | number
  | null
  | Record<string, boolean | string | number | null>;

/**
 * Valor renderizable para la UI (Fase 5): la card decide qué mostrar.
 * - boolean → Sí/No
 * - null → "No especificado" (solo si aporta, lo decide la UI)
 * - número → String
 */
export function renderableAttributeValue(v: unknown): RenderableAttributeValue {
  if (v === null) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "string" || typeof v === "number") return v;
  return v as Record<string, boolean | string | number | null>;
}
