import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";

/**
 * GET  /api/admin/attribute-schemas  (ADMIN)
 * POST /api/admin/attribute-schemas  (ADMIN)
 *
 * Versionado de ProductAttributeSchema. Reglas:
 * - El esquema debe ser un objeto JSON Schema con `properties` de tipos
 *   simples (string/number/boolean + enum de strings).
 * - Se fuerza additionalProperties:false (mundo cerrado → clave desconocida
 *   = 422 en la validación de productos).
 * - Crear una nueva versión desactiva la anterior (solo una activa).
 * - Los productos existentes siguen validando contra SU versión (compat).
 */
const schemaCreateSchema = z.object({
  description: z.string().trim().max(200).optional(),
  schemaJson: z.string().min(2, "Esquema vacío"),
});

const ALLOWED_PROPERTY_TYPES = new Set(["string", "number", "boolean"]);

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const rows = await db.productAttributeSchema.findMany({
    orderBy: { version: "desc" },
    select: { id: true, version: true, schemaJson: true, description: true, isActive: true, createdAt: true },
  });
  return jsonOk({ items: rows });
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const body = await parseBody(req, schemaCreateSchema);

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.schemaJson);
  } catch {
    throw new ValidationError([{ field: "schemaJson", message: "No es JSON válido." }]);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError([{ field: "schemaJson", message: "El esquema debe ser un objeto." }]);
  }
  const schema = parsed as Record<string, unknown>;
  const properties = schema.properties;
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
    throw new ValidationError([{ field: "schemaJson", message: "Debe incluir 'properties' como objeto." }]);
  }
  for (const [key, prop] of Object.entries(properties as Record<string, unknown>)) {
    if (typeof prop !== "object" || prop === null) {
      throw new ValidationError([{ field: "schemaJson", message: `Propiedad '${key}' inválida.` }]);
    }
    const p = prop as Record<string, unknown>;
    const type = p.type;
    if (typeof type !== "string" || !ALLOWED_PROPERTY_TYPES.has(type)) {
      throw new ValidationError([
        {
          field: "schemaJson",
          message: `Propiedad '${key}': type debe ser string|number|boolean (los enums se expresan con type:string + enum).`,
        },
      ]);
    }
    if (p.enum !== undefined && !Array.isArray(p.enum)) {
      throw new ValidationError([{ field: "schemaJson", message: `Propiedad '${key}': enum debe ser arreglo.` }]);
    }
  }
  // Mundo cerrado garantizado en persistencia.
  schema.additionalProperties = false;

  const created = await db.$transaction(async (tx) => {
    await tx.productAttributeSchema.updateMany({ where: { isActive: true }, data: { isActive: false } });
    const max = await tx.productAttributeSchema.findFirst({ orderBy: { version: "desc" }, select: { version: true } });
    const version = (max?.version ?? 0) + 1;
    return tx.productAttributeSchema.create({
      data: {
        version,
        schemaJson: JSON.stringify(schema),
        description: body.description ?? null,
        isActive: true,
      },
    });
  });
  return jsonOk(created, { status: 201 });
});
