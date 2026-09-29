import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { seedDatabase } from '@/lib/seed';
import { recordConsumption } from '@/lib/services/consumptionService';
import crypto from 'crypto';

describe('Milestone 2: Consumption Service & Concurrency Tests', () => {
  const seedAnchor = new Date('2026-10-01T00:00:00.000Z');

  beforeEach(async () => {
    await seedDatabase(prisma, seedAnchor);
  });

  it('records valid consumption atomically and updates inventory balance and ledger', async () => {
    const food = await prisma.supply.findFirst({ where: { name: 'Food Packs' } });
    expect(food).not.toBeNull();
    const initialStock = Number(food!.onHandQuantity);
    expect(initialStock).toBe(120);

    const operationId = crypto.randomUUID();
    const result = await recordConsumption({
      operationId,
      supplyId: food!.id,
      quantity: 15,
      occurredAt: new Date(),
    });

    expect(result.status).toBe('ACCEPTED');
    if (result.status === 'ACCEPTED') {
      expect(result.newOnHandQuantity).toBe(105);
    }

    // Verify database state
    const updatedFood = await prisma.supply.findUnique({ where: { id: food!.id } });
    expect(Number(updatedFood?.onHandQuantity)).toBe(105);

    // Verify consumption event exists
    const event = await prisma.consumptionEvent.findUnique({ where: { id: operationId } });
    expect(event).not.toBeNull();
    expect(Number(event?.quantity)).toBe(15);

    // Verify ledger movement exists
    const movement = await prisma.inventoryMovement.findUnique({
      where: {
        sourceReference_movementType: {
          sourceReference: `consumption:${operationId}`,
          movementType: 'CONSUMPTION',
        },
      },
    });
    expect(movement).not.toBeNull();
    expect(Number(movement?.signedQuantityChange)).toBe(-15);
  });

  it('deduplicates identical operation UUID and payload without double deduction', async () => {
    const food = await prisma.supply.findFirst({ where: { name: 'Food Packs' } });
    const operationId = crypto.randomUUID();
    const fixedOccurredAt = new Date('2026-10-01T12:00:00Z');

    // First attempt
    const res1 = await recordConsumption({
      operationId,
      supplyId: food!.id,
      quantity: 20,
      occurredAt: fixedOccurredAt,
    });
    expect(res1.status).toBe('ACCEPTED');

    // Duplicate retry attempt (e.g. client network retry after dropped response)
    const res2 = await recordConsumption({
      operationId,
      supplyId: food!.id,
      quantity: 20,
      occurredAt: fixedOccurredAt,
    });
    expect(res2.status).toBe('ALREADY_APPLIED');

    // Stock should be 100, deducted ONCE only
    const updatedFood = await prisma.supply.findUnique({ where: { id: food!.id } });
    expect(Number(updatedFood?.onHandQuantity)).toBe(100);

    // Exactly one ledger movement must exist
    const movements = await prisma.inventoryMovement.findMany({
      where: { sourceReference: `consumption:${operationId}` },
    });
    expect(movements).toHaveLength(1);
  });

  it('detects and rejects conflicting payload using the same UUID (HTTP 409 behavior)', async () => {
    const food = await prisma.supply.findFirst({ where: { name: 'Food Packs' } });
    const operationId = crypto.randomUUID();
    const fixedOccurredAt = new Date('2026-10-01T12:00:00Z');

    // First attempt: 10 packs
    const res1 = await recordConsumption({
      operationId,
      supplyId: food!.id,
      quantity: 10,
      occurredAt: fixedOccurredAt,
    });
    expect(res1.status).toBe('ACCEPTED');

    // Altered payload: same UUID, but different quantity (50 packs)
    const res2 = await recordConsumption({
      operationId,
      supplyId: food!.id,
      quantity: 50,
      occurredAt: fixedOccurredAt,
    });
    expect(res2.status).toBe('CONFLICT');

    // Stock should only have deducted the original 10 packs
    const updatedFood = await prisma.supply.findUnique({ where: { id: food!.id } });
    expect(Number(updatedFood?.onHandQuantity)).toBe(110);
  });

  it('rejects consumption exceeding on-hand stock and prevents negative inventory', async () => {
    const food = await prisma.supply.findFirst({ where: { name: 'Food Packs' } });
    const operationId = crypto.randomUUID();

    const result = await recordConsumption({
      operationId,
      supplyId: food!.id,
      quantity: 200, // Available is 120
      occurredAt: new Date(),
    });

    expect(result.status).toBe('INSUFFICIENT_STOCK');

    // Stock remains 120
    const freshFood = await prisma.supply.findUnique({ where: { id: food!.id } });
    expect(Number(freshFood?.onHandQuantity)).toBe(120);

    // No event or movement created
    const event = await prisma.consumptionEvent.findUnique({ where: { id: operationId } });
    expect(event).toBeNull();
  });

  it('rejects non-positive quantities', async () => {
    const food = await prisma.supply.findFirst({ where: { name: 'Food Packs' } });

    const zeroRes = await recordConsumption({
      operationId: crypto.randomUUID(),
      supplyId: food!.id,
      quantity: 0,
      occurredAt: new Date(),
    });
    expect(zeroRes.status).toBe('INVALID_SUPPLY');

    const negRes = await recordConsumption({
      operationId: crypto.randomUUID(),
      supplyId: food!.id,
      quantity: -10,
      occurredAt: new Date(),
    });
    expect(negRes.status).toBe('INVALID_SUPPLY');
  });

  it('prevents overspending stock during parallel concurrent consumption', async () => {
    const food = await prisma.supply.findFirst({ where: { name: 'Food Packs' } });
    expect(Number(food?.onHandQuantity)).toBe(120);

    // Launch 5 parallel consumption requests of 30 units each (total demand 150 > stock 120)
    // Exactly 4 should succeed (4 * 30 = 120) and 1 must fail with INSUFFICIENT_STOCK
    const requests = Array.from({ length: 5 }).map(() =>
      recordConsumption({
        operationId: crypto.randomUUID(),
        supplyId: food!.id,
        quantity: 30,
        occurredAt: new Date(),
      })
    );

    const outcomes = await Promise.all(requests);
    const accepted = outcomes.filter((o) => o.status === 'ACCEPTED');
    const failed = outcomes.filter((o) => o.status === 'INSUFFICIENT_STOCK');

    expect(accepted).toHaveLength(4);
    expect(failed).toHaveLength(1);

    // Final stock must be exactly 0, never negative
    const finalFood = await prisma.supply.findUnique({ where: { id: food!.id } });
    expect(Number(finalFood?.onHandQuantity)).toBe(0);
  });
});
