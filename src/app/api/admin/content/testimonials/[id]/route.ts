import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";

/**
 * PATCH  /api/admin/content/testimonials/:id  (ADMIN)
 * DELETE /api/admin/content/testimonials/:id  (ADMIN)
 */
const testimonialPatchSchema = z.object({
  customerName: z.string().trim().min(2).max(80).optional(),
  text: z.string().trim().min(10).max(600).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const body = await parseBody(req, testimonialPatchSchema);
  const existing = await db.testimonial.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Testimonio");
  const updated = await db.testimonial.update({
    where: { id },
    data: {
      ...(body.customerName !== undefined ? { customerName: body.customerName } : {}),
      ...(body.text !== undefined ? { text: body.text } : {}),
      ...(body.rating !== undefined ? { rating: body.rating } : {}),
      ...(body.isVisible !== undefined ? { isVisible: body.isVisible } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    },
  });
  return jsonOk(updated);
});

export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { id } = await ctx.params;
  const existing = await db.testimonial.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Testimonio");
  await db.testimonial.delete({ where: { id } });
  return jsonOk({ ok: true });
});
