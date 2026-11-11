import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";

/**
 * PATCH  /api/admin/expenses/:id  (CONTADOR/ADMIN)
 * DELETE /api/admin/expenses/:id  (CONTADOR/ADMIN)
 */
const expensePatchSchema = z.object({
  concept: z.string().trim().min(2).max(160).optional(),
  amount: z.number().int().min(1).max(100_000_000).optional(),
  category: z.string().trim().max(60).nullable().optional(),
  spentAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Fecha inválida." }).optional(),
  notes: z.string().max(300).nullable().optional(),
});

export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["CONTADOR", "ADMIN"] });
  const { id } = await ctx.params;
  const body = await parseBody(req, expensePatchSchema);
  const existing = await db.expense.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Gasto");
  const updated = await db.expense.update({
    where: { id },
    data: {
      ...(body.concept !== undefined ? { concept: body.concept } : {}),
      ...(body.amount !== undefined ? { amount: body.amount } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.spentAt !== undefined ? { spentAt: new Date(body.spentAt) } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    },
  });
  return jsonOk(updated);
});

export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["CONTADOR", "ADMIN"] });
  const { id } = await ctx.params;
  const existing = await db.expense.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Gasto");
  await db.expense.delete({ where: { id } });
  return jsonOk({ ok: true });
});
