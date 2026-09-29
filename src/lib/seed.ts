import { PrismaClient, ShipmentStatus, MovementType } from '@prisma/client';
import { Decimal } from 'decimal.js';

export async function seedDatabase(prisma: PrismaClient, baseTime = new Date('2026-10-01T00:00:00.000Z')) {
  console.log(`[Seed] Seeding database with anchor date: ${baseTime.toISOString()}...`);

  await prisma.$transaction(async (tx) => {
    // Clear existing data inside this transaction
    await tx.inventoryMovement.deleteMany();
    await tx.consumptionEvent.deleteMany();
    await tx.shipmentItem.deleteMany();
    await tx.shipment.deleteMany();
    await tx.expedition.deleteMany();
    await tx.supply.deleteMany();
    await tx.station.deleteMany();

    // 1. Station
    const station = await tx.station.create({
      data: {
        identifier: 'MAITRI',
        name: 'Maitri Antarctic Research Station',
        createdAt: new Date(baseTime.getTime() - 90 * 86400000),
      },
    });

    // 2. Supplies
    const foodSupply = await tx.supply.create({
      data: {
        stationId: station.id,
        name: 'Food Packs',
        unit: 'packs',
        onHandQuantity: new Decimal(120.0),
        configuredDailyConsumption: new Decimal(10.0),
        perPersonDailyExpeditionConsumption: new Decimal(1.0),
        isActive: true,
        createdAt: new Date(baseTime.getTime() - 30 * 86400000),
      },
    });

    const waterSupply = await tx.supply.create({
      data: {
        stationId: station.id,
        name: 'Drinking Water',
        unit: 'liters',
        onHandQuantity: new Decimal(4500.0),
        configuredDailyConsumption: new Decimal(150.0),
        perPersonDailyExpeditionConsumption: new Decimal(3.0),
        isActive: true,
        createdAt: new Date(baseTime.getTime() - 30 * 86400000),
      },
    });

    const dieselSupply = await tx.supply.create({
      data: {
        stationId: station.id,
        name: 'Diesel Fuel',
        unit: 'liters',
        onHandQuantity: new Decimal(12500.0),
        configuredDailyConsumption: new Decimal(200.0),
        perPersonDailyExpeditionConsumption: null,
        isActive: true,
        createdAt: new Date(baseTime.getTime() - 30 * 86400000),
      },
    });

    const medicalSupply = await tx.supply.create({
      data: {
        stationId: station.id,
        name: 'Medical Kits',
        unit: 'kits',
        onHandQuantity: new Decimal(40.0),
        configuredDailyConsumption: new Decimal(0.5),
        perPersonDailyExpeditionConsumption: new Decimal(0.05),
        isActive: true,
        createdAt: new Date(baseTime.getTime() - 30 * 86400000),
      },
    });

    const batterySupply = await tx.supply.create({
      data: {
        stationId: station.id,
        name: 'Battery Packs',
        unit: 'units',
        onHandQuantity: new Decimal(60.0),
        configuredDailyConsumption: new Decimal(2.0),
        perPersonDailyExpeditionConsumption: null,
        isActive: true,
        createdAt: new Date(baseTime.getTime() - 30 * 86400000),
      },
    });

    // 3. Opening Stock Ledger Movements
    await tx.inventoryMovement.createMany({
      data: [
        {
          supplyId: foodSupply.id,
          signedQuantityChange: new Decimal(120.0),
          movementType: MovementType.OPENING_STOCK,
          sourceReference: `seed:opening:${foodSupply.id}`,
          occurredAt: new Date(baseTime.getTime() - 30 * 86400000),
        },
        {
          supplyId: waterSupply.id,
          signedQuantityChange: new Decimal(3000.0),
          movementType: MovementType.OPENING_STOCK,
          sourceReference: `seed:opening:${waterSupply.id}`,
          occurredAt: new Date(baseTime.getTime() - 30 * 86400000),
        },
        {
          supplyId: dieselSupply.id,
          signedQuantityChange: new Decimal(10000.0),
          movementType: MovementType.OPENING_STOCK,
          sourceReference: `seed:opening:${dieselSupply.id}`,
          occurredAt: new Date(baseTime.getTime() - 30 * 86400000),
        },
        {
          supplyId: medicalSupply.id,
          signedQuantityChange: new Decimal(40.0),
          movementType: MovementType.OPENING_STOCK,
          sourceReference: `seed:opening:${medicalSupply.id}`,
          occurredAt: new Date(baseTime.getTime() - 30 * 86400000),
        },
        {
          supplyId: batterySupply.id,
          signedQuantityChange: new Decimal(60.0),
          movementType: MovementType.OPENING_STOCK,
          sourceReference: `seed:opening:${batterySupply.id}`,
          occurredAt: new Date(baseTime.getTime() - 30 * 86400000),
        },
      ],
    });

    // 4. Completed Historical Shipment (Water + Diesel)
    const completedShipment = await tx.shipment.create({
      data: {
        stationId: station.id,
        status: ShipmentStatus.RECEIVED,
        idempotencyKey: 'seed-shipment-received-001',
        requestedAt: new Date(baseTime.getTime() - 20 * 86400000),
        dispatchedAt: new Date(baseTime.getTime() - 10 * 86400000),
        receivedAt: new Date(baseTime.getTime() - 2 * 86400000),
        eta: new Date(baseTime.getTime() - 2 * 86400000),
        notes: 'Spring Resupply Vessel IV: Water and Fuel delivery completed.',
        items: {
          create: [
            { supplyId: waterSupply.id, quantity: new Decimal(1500.0) },
            { supplyId: dieselSupply.id, quantity: new Decimal(2500.0) },
          ],
        },
      },
    });

    // Completed Shipment Ledger Entries
    await tx.inventoryMovement.createMany({
      data: [
        {
          supplyId: waterSupply.id,
          signedQuantityChange: new Decimal(1500.0),
          movementType: MovementType.SHIPMENT_RECEIPT,
          sourceReference: `shipment:${completedShipment.id}:${waterSupply.id}`,
          occurredAt: new Date(baseTime.getTime() - 2 * 86400000),
        },
        {
          supplyId: dieselSupply.id,
          signedQuantityChange: new Decimal(2500.0),
          movementType: MovementType.SHIPMENT_RECEIPT,
          sourceReference: `shipment:${completedShipment.id}:${dieselSupply.id}`,
          occurredAt: new Date(baseTime.getTime() - 2 * 86400000),
        },
      ],
    });

    // 5. Open / In-Transit Shipment (Battery Packs)
    await tx.shipment.create({
      data: {
        stationId: station.id,
        status: ShipmentStatus.DISPATCHED,
        idempotencyKey: 'seed-shipment-dispatched-002',
        requestedAt: new Date(baseTime.getTime() - 6 * 86400000),
        dispatchedAt: new Date(baseTime.getTime() - 2 * 86400000),
        eta: new Date(baseTime.getTime() + 8 * 86400000),
        notes: 'Air Cargo Flight POL-402: Emergency Lithium Battery cells.',
        items: {
          create: [{ supplyId: batterySupply.id, quantity: new Decimal(30.0) }],
        },
      },
    });

    // 6. Active Expedition Fixture
    await tx.expedition.create({
      data: {
        stationId: station.id,
        name: 'Queen Maud Land Geological Traverse',
        additionalPeople: 5,
        startDate: new Date(baseTime.getTime() + 2 * 86400000),
        endDate: new Date(baseTime.getTime() + 12 * 86400000),
        createdAt: new Date(baseTime.getTime() - 10 * 86400000),
      },
    });
  });

  console.log(`[Seed] Seed finished successfully.`);
}
