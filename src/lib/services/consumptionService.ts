import { prisma } from '@/lib/prisma';
import { MovementType } from '@prisma/client';
import { Decimal } from 'decimal.js';
import crypto from 'crypto';

export interface RecordConsumptionInput {
  operationId: string;
  supplyId: string;
  quantity: number | string | Decimal;
  occurredAt: Date | string;
}

export type ConsumptionOutcome =
  | { status: 'ACCEPTED'; eventId: string; newOnHandQuantity: number; message: string }
  | { status: 'ALREADY_APPLIED'; eventId: string; newOnHandQuantity: number; message: string }
  | { status: 'CONFLICT'; error: string }
  | { status: 'INSUFFICIENT_STOCK'; error: string; available: number; requested: number }
  | { status: 'INVALID_SUPPLY'; error: string };

export function calculateConsumptionFingerprint(
  supplyId: string,
  quantity: Decimal,
  occurredAt: Date
): string {
  const canonicalString = `${supplyId}:${quantity.toFixed(2)}:${occurredAt.toISOString()}`;
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

export async function recordConsumption(
  input: RecordConsumptionInput
): Promise<ConsumptionOutcome> {
  const { operationId, supplyId } = input;
  const quantity = new Decimal(input.quantity);
  const occurredAt = new Date(input.occurredAt);

  if (quantity.lessThanOrEqualTo(0)) {
    return {
      status: 'INVALID_SUPPLY',
      error: 'Consumption quantity must be strictly greater than zero.',
    };
  }

  if (isNaN(occurredAt.getTime())) {
    return {
      status: 'INVALID_SUPPLY',
      error: 'Invalid occurredAt timestamp.',
    };
  }

  const computedFingerprint = calculateConsumptionFingerprint(supplyId, quantity, occurredAt);

  return await prisma.$transaction(async (tx) => {
    // 1. Check for existing operation UUID
    const existingEvent = await tx.consumptionEvent.findUnique({
      where: { id: operationId },
      include: { supply: true },
    });

    if (existingEvent) {
      if (existingEvent.requestFingerprint === computedFingerprint) {
        return {
          status: 'ALREADY_APPLIED',
          eventId: existingEvent.id,
          newOnHandQuantity: Number(existingEvent.supply.onHandQuantity),
          message: 'Operation already processed and verified. No duplicate deduction made.',
        };
      } else {
        return {
          status: 'CONFLICT',
          error: `Conflict: Operation UUID ${operationId} was previously committed with a different payload.`,
        };
      }
    }

    // 2. Fetch and verify supply exists and is active
    const supply = await tx.supply.findUnique({
      where: { id: supplyId },
    });

    if (!supply) {
      return {
        status: 'INVALID_SUPPLY',
        error: `Supply with id ${supplyId} was not found.`,
      };
    }

    if (!supply.isActive) {
      return {
        status: 'INVALID_SUPPLY',
        error: `Supply "${supply.name}" is marked inactive and cannot be consumed.`,
      };
    }

    // 3. Atomically check and deduct stock using conditional update
    const currentStock = new Decimal(supply.onHandQuantity);
    if (currentStock.lessThan(quantity)) {
      return {
        status: 'INSUFFICIENT_STOCK',
        error: `Insufficient stock for "${supply.name}". Requested ${quantity.toFixed(2)} ${supply.unit}, but only ${currentStock.toFixed(2)} ${supply.unit} available.`,
        available: currentStock.toNumber(),
        requested: quantity.toNumber(),
      };
    }

    // Safe atomic update guarded by onHandQuantity >= quantity
    const updatedCount = await tx.$executeRaw`
      UPDATE "Supply"
      SET "onHandQuantity" = "onHandQuantity" - ${quantity.toNumber()}, "updatedAt" = NOW()
      WHERE id = ${supplyId} AND "isActive" = true AND "onHandQuantity" >= ${quantity.toNumber()}
    `;

    if (updatedCount === 0) {
      // Concurrent deduction caused stock to drop below requested
      const freshSupply = await tx.supply.findUnique({ where: { id: supplyId } });
      const freshStock = freshSupply ? new Decimal(freshSupply.onHandQuantity).toNumber() : 0;
      return {
        status: 'INSUFFICIENT_STOCK',
        error: `Concurrent transaction depleted stock for "${supply.name}". Available: ${freshStock}, Requested: ${quantity.toNumber()}`,
        available: freshStock,
        requested: quantity.toNumber(),
      };
    }

    // 4. Create the ConsumptionEvent record
    const event = await tx.consumptionEvent.create({
      data: {
        id: operationId,
        supplyId: supplyId,
        quantity: quantity,
        occurredAt: occurredAt,
        receivedAt: new Date(),
        requestFingerprint: computedFingerprint,
      },
    });

    // 5. Create the InventoryMovement ledger entry
    await tx.inventoryMovement.create({
      data: {
        supplyId: supplyId,
        signedQuantityChange: quantity.negated(),
        movementType: MovementType.CONSUMPTION,
        sourceReference: `consumption:${operationId}`,
        occurredAt: occurredAt,
      },
    });

    const newStock = currentStock.minus(quantity).toNumber();

    return {
      status: 'ACCEPTED',
      eventId: event.id,
      newOnHandQuantity: newStock,
      message: `Successfully recorded consumption of ${quantity.toFixed(2)} ${supply.unit} of "${supply.name}".`,
    };
  });
}
