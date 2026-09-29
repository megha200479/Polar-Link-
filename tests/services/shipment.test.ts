import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { seedDatabase } from '@/lib/seed';
import {
  createShipment,
  dispatchShipment,
  receiveShipment,
} from '@/lib/services/shipmentService';
import { ShipmentStatus } from '@prisma/client';
import crypto from 'crypto';

describe('Milestone 2: Shipment Service & Concurrency Tests', () => {
  const seedAnchor = new Date('2026-10-01T00:00:00.000Z');

  beforeEach(async () => {
    await seedDatabase(prisma, seedAnchor);
  });

  it('progresses correctly through REQUESTED -> DISPATCHED -> RECEIVED', async () => {
    const station = await prisma.station.findUnique({ where: { identifier: 'MAITRI' } });
    const battery = await prisma.supply.findFirst({ where: { name: 'Battery Packs' } });
    expect(battery).not.toBeNull();
    const initialBatteryStock = Number(battery!.onHandQuantity);

    const idempotencyKey = crypto.randomUUID();
    const createRes = await createShipment({
      stationId: station!.id,
      idempotencyKey,
      items: [{ supplyId: battery!.id, quantity: 20 }],
    });
    expect(createRes.status).toBe('ACCEPTED');
    const shipmentId = (createRes as { shipmentId: string }).shipmentId;

    // Verify REQUESTED status
    let shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
    expect(shipment?.status).toBe(ShipmentStatus.REQUESTED);

    // Cannot receive directly from REQUESTED
    const earlyReceive = await receiveShipment(shipmentId);
    expect(earlyReceive.status).toBe('INVALID_TRANSITION');

    // Dispatch
    const dispatchRes = await dispatchShipment(shipmentId, new Date('2026-10-10T00:00:00Z'));
    expect(dispatchRes.status).toBe('ACCEPTED');

    shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
    expect(shipment?.status).toBe(ShipmentStatus.DISPATCHED);

    // Receive
    const receiveRes = await receiveShipment(shipmentId);
    expect(receiveRes.status).toBe('ACCEPTED');

    shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
    expect(shipment?.status).toBe(ShipmentStatus.RECEIVED);

    // Verify inventory credited
    const freshBattery = await prisma.supply.findUnique({ where: { id: battery!.id } });
    expect(Number(freshBattery?.onHandQuantity)).toBe(initialBatteryStock + 20);

    // Verify ledger movement created
    const movement = await prisma.inventoryMovement.findUnique({
      where: {
        sourceReference_movementType: {
          sourceReference: `shipment:${shipmentId}:${battery!.id}`,
          movementType: 'SHIPMENT_RECEIPT',
        },
      },
    });
    expect(movement).not.toBeNull();
    expect(Number(movement?.signedQuantityChange)).toBe(20);
  });

  it('guarantees sequential duplicate receive increases inventory exactly once', async () => {
    // Grab the existing dispatched shipment from seed (contains 30 Battery Packs)
    const dispatched = await prisma.shipment.findFirst({
      where: { status: ShipmentStatus.DISPATCHED },
      include: { items: true },
    });
    expect(dispatched).not.toBeNull();

    const battery = await prisma.supply.findUnique({ where: { id: dispatched!.items[0].supplyId } });
    const initialStock = Number(battery?.onHandQuantity);

    // 1st Receive
    const res1 = await receiveShipment(dispatched!.id);
    expect(res1.status).toBe('ACCEPTED');

    const stockAfterFirst = await prisma.supply.findUnique({ where: { id: battery!.id } });
    expect(Number(stockAfterFirst?.onHandQuantity)).toBe(initialStock + 30);

    // 2nd Sequential Receive (Duplicate retry)
    const res2 = await receiveShipment(dispatched!.id);
    expect(res2.status).toBe('ALREADY_RECEIVED');

    // Stock must NOT have increased a second time
    const stockAfterSecond = await prisma.supply.findUnique({ where: { id: battery!.id } });
    expect(Number(stockAfterSecond?.onHandQuantity)).toBe(initialStock + 30);

    // Unique ledger record count must be exactly 1
    const movements = await prisma.inventoryMovement.findMany({
      where: { sourceReference: `shipment:${dispatched!.id}:${battery!.id}` },
    });
    expect(movements).toHaveLength(1);
  });

  it('guarantees concurrent parallel receive calls increase inventory exactly once', async () => {
    const dispatched = await prisma.shipment.findFirst({
      where: { status: ShipmentStatus.DISPATCHED },
      include: { items: true },
    });
    expect(dispatched).not.toBeNull();

    const battery = await prisma.supply.findUnique({ where: { id: dispatched!.items[0].supplyId } });
    const initialStock = Number(battery?.onHandQuantity);

    // Trigger 5 concurrent receive calls simultaneously
    const promises = Array.from({ length: 5 }).map(() => receiveShipment(dispatched!.id));
    const outcomes = await Promise.all(promises);

    const accepted = outcomes.filter((o) => o.status === 'ACCEPTED');
    const alreadyReceived = outcomes.filter((o) => o.status === 'ALREADY_RECEIVED');

    // Exactly 1 winner transaction
    expect(accepted).toHaveLength(1);
    expect(alreadyReceived).toHaveLength(4);

    // Stock must only increase by 30 once
    const finalStock = await prisma.supply.findUnique({ where: { id: battery!.id } });
    expect(Number(finalStock?.onHandQuantity)).toBe(initialStock + 30);
  });
});
