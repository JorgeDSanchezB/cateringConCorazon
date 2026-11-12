import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiHandler, ascCursorClause, getPagination, jsonOk, listEnvelope, parseBody } from "@/lib/http";

/**
 * GET  /api/admin/content/testimonials  (ADMIN)
 * POST /api/admin/content/testimonials  (ADMIN)
 * Se pueden gestionar siempre; solo se MUESTRAN en la web si el flag
 * testimonials_enabled está activo.
 */
const testimonialCreateSchema = z.object({
  customerName: z.string().trim().min(2).max(80),
  text: z.string().trim().min(10, "Testimonio demasiado corto").max(600),
  rating: z.number().int().min(1).max(5),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { limit, cursor } = getPagination(req);
  const rows = await db.testimonial.findMany({
    where: { ...(cursor ? ascCursorClause(cursor) : {}) } as Prisma.TestimonialWhereInput,
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
  const body = await parseBody(req, testimonialCreateSchema);
  const testimonial = await db.testimonial.create({
    data: {
      customerName: body.customerName,
      text: body.text,
      rating: body.rating,
      isVisible: body.isVisible ?? true,
      sortOrder: body.sortOrder ?? 0,
    },
  });
  return jsonOk(testimonial, { status: 201 });
});
