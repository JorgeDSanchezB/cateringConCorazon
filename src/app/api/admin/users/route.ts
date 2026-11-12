import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, requireUser } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { apiHandler, descCursorClause, getPagination, jsonOk, listEnvelope, parseBody } from "@/lib/http";
import { generateTempPassword } from "@/lib/services/users";

/**
 * GET  /api/admin/users?limit&cursor&q&role  (ADMIN)
 * POST /api/admin/users  (ADMIN)
 * La contraseña es opcional en la creación: si no se envía, se genera una
 * temporal y se fuerza su cambio en el primer login.
 */
const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email("Email inválido"),
  role: z.enum(["ADMIN", "STAFF", "CONTADOR"]),
  password: z
    .string()
    .min(10, "La contraseña debe tener al menos 10 caracteres")
    .max(128)
    .regex(/[A-Za-z]/, "Debe incluir letras")
    .regex(/\d/, "Debe incluir al menos un número")
    .optional(),
  mustChangePassword: z.boolean().optional(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const { limit, cursor } = getPagination(req);
  const params = req.nextUrl.searchParams;
  const q = params.get("q")?.trim() ?? "";
  const role = params.get("role");

  const rows = await db.user.findMany({
    where: {
      ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}),
      ...(role === "ADMIN" || role === "STAFF" || role === "CONTADOR" ? { role } : {}),
      ...(cursor ? descCursorClause("createdAt", cursor) : {}),
    } as Prisma.UserWhereInput,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true, email: true, name: true, role: true, isActive: true,
      mustChangePassword: true, lastLoginAt: true, createdAt: true,
    },
  });

  const { items, nextCursor } = listEnvelope(rows, limit, (row) => ({
    v1: row.createdAt.toISOString(),
    v2: row.id,
  }));
  return jsonOk({ items, nextCursor });
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  const body = await parseBody(req, userCreateSchema);

  const existing = await db.user.findUnique({ where: { email: body.email } });
  if (existing) {
    throw new ValidationError([{ field: "email", message: "Ya existe un usuario con ese email." }]);
  }

  const tempPassword = body.password ? null : generateTempPassword();
  const passwordHash = await hashPassword(body.password ?? tempPassword!);
  const user = await db.user.create({
    data: {
      name: body.name,
      email: body.email,
      role: body.role,
      passwordHash,
      isActive: true,
      mustChangePassword: body.password ? (body.mustChangePassword ?? false) : true,
    },
    select: { id: true, email: true, name: true, role: true, isActive: true, mustChangePassword: true, createdAt: true },
  });
  return jsonOk({ ...user, tempPassword }, { status: 201 });
});
