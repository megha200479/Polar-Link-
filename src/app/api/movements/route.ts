import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const supplyId = searchParams.get('supplyId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const cursor = searchParams.get('cursor');

    const movements = await prisma.inventoryMovement.findMany({
      where: supplyId ? { supplyId } : {},
      include: {
        supply: true,
      },
      orderBy: { occurredAt: 'desc' },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    return NextResponse.json({
      movements: movements.map((m) => ({
        id: m.id,
        supplyId: m.supplyId,
        supplyName: m.supply.name,
        unit: m.supply.unit,
        signedQuantityChange: Number(m.signedQuantityChange),
        movementType: m.movementType,
        sourceReference: m.sourceReference,
        occurredAt: m.occurredAt.toISOString(),
      })),
      nextCursor: movements.length === limit ? movements[movements.length - 1].id : null,
    });
  } catch (error) {
    console.error('Failed to list movements:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
