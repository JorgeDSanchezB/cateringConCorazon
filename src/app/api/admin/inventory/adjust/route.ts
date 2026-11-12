import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";
import { adjustStock } from "@/lib/services/inventory";

/**
 * POST /api/admin/inventory/adjust  (ADMIN/STAFF)
 * Ajuste de stock con MOTIVO obligatorio y movimiento auditado.
 */
const adjustSchema = z.object({
  productId: z.string().min(1).max(64),
  delta: z.number().int().refine((v) => v !== 0, { message: "delta no puede ser 0." }),
  reason: z.string().trim().min(3, "El motivo es obligatorio").max(200),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser(req, { roles: ["ADMIN", "STAFF"] });
  const body = await parseBody(req, adjustSchema);
  const result = await adjustStock(body.productId, body.delta, body.reason, user.id);
  return jsonOk(result, { status: 201 });
});
