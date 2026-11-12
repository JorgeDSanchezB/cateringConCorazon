import Ajv, { type ValidateFunction } from "ajv";
import { config } from "../config";
import { ValidationError } from "../errors";
import { attributesShapeSchema, type AttributesValue } from "./attributes-render";

// El shape y los helpers de RENDER viven en attributes-render.ts (cliente-seguro,
// sin importar config: ese archivo se evalúa también en el navegador).
export { attributesShapeSchema };
export type { AttributesValue };

/**
 * FASE 4 — Lógica de inserción extensible.
 *
 * Product.attributes es un JSON almacenado (equivalente JSONB) validado
 * contra una ProductAttributeSchema VERSIONADA (JSON Schema + ajv).
 *
 * Controles aplicados:
 * - Campos: solo las claves del esquema activo (additionalProperties:false
 *   forzado al guardar el esquema) → valor desconocido = 422 por defecto.
 * - Tipos: primitivos (string/number/boolean/null) o un nivel de anidación.
 * - Tamaño máximo: ATTRIBUTES_MAX_BYTES (16 KB configurable).
 * - Profundidad máxima: ATTRIBUTES_MAX_DEPTH (2 configurable).
 * - Nombres peligrosos: __proto__, constructor, prototype, toString, valueOf, hasOwnProperty.
 * - Versionado: el producto guarda attributeSchemaVersion y se valida contra
 *   ESA versión, no contra la actual (compatibilidad hacia atrás).
 *
 * Justificación de JSONB frente a EAV: ver ADR-003.
 */

/** Tamaño serializado en bytes (UTF-8). */
export function attributesBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? {}), "utf8");
}

/** Profundidad real del objeto (1 = plano, 2 = un nivel anidado). */
export function attributesDepth(value: unknown): number {
  if (typeof value !== "object" || value === null) return 0;
  let max = 1;
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (typeof child === "object" && child !== null) {
      max = Math.max(max, 2); // no permitimos más niveles: 2 es el tope
    }
  }
  return max;
}

export type AttributesInspection =
  | { ok: true; value: AttributesValue }
  | { ok: false; field: string; message: string };

/**
 * Inspección estructural de un valor de atributos recibido (antes del ajv).
 * `null` o cadena vacía se considera "ausente" → {} (no se persiste).
 */
export function inspectAttributes(input: unknown): AttributesInspection {
  if (input === null || input === undefined) return { ok: true, value: {} };
  const parsed = attributesShapeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      field: "attributes",
      message: parsed.error.issues[0]?.message ?? "Estructura de atributos inválida.",
    };
  }
  const value = parsed.data;
  const keys = Object.keys(value);
  if (keys.length > config.ATTRIBUTES_MAX_KEYS) {
    return {
      ok: false,
      field: "attributes",
      message: `Máximo ${config.ATTRIBUTES_MAX_KEYS} claves permitidas.`,
    };
  }
  if (attributesBytes(value) > config.ATTRIBUTES_MAX_BYTES) {
    return {
      ok: false,
      field: "attributes",
      message: `El tamaño supera ${Math.floor(config.ATTRIBUTES_MAX_BYTES / 1024)} KB.`,
    };
  }
  if (attributesDepth(value) > config.ATTRIBUTES_MAX_DEPTH) {
    return {
      ok: false,
      field: "attributes",
      message: `La profundidad máxima permitida es ${config.ATTRIBUTES_MAX_DEPTH}.`,
    };
  }
  return { ok: true, value };
}

// ── ajv: compilación cacheada por versión de esquema ──

const ajv = new Ajv({ allErrors: true, strict: false });
const compiledCache = new Map<number, ValidateFunction>();

/**
 * Normaliza el esquema del admin a un mundo CERRADO:
 * fuerza additionalProperties:false y elimina type:"object" raíz abierto.
 */
function hardenSchema(raw: unknown): Record<string, unknown> {
  const schema = { ...(raw as Record<string, unknown>) };
  const props = (schema.properties ?? {}) as Record<string, unknown>;
  schema.properties = { ...props };
  schema.additionalProperties = false;
  if (schema.type === undefined) schema.type = "object";
  return schema;
}

function compile(version: number, schemaJson: string): ValidateFunction {
  const cached = compiledCache.get(version);
  if (cached) return cached;
  const parsed = JSON.parse(schemaJson) as unknown;
  const compiled = ajv.compile(hardenSchema(parsed));
  compiledCache.set(version, compiled);
  return compiled;
}

export type SchemaValidation =
  | { valid: true }
  | { valid: false; errors: string[] };

/**
 * Valida atributos contra el JSON Schema de la versión indicada.
 * @param version versión del esquema del PRODUCTO (no la activa).
 */
export function validateAgainstSchema(
  value: AttributesValue,
  version: number,
  schemaJson: string,
): SchemaValidation {
  let validate: ValidateFunction;
  try {
    validate = compile(version, schemaJson);
  } catch (err) {
    console.error("[CRITICAL] JSON Schema de atributos inválido:", err);
    return { valid: false, errors: ["El esquema de atributos almacenado es inválido (error de configuración)."] };
  }
  const ok = validate(value);
  if (ok) return { valid: true };
  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath || "(raíz)"} ${e.message ?? "no valida"}`,
  );
  return { valid: false, errors: errors.length > 0 ? errors : ["Atributos inválidos contra el esquema."] };
}

/**
 * Pipeline completo de validación de atributos para creación/actualización
 * de producto: shape → límites → JSON Schema versionado.
 * Lanza ValidationError con detalle por campo. Devuelve el valor saneado
 * listo para serializar, o null si llegó ausente/nulo.
 */
export function pipelineAttributes(
  raw: unknown,
  schemaRecord: { version: number; schemaJson: string } | null,
): string | null {
  const inspection = inspectAttributes(raw);
  if (!inspection.ok) {
    throw new ValidationError([{ field: inspection.field, message: inspection.message }]);
  }
  const value = inspection.value;
  if (Object.keys(value).length === 0) return null;
  if (!schemaRecord) {
    // Sin esquema activo solo se permiten atributos estructuralmente válidos.
    return JSON.stringify(value);
  }
  const schemaResult = validateAgainstSchema(value, schemaRecord.version, schemaRecord.schemaJson);
  if (!schemaResult.valid) {
    throw new ValidationError(
      schemaResult.errors.map((message) => ({ field: "attributes", message })),
    );
  }
  return JSON.stringify(value);
}
