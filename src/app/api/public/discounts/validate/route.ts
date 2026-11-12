import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { getFlags } from "@/lib/flags";
import { ValidationError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  DISCOUNT_REJECTION_MESSAGES,
  discountLabel,
  evaluateDiscount,
  type DiscountRecord,
  type DiscountType,
} from "@/lib/domain/discount";

/**
 * POST /api/public/discounts/validate  { code, subtotalCents }
 * Valida un código de descuento contra el subtotal actual.
 * Respuestas: 200 { valid: true, ... } | 422 problem con reason legible.
 * Rate limited (seguridad).
 */
const validateSchema = z.object({
  code: z.string().trim().min(1, "Ingrese un código").max(40),
  subtotalCents: z.number().int().min(0),
});

export const POST = apiHandler(async (req: NextRequest) => {
  rateLimit("discount-validate", clientIp(req), config.DISCOUNT_MAX_PER_MINUTE);
  const body = await parseBody(req, validateSchema);
  const flags = await getFlags();

  const record = await db.discountCode.findUnique({
    where: { code: body.code.toUpperCase() },
  });

  if (!record) {
    throw new ValidationError([
      { field: "code", message: "El código no existe.", code: "NOT_FOUND" },
    ]);
  }

  // El enum vive en la capa de aplicación (SQLite no tiene enums): el valor
  // almacenado llega como string y se acota al union del dominio.
  const discountRecord: DiscountRecord = {
    ...record,
    type: record.type as DiscountType,
  };

  const evaluation = evaluateDiscount(discountRecord, {
    subtotalCents: body.subtotalCents,
    now: new Date(),
    discountsEnabled: flags.discounts_enabled,
  });

  if (!evaluation.ok) {
    throw new ValidationError([
      {
        field: "code",
        message: DISCOUNT_REJECTION_MESSAGES[evaluation.reason],
        code: evaluation.reason,
      },
    ]);
  }

  return jsonOk({
    valid: true,
    code: record.code,
    type: record.type,
    amountCents: evaluation.amountCents,
    label: discountLabel(discountRecord),
  });
});
