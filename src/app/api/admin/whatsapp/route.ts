import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";
import { DEFAULT_WHATSAPP_TEMPLATE, isValidWhatsAppPhone } from "@/lib/whatsapp";

/**
 * GET /api/admin/whatsapp  (ADMIN)
 * PUT /api/admin/whatsapp  (ADMIN)
 * Tolerancia: teléfono ausente/vacío permitido (null) → la web pública
 * muestra fallback y aquí se advierte claramente; formato inválido → 422.
 */
const whatsappPutSchema = z.object({
  phoneNumber: z.string().trim().max(20).nullable().optional(),
  defaultMessage: z.string().min(10, "La plantilla es demasiado corta").max(2000),
  buttonLabel: z.string().trim().min(2).max(40),
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const wa = await db.whatsAppSetting.findUnique({ where: { id: "whatsapp" } });
  const phoneNumber = wa?.phoneNumber?.trim() || null;
  return jsonOk({
    phoneNumber,
    defaultMessage: wa?.defaultMessage ?? DEFAULT_WHATSAPP_TEMPLATE,
    buttonLabel: wa?.buttonLabel ?? "Reservar por WhatsApp",
    configured: phoneNumber !== null && isValidWhatsAppPhone(phoneNumber),
  });
});

export const PUT = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const body = await parseBody(req, whatsappPutSchema);
  const phone = body.phoneNumber === "" ? null : body.phoneNumber ?? null;
  if (phone !== null && !isValidWhatsAppPhone(phone)) {
    throw new ValidationError([
      {
        field: "phoneNumber",
        message: "Formato E.164 requerido, ej: +593998877665 (con el + y sin espacios).",
      },
    ]);
  }
  const saved = await db.whatsAppSetting.upsert({
    where: { id: "whatsapp" },
    update: {
      phoneNumber: phone,
      defaultMessage: body.defaultMessage,
      buttonLabel: body.buttonLabel,
    },
    create: {
      id: "whatsapp",
      phoneNumber: phone,
      defaultMessage: body.defaultMessage,
      buttonLabel: body.buttonLabel,
    },
  });
  return jsonOk({
    phoneNumber: saved.phoneNumber,
    defaultMessage: saved.defaultMessage,
    buttonLabel: saved.buttonLabel,
    configured: saved.phoneNumber !== null && isValidWhatsAppPhone(saved.phoneNumber),
  });
});
