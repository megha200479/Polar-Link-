import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateMutationAuth } from '@/lib/auth';
import { MovementType } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { z } from 'zod';

const createSupplySchema = z.object({
  stationIdentifier: z.string().default('MAITRI'),
  name: z.string().min(1, 'Name is required'),
  unit: z.string().min(1, 'Unit is required'),
  openingStock: z.number().min(0, 'Opening stock cannot be negative'),
  configuredDailyConsumption: z.number().min(0, 'Daily consumption cannot be negative'),
  perPersonDailyExpeditionConsumption: z.number().min(0).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');

    const supplies = await prisma.supply.findMany({
      where: {
        isActive: true,
        ...(stationId ? { stationId } : {}),
      },
      include: {
        station: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      supplies: supplies.map((s) => ({
        id: s.id,
        stationId: s.stationId,
        stationName: s.station.name,
        name: s.name,
        unit: s.unit,
        onHandQuantity: Number(s.onHandQuantity),
        configuredDailyConsumption: Number(s.configuredDailyConsumption),
        perPersonDailyExpeditionConsumption: s.perPersonDailyExpeditionConsumption
          ? Number(s.perPersonDailyExpeditionConsumption)
          : null,
        isActive: s.isActive,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Failed to fetch supplies:', error);
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
    const parsed = createSupplySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const {
      stationIdentifier,
      name,
      unit,
      openingStock,
      configuredDailyConsumption,
      perPersonDailyExpeditionConsumption,
    } = parsed.data;

    const station = await prisma.station.findUnique({
      where: { identifier: stationIdentifier },
    });

    if (!station) {
      return NextResponse.json(
        { error: `Station "${stationIdentifier}" not found.` },
        { status: 404 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.supply.findUnique({
        where: { stationId_name: { stationId: station.id, name } },
      });

      if (existing) {
        throw new Error(`Supply "${name}" already exists at station ${station.name}.`);
      }

      const supply = await tx.supply.create({
        data: {
          stationId: station.id,
          name,
          unit,
          onHandQuantity: new Decimal(openingStock),
          configuredDailyConsumption: new Decimal(configuredDailyConsumption),
          perPersonDailyExpeditionConsumption:
            perPersonDailyExpeditionConsumption !== null && perPersonDailyExpeditionConsumption !== undefined
              ? new Decimal(perPersonDailyExpeditionConsumption)
              : null,
          isActive: true,
        },
      });

      if (openingStock > 0) {
        await tx.inventoryMovement.create({
          data: {
            supplyId: supply.id,
            signedQuantityChange: new Decimal(openingStock),
            movementType: MovementType.OPENING_STOCK,
            sourceReference: `manual:opening:${supply.id}`,
            occurredAt: new Date(),
          },
        });
      }

      return supply;
    });

    return NextResponse.json({
      success: true,
      supply: {
        id: result.id,
        name: result.name,
        unit: result.unit,
        onHandQuantity: Number(result.onHandQuantity),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create supply';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
