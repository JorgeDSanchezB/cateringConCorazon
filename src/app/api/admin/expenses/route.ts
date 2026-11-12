import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiHandler, descCursorClause, getPagination, jsonOk, listEnvelope, parseBody } from "@/lib/http";

/**
 * GET  /api/admin/expenses?limit&cursor&from&to&category  (CONTADOR/ADMIN)
 * POST /api/admin/expenses  (CONTADOR/ADMIN)
 */
const expenseCreateSchema = z.object({
  concept: z.string().trim().min(2, "Concepto obligatorio").max(160),
  amount: z.number().int().min(1, "El monto debe ser positivo").max(100_000_000),
  category: z.string().trim().max(60).nullable().optional(),
  spentAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Fecha inválida." }),
  notes: z.string().max(300).nullable().optional(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["CONTADOR", "ADMIN"] });
  const { limit, cursor } = getPagination(req);
  const params = req.nextUrl.searchParams;
  const category = params.get("category");
  const from = params.get("from");
  const to = params.get("to");
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  const rows = await db.expense.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(fromDate || toDate
        ? { spentAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
        : {}),
      ...(cursor ? descCursorClause("spentAt", cursor) : {}),
    } as Prisma.ExpenseWhereInput,
    orderBy: [{ spentAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true, concept: true, amount: true, category: true, spentAt: true,
      notes: true, createdAt: true,
      createdBy: { select: { name: true } },
    },
  });

  const { items, nextCursor } = listEnvelope(rows, limit, (row) => ({
    v1: row.spentAt.toISOString(),
    v2: row.id,
  }));
  return jsonOk({ items, nextCursor });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser(req, { roles: ["CONTADOR", "ADMIN"] });
  const body = await parseBody(req, expenseCreateSchema);
  const expense = await db.expense.create({
    data: {
      concept: body.concept,
      amount: body.amount,
      category: body.category ?? null,
      spentAt: new Date(body.spentAt),
      notes: body.notes ?? null,
      createdById: user.id,
    },
  });
  return jsonOk(expense, { status: 201 });
});
