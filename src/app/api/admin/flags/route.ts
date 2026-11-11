import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";
import { FLAG_DEFAULTS, FLAG_DESCRIPTIONS, type FlagKey } from "@/lib/flags";

/**
 * GET /api/admin/flags  (ADMIN)
 * PUT /api/admin/flags  (ADMIN) — { flagKey: boolean } parcial.
 * Surte efecto en caliente (sin reinicio): los handlers leen el flag por request.
 */
const flagsPutSchema = z.record(z.string(), z.boolean());

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const rows = await db.featureFlag.findMany();
  const items = (Object.keys(FLAG_DEFAULTS) as FlagKey[]).map((key) => {
    const row = rows.find((r) => r.key === key);
    return {
      key,
      value: row?.value ?? FLAG_DEFAULTS[key],
      description: FLAG_DESCRIPTIONS[key],
      default: FLAG_DEFAULTS[key],
      updatedAt: row?.updatedAt ?? null,
    };
  });
  return jsonOk({ items });
});

export const PUT = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const body = await parseBody(req, flagsPutSchema);
  const validKeys = Object.keys(FLAG_DEFAULTS);
  const invalid = Object.keys(body).filter((k) => !validKeys.includes(k));
  if (invalid.length > 0) {
    throw new ValidationError([
      { field: "(raíz)", message: `Flags desconocidos: ${invalid.join(", ")}` },
    ]);
  }
  await db.$transaction(
    Object.entries(body).map(([key, value]) =>
      db.featureFlag.upsert({
        where: { key },
        update: { value },
        create: { key, value, description: FLAG_DESCRIPTIONS[key as FlagKey] },
      }),
    ),
  );
  const rows = await db.featureFlag.findMany();
  const items = (Object.keys(FLAG_DEFAULTS) as FlagKey[]).map((key) => {
    const row = rows.find((r) => r.key === key);
    return {
      key,
      value: row?.value ?? FLAG_DEFAULTS[key],
      description: FLAG_DESCRIPTIONS[key],
      default: FLAG_DEFAULTS[key],
      updatedAt: row?.updatedAt ?? null,
    };
  });
  return jsonOk({ items });
});
