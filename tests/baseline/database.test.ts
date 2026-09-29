import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { seedDatabase } from '@/lib/seed';
import { MovementType, ShipmentStatus } from '@prisma/client';
import { Decimal } from 'decimal.js';

describe('Milestone 1: Database Baseline & Constraint Tests', () => {
  const seedAnchor = new Date('2026-10-01T00:00:00.000Z');

  beforeAll(async () => {
    await seedDatabase(prisma, seedAnchor);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('verifies station Maitri is properly seeded', async () => {
    const station = await prisma.station.findUnique({
      where: { identifier: 'MAITRI' },
    });
    expect(station).not.toBeNull();
    expect(station?.name).toBe('Maitri Antarctic Research Station');
  });

  it('verifies all 5 supplies exist with exact demo values', async () => {
    const supplies = await prisma.supply.findMany({
      orderBy: { name: 'asc' },
    });
    expect(supplies).toHaveLength(5);

    const food = supplies.find((s) => s.name === 'Food Packs');
    expect(food).toBeDefined();
    expect(Number(food?.onHandQuantity)).toBe(120);
    expect(Number(food?.configuredDailyConsumption)).toBe(10);
    expect(Number(food?.perPersonDailyExpeditionConsumption)).toBe(1);

    const water = supplies.find((s) => s.name === 'Drinking Water');
    expect(Number(water?.onHandQuantity)).toBe(4500);

    const diesel = supplies.find((s) => s.name === 'Diesel Fuel');
    expect(Number(diesel?.onHandQuantity)).toBe(12500);

    const medical = supplies.find((s) => s.name === 'Medical Kits');
    expect(Number(medical?.onHandQuantity)).toBe(40);

    const battery = supplies.find((s) => s.name === 'Battery Packs');
    expect(Number(battery?.onHandQuantity)).toBe(60);
  });

  it('verifies seed shipments: 1 completed (water+diesel) and 1 dispatched (battery)', async () => {
    const shipments = await prisma.shipment.findMany({
      include: {
        items: {
          include: { supply: true },
        },
      },
      orderBy: { requestedAt: 'asc' },
    });

    expect(shipments).toHaveLength(2);

    const received = shipments.find((s) => s.status === ShipmentStatus.RECEIVED);
    expect(received).toBeDefined();
    // Verify received shipment does not contain food packs
    const foodItemInReceived = received?.items.find((i) => i.supply.name === 'Food Packs');
    expect(foodItemInReceived).toBeUndefined();

    const dispatched = shipments.find((s) => s.status === ShipmentStatus.DISPATCHED);
    expect(dispatched).toBeDefined();
    expect(dispatched?.items[0].supply.name).toBe('Battery Packs');
  });

  it('enforces database check constraint: onHandQuantity cannot be negative', async () => {
    const food = await prisma.supply.findFirst({ where: { name: 'Food Packs' } });
    expect(food).not.toBeNull();

    // Raw SQL to attempt bypassing application layer
    await expect(
      prisma.$executeRaw`UPDATE "Supply" SET "onHandQuantity" = -10.00 WHERE id = ${food!.id}`
    ).rejects.toThrow();

    // Verify stock is untouched
    const freshFood = await prisma.supply.findUnique({ where: { id: food!.id } });
    expect(Number(freshFood?.onHandQuantity)).toBe(120);
  });

  it('enforces foreign key restrict: cannot delete a supply with referenced movements', async () => {
    const food = await prisma.supply.findFirst({ where: { name: 'Food Packs' } });
    expect(food).not.toBeNull();

    await expect(
      prisma.supply.delete({
        where: { id: food!.id },
      })
    ).rejects.toThrow();
  });

  it('enforces unique ledger constraint: duplicate (sourceReference, movementType) rejected', async () => {
    const food = await prisma.supply.findFirst({ where: { name: 'Food Packs' } });
    expect(food).not.toBeNull();

    // First insertion succeeds
    const uniqueRef = `test:ledger:duplicate-check:${Date.now()}`;
    await prisma.inventoryMovement.create({
      data: {
        supplyId: food!.id,
        signedQuantityChange: new Decimal(5.0),
        movementType: MovementType.ADJUSTMENT,
        sourceReference: uniqueRef,
      },
    });

    // Duplicate insertion with same sourceReference and movementType must fail
    await expect(
      prisma.inventoryMovement.create({
        data: {
          supplyId: food!.id,
          signedQuantityChange: new Decimal(5.0),
          movementType: MovementType.ADJUSTMENT,
          sourceReference: uniqueRef,
        },
      })
    ).rejects.toThrow();
  });
});
