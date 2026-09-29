import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  calculateShortageProjection,
  ShortageSupplyInput,
  ShortageExpeditionInput,
  ShortageShipmentInput,
} from '@/lib/services/shortageEngine';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const horizonDays = parseInt(searchParams.get('horizonDays') || '16', 10);
    const safetyBufferDays = parseInt(searchParams.get('safetyBufferDays') || '7', 10);
    const stationId = searchParams.get('stationId');

    const station = await prisma.station.findFirst({
      where: stationId ? { id: stationId } : { identifier: 'MAITRI' },
    });

    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const [supplies, expeditions, shipments] = await Promise.all([
      prisma.supply.findMany({
        where: { stationId: station.id, isActive: true },
        orderBy: { name: 'asc' },
      }),
      prisma.expedition.findMany({
        where: { stationId: station.id },
      }),
      prisma.shipment.findMany({
        where: {
          stationId: station.id,
          status: { in: ['REQUESTED', 'DISPATCHED'] },
        },
        include: { items: true },
      }),
    ]);

    const shortageInputs: ShortageSupplyInput[] = supplies.map((s) => ({
      id: s.id,
      name: s.name,
      unit: s.unit,
      onHandQuantity: Number(s.onHandQuantity),
      configuredDailyConsumption: Number(s.configuredDailyConsumption),
      perPersonDailyExpeditionConsumption: s.perPersonDailyExpeditionConsumption
        ? Number(s.perPersonDailyExpeditionConsumption)
        : null,
    }));

    const expeditionInputs: ShortageExpeditionInput[] = expeditions.map((e) => ({
      id: e.id,
      name: e.name,
      additionalPeople: e.additionalPeople,
      startDate: e.startDate,
      endDate: e.endDate,
    }));

    const shipmentInputs: ShortageShipmentInput[] = shipments.map((s) => ({
      id: s.id,
      status: s.status as 'REQUESTED' | 'DISPATCHED' | 'RECEIVED',
      eta: s.eta,
      items: s.items.map((i) => ({
        supplyId: i.supplyId,
        quantity: Number(i.quantity),
      })),
    }));

    const projections = shortageInputs.map((sup) =>
      calculateShortageProjection(sup, expeditionInputs, shipmentInputs, {
        now: new Date(),
        targetHorizonDays: horizonDays,
        safetyBufferDays,
      })
    );

    const criticalCount = projections.filter((p) => p.coverageStatus === 'CRITICAL').length;
    const lowCount = projections.filter((p) => p.coverageStatus === 'LOW').length;
    const earlierDeliveryCount = projections.filter((p) => p.earlierDeliveryRequired).length;

    return NextResponse.json({
      station: {
        id: station.id,
        identifier: station.identifier,
        name: station.name,
      },
      horizonDays,
      safetyBufferDays,
      summary: {
        totalSupplies: supplies.length,
        criticalCount,
        lowCount,
        earlierDeliveryCount,
      },
      projections,
    });
  } catch (error) {
    console.error('Failed to calculate shortages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
