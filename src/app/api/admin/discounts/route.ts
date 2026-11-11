import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiHandler, descCursorClause, getPagination, jsonOk, listEnvelope, parseBody } from "@/lib/http";

/**
 * GET  /api/admin/discounts  (ADMIN)
 * POST /api/admin/discounts  (ADMIN)
 * Código case-insensitive: se normaliza a MAYÚSCULAS.
 */
const discountCreateSchema = z
  .object({
    code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9-]+$/, "Solo letras, números y guion"),
    type: z.enum(["PERCENT", "FIXED_AMOUNT"]),
    value: z.number().int().min(1),
    minSubtotal: z.number().int().min(0).optional(),
    maxUses: z.number().int().min(1).nullable().optional(),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => (v.type === "PERCENT" ? v.value <= 100 : true), {
    message: "El porcentaje no puede superar 100.",
    path: ["value"],
  })
  .refine((v) => (v.startsAt && v.endsAt ? Date.parse(v.endsAt) > Date.parse(v.startsAt) : true), {
    message: "La fecha de fin debe ser posterior a la de inicio.",
    path: ["endsAt"],
  });

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { limit, cursor } = getPagination(req);
  const rows = await db.discountCode.findMany({
    where: { ...(cursor ? descCursorClause("createdAt", cursor) : {}) } as Prisma.DiscountCodeWhereInput,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true, code: true, type: true, value: true, minSubtotal: true,
      maxUses: true, usedCount: true, startsAt: true, endsAt: true,
      isActive: true, createdAt: true,
      _count: { select: { orders: true } },
    },
  });
  const { items, nextCursor } = listEnvelope(rows, limit, (row) => ({
    v1: row.createdAt.toISOString(),
    v2: row.id,
  }));
  return jsonOk({
    items: items.map((row) => ({ ...row, orderCount: row._count.orders, _count: undefined })),
    nextCursor,
  });
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const body = await parseBody(req, discountCreateSchema);
  const discount = await db.discountCode.create({
    data: {
      code: body.code.toUpperCase(),
      type: body.type,
      value: body.value,
      minSubtotal: body.minSubtotal ?? 0,
      maxUses: body.maxUses ?? null,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      isActive: body.isActive ?? true,
    },
  });
  return jsonOk(discount, { status: 201 });
});
