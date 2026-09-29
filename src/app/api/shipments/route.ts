import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createShipment } from '@/lib/services/shipmentService';
import { validateMutationAuth } from '@/lib/auth';
import { z } from 'zod';

const createShipmentSchema = z.object({
  stationIdentifier: z.string().default('MAITRI'),
  idempotencyKey: z.string().uuid(),
  eta: z.string().datetime({ offset: true }).or(z.string().datetime()).nullable().optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        supplyId: z.string().min(1),
        quantity: z.number().positive('Quantity must be strictly positive'),
      })
    )
    .min(1, 'Must include at least one item'),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');

    const shipments = await prisma.shipment.findMany({
      where: stationId ? { stationId } : {},
      include: {
        station: true,
        items: {
          include: {
            supply: true,
          },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });

    return NextResponse.json({
      shipments: shipments.map((s) => ({
        id: s.id,
        stationId: s.stationId,
        stationName: s.station.name,
        status: s.status,
        idempotencyKey: s.idempotencyKey,
        eta: s.eta ? s.eta.toISOString() : null,
        requestedAt: s.requestedAt.toISOString(),
        dispatchedAt: s.dispatchedAt ? s.dispatchedAt.toISOString() : null,
        receivedAt: s.receivedAt ? s.receivedAt.toISOString() : null,
        notes: s.notes,
        items: s.items.map((i) => ({
          id: i.id,
          supplyId: i.supplyId,
          supplyName: i.supply.name,
          unit: i.supply.unit,
          quantity: Number(i.quantity),
        })),
      })),
    });
  } catch (error) {
    console.error('Failed to list shipments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = validateMutationAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = createShipmentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid shipment payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { stationIdentifier, idempotencyKey, eta, notes, items } = parsed.data;

    const station = await prisma.station.findUnique({
      where: { identifier: stationIdentifier },
    });

    if (!station) {
      return NextResponse.json({ error: `Station "${stationIdentifier}" not found.` }, { status: 404 });
    }

    const outcome = await createShipment({
      stationId: station.id,
      idempotencyKey,
      eta,
      notes,
      items,
    });

    if (outcome.status === 'INVALID_INPUT') {
      return NextResponse.json({ error: outcome.error }, { status: 400 });
    }

    return NextResponse.json(outcome, { status: 200 });
  } catch (error) {
    console.error('Failed to create shipment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
