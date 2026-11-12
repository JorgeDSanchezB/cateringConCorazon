import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiHandler, ascCursorClause, getPagination, jsonOk, listEnvelope, parseBody } from "@/lib/http";

/**
 * GET  /api/admin/content/faqs  (ADMIN)
 * POST /api/admin/content/faqs  (ADMIN)
 */
const faqCreateSchema = z.object({
  question: z.string().trim().min(4, "Pregunta demasiado corta").max(200),
  answer: z.string().trim().min(4, "Respuesta demasiado corta").max(1500),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { limit, cursor } = getPagination(req);
  const rows = await db.faq.findMany({
    where: { ...(cursor ? ascCursorClause(cursor) : {}) } as Prisma.FaqWhereInput,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  const { items, nextCursor } = listEnvelope(rows, limit, (row) => ({
    v1: String(row.sortOrder),
    v2: row.id,
  }));
  return jsonOk({ items, nextCursor });
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const body = await parseBody(req, faqCreateSchema);
  const faq = await db.faq.create({
    data: {
      question: body.question,
      answer: body.answer,
      isVisible: body.isVisible ?? true,
      sortOrder: body.sortOrder ?? 0,
    },
  });
  return jsonOk(faq, { status: 201 });
});
