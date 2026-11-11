import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";

/**
 * PATCH  /api/admin/content/faqs/:id  (ADMIN)
 * DELETE /api/admin/content/faqs/:id  (ADMIN)
 */
const faqPatchSchema = z.object({
  question: z.string().trim().min(4).max(200).optional(),
  answer: z.string().trim().min(4).max(1500).optional(),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const body = await parseBody(req, faqPatchSchema);
  const existing = await db.faq.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("FAQ");
  const updated = await db.faq.update({
    where: { id },
    data: {
      ...(body.question !== undefined ? { question: body.question } : {}),
      ...(body.answer !== undefined ? { answer: body.answer } : {}),
      ...(body.isVisible !== undefined ? { isVisible: body.isVisible } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    },
  });
  return jsonOk(updated);
});

export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const existing = await db.faq.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("FAQ");
  await db.faq.delete({ where: { id } });
  return jsonOk({ ok: true });
});
