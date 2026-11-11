import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NotFoundError, ModuleDisabledError, ConflictError } from "@/lib/errors";
import { getFlag } from "@/lib/flags";
import { apiHandler, descCursorClause, getPagination, jsonOk, listEnvelope, parseBody } from "@/lib/http";
import { issueInvoiceForOrder } from "@/lib/services/invoices";

/**
 * GET  /api/admin/invoices?limit&cursor&status  (CONTADOR/ADMIN)
 * POST /api/admin/invoices { orderId, customerName?, customerTaxId? }
 *
 * El flag invoicing_enabled se lee EN CALIENTE: activar facturación a mitad
 * de operación habilita la emisión sin reiniciar el servidor.
 */
const invoiceCreateSchema = z.object({
  orderId: z.string().min(1).max(64),
  customerName: z.string().trim().max(120).nullable().optional(),
  customerTaxId: z.string().trim().max(20).nullable().optional(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["CONTADOR", "ADMIN"] });
  const invoicingEnabled = await getFlag("invoicing_enabled");
  if (!invoicingEnabled) throw new ModuleDisabledError("invoicing_enabled", "Facturación");
  const { limit, cursor } = getPagination(req);
  const status = req.nextUrl.searchParams.get("status");

  const rows = await db.invoice.findMany({
    where: {
      ...(status === "ACTIVE" || status === "VOID" ? { status } : {}),
      ...(cursor ? descCursorClause("issuedAt", cursor) : {}),
    } as Prisma.InvoiceWhereInput,
    orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true, number: true, orderId: true, customerName: true, customerTaxId: true,
      subtotal: true, discountAmount: true, taxPercent: true, taxAmount: true, total: true,
      status: true, voidedAt: true, voidedReason: true, issuedAt: true,
      order: { select: { code: true, channel: true } },
      issuedBy: { select: { name: true } },
    },
  });

  const { items, nextCursor } = listEnvelope(rows, limit, (row) => ({
    v1: row.issuedAt.toISOString(),
    v2: row.id,
  }));
  return jsonOk({ items, nextCursor });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser(req, { roles: ["CONTADOR", "ADMIN"] });
  const invoicingEnabled = await getFlag("invoicing_enabled");
  if (!invoicingEnabled) throw new ModuleDisabledError("invoicing_enabled", "Facturación");
  const body = await parseBody(req, invoiceCreateSchema);

  const order = await db.order.findUnique({ where: { id: body.orderId } });
  if (!order) throw new NotFoundError("Pedido");
  if (order.status === "CANCELLED") {
    throw new ConflictError("ORDER_CANCELLED", "No se puede facturar un pedido cancelado.");
  }

  const { number } = await db.$transaction(async (tx) =>
    issueInvoiceForOrder(
      tx,
      {
        id: order.id,
        code: order.code,
        customerName: order.customerName,
        subtotal: order.subtotal,
        discountAmount: order.discountAmount,
        taxPercent: order.taxPercent,
        taxAmount: order.taxAmount,
        total: order.total,
      },
      user.id,
      { name: body.customerName ?? null, taxId: body.customerTaxId ?? null },
    ),
  );
  return jsonOk({ number, orderId: order.id }, { status: 201 });
});
