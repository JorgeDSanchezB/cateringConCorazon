import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { NotFoundError, ValidationError } from "../errors";

/**
 * Inventario simple por producto (sin ingredientes — decisión de alcance).
 * Todo movimiento registra MOTIVO obligatorio y usuario cuando hay sesión.
 */

export async function adjustStock(
  productId: string,
  delta: number,
  reason: string,
  userId: string | null,
): Promise<{ productId: string; quantity: number }> {
  if (!Number.isInteger(delta) || delta === 0) {
    throw new ValidationError([
      { field: "delta", message: "delta debe ser un entero distinto de cero." },
    ]);
  }
  if (reason.trim().length < 3) {
    throw new ValidationError([
      { field: "reason", message: "El motivo del ajuste es obligatorio (mínimo 3 caracteres)." },
    ]);
  }
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw new NotFoundError("Producto");

  return db.$transaction(async (tx) => {
    const existing = await tx.inventoryStock.findUnique({ where: { productId } });
    let quantity: number;
    if (existing) {
      const updated = await tx.inventoryStock.update({
        where: { productId },
        data: { quantity: { increment: delta } },
      });
      quantity = updated.quantity;
    } else {
      const created = await tx.inventoryStock.create({
        data: { productId, quantity: delta },
      });
      quantity = created.quantity;
    }
    await tx.inventoryMovement.create({
      data: {
        productId,
        userId,
        delta,
        reason: reason.trim(),
      },
    });
    return { productId, quantity };
  });
}

export interface StockConsumption {
  productId: string;
  productName: string;
  quantity: number;
}

/**
 * Aplica (decrementa o incrementa) stock por lista de consumos dentro de una tx.
 * Decremento: verifica suficiencia → 422/409 detallado por producto si falla.
 * Incremento (reentrada/cancelación): crea la fila si no existe.
 * Productos SIN fila de stock se consideran sin seguimiento (ilimitados).
 */
export async function applyStock(
  tx: Prisma.TransactionClient,
  consumptions: StockConsumption[],
  direction: "decrement" | "increment",
  reason: string,
): Promise<void> {
  for (const c of consumptions) {
    const stock = await tx.inventoryStock.findUnique({ where: { productId: c.productId } });
    if (!stock && direction === "increment") {
      await tx.inventoryStock.create({
        data: { productId: c.productId, quantity: c.quantity },
      });
    } else if (!stock) {
      continue; // sin seguimiento de stock
    } else {
      if (direction === "decrement" && stock.quantity < c.quantity) {
        throw new ValidationError([
          {
            field: "items",
            message: `Stock insuficiente de «${c.productName}»: disponible ${stock.quantity}, requerido ${c.quantity}. Ajuste el inventario o reduzca la cantidad.`,
            code: "INSUFFICIENT_STOCK",
          },
        ]);
      }
      await tx.inventoryStock.update({
        where: { productId: c.productId },
        data: { quantity: { increment: direction === "decrement" ? -c.quantity : c.quantity } },
      });
    }
    await tx.inventoryMovement.create({
      data: {
        productId: c.productId,
        delta: direction === "decrement" ? -c.quantity : c.quantity,
        reason,
      },
    });
  }
}

/** Verifica suficiencia de stock SIN escribir (para completar reservas). */
export async function assertStockAvailable(
  tx: Prisma.TransactionClient,
  consumptions: StockConsumption[],
): Promise<void> {
  for (const c of consumptions) {
    const stock = await tx.inventoryStock.findUnique({ where: { productId: c.productId } });
    if (stock && stock.quantity < c.quantity) {
      throw new ValidationError([
        {
          field: "status",
          message: `No hay stock suficiente para «${c.productName}» (disponible ${stock.quantity}, requerido ${c.quantity}). Ajuste inventario primero.`,
          code: "INSUFFICIENT_STOCK",
        },
      ]);
    }
  }
}
