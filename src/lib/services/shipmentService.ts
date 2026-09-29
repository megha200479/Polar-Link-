import { prisma } from '@/lib/prisma';
import { MovementType, ShipmentStatus } from '@prisma/client';
import { Decimal } from 'decimal.js';

export interface CreateShipmentInput {
  stationId: string;
  idempotencyKey: string;
  eta?: Date | string | null;
  notes?: string | null;
  items: Array<{
    supplyId: string;
    quantity: number | string | Decimal;
  }>;
}

export type ShipmentOutcome =
  | { status: 'ACCEPTED'; shipmentId: string; message: string }
  | { status: 'ALREADY_PROCESSED'; shipmentId: string; message: string }
  | { status: 'ALREADY_RECEIVED'; shipmentId: string; message: string }
  | { status: 'INVALID_TRANSITION'; error: string }
  | { status: 'NOT_FOUND'; error: string }
  | { status: 'INVALID_INPUT'; error: string };

export async function createShipment(input: CreateShipmentInput): Promise<ShipmentOutcome> {
  const { stationId, idempotencyKey, eta, notes, items } = input;

  if (!items || items.length === 0) {
    return { status: 'INVALID_INPUT', error: 'Shipment must contain at least one item.' };
  }

  // Validate items have positive quantities
  for (const item of items) {
    const qty = new Decimal(item.quantity);
    if (qty.lessThanOrEqualTo(0)) {
      return { status: 'INVALID_INPUT', error: 'Item quantities must be strictly positive.' };
    }
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Check idempotency
    const existing = await tx.shipment.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      return {
        status: 'ALREADY_PROCESSED',
        shipmentId: existing.id,
        message: 'Shipment request already created with this idempotency key.',
      };
    }

    // 2. Verify all supplies exist and are active
    for (const item of items) {
      const supply = await tx.supply.findUnique({ where: { id: item.supplyId } });
      if (!supply || !supply.isActive) {
        return {
          status: 'INVALID_INPUT',
          error: `Supply with id ${item.supplyId} is invalid or inactive.`,
        };
      }
    }

    // 3. Create shipment and items atomically
    const shipment = await tx.shipment.create({
      data: {
        stationId,
        idempotencyKey,
        eta: eta ? new Date(eta) : null,
        notes: notes || null,
        status: ShipmentStatus.REQUESTED,
        items: {
          create: items.map((i) => ({
            supplyId: i.supplyId,
            quantity: new Decimal(i.quantity),
          })),
        },
      },
    });

    return {
      status: 'ACCEPTED',
      shipmentId: shipment.id,
      message: 'Resupply shipment requested successfully.',
    };
  });
}

export async function dispatchShipment(
  shipmentId: string,
  eta?: Date | string | null
): Promise<ShipmentOutcome> {
  return await prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment) {
      return { status: 'NOT_FOUND', error: `Shipment ${shipmentId} not found.` };
    }

    if (shipment.status === ShipmentStatus.DISPATCHED) {
      return {
        status: 'ALREADY_PROCESSED',
        shipmentId,
        message: 'Shipment is already in DISPATCHED status.',
      };
    }

    if (shipment.status === ShipmentStatus.RECEIVED) {
      return {
        status: 'INVALID_TRANSITION',
        error: 'Shipment is already RECEIVED and cannot be transitioned back to DISPATCHED.',
      };
    }

    if (shipment.status !== ShipmentStatus.REQUESTED) {
      return {
        status: 'INVALID_TRANSITION',
        error: `Cannot dispatch shipment currently in status "${shipment.status}".`,
      };
    }

    const updatedEta = eta ? new Date(eta) : shipment.eta;

    await tx.shipment.update({
      where: { id: shipmentId },
      data: {
        status: ShipmentStatus.DISPATCHED,
        dispatchedAt: new Date(),
        eta: updatedEta,
      },
    });

    return {
      status: 'ACCEPTED',
      shipmentId,
      message: 'Shipment dispatched successfully.',
    };
  });
}

export async function receiveShipment(shipmentId: string): Promise<ShipmentOutcome> {
  return await prisma.$transaction(async (tx) => {
    // 1. Conditional atomic transition from DISPATCHED -> RECEIVED with row locking
    // Only the transaction that changes status from DISPATCHED to RECEIVED wins and updates inventory!
    const updatedCount = await tx.$executeRaw`
      UPDATE "Shipment"
      SET "status" = 'RECEIVED'::"ShipmentStatus", "receivedAt" = NOW(), "updatedAt" = NOW()
      WHERE "id" = ${shipmentId} AND "status" = 'DISPATCHED'::"ShipmentStatus"
    `;

    if (updatedCount === 0) {
      // Transition failed: inspect why
      const existing = await tx.shipment.findUnique({
        where: { id: shipmentId },
      });

      if (!existing) {
        return { status: 'NOT_FOUND', error: `Shipment ${shipmentId} not found.` };
      }

      if (existing.status === ShipmentStatus.RECEIVED) {
        return {
          status: 'ALREADY_RECEIVED',
          shipmentId,
          message: 'Shipment has already been received and inventory credited.',
        };
      }

      if (existing.status === ShipmentStatus.REQUESTED) {
        return {
          status: 'INVALID_TRANSITION',
          error: 'Cannot receive shipment directly from REQUESTED state. It must be DISPATCHED first.',
        };
      }

      return {
        status: 'INVALID_TRANSITION',
        error: `Cannot receive shipment in status "${existing.status}".`,
      };
    }

    // 2. Winning transaction: Credit inventory and record movements for every item
    const items = await tx.shipmentItem.findMany({
      where: { shipmentId },
    });

    if (items.length === 0) {
      throw new Error(`Shipment ${shipmentId} contains no items to receive.`);
    }

    for (const item of items) {
      const qty = new Decimal(item.quantity);

      // Increment supply on-hand stock
      await tx.supply.update({
        where: { id: item.supplyId },
        data: {
          onHandQuantity: {
            increment: qty,
          },
        },
      });

      // Insert audit movement with unique sourceReference
      await tx.inventoryMovement.create({
        data: {
          supplyId: item.supplyId,
          signedQuantityChange: qty,
          movementType: MovementType.SHIPMENT_RECEIPT,
          sourceReference: `shipment:${shipmentId}:${item.supplyId}`,
          occurredAt: new Date(),
        },
      });
    }

    return {
      status: 'ACCEPTED',
      shipmentId,
      message: `Shipment ${shipmentId} received successfully. ${items.length} supply items credited to inventory.`,
    };
  });
}
