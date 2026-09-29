import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateMutationAuth } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  stationIdentifier: z.string().default('MAITRI'),
  name: z.string().trim().min(1, 'Name is required'),
  additionalPeople: z.number().int().min(1, 'At least one additional person is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
});

export async function GET() {
  try {
    const expeditions = await prisma.expedition.findMany({
      orderBy: { startDate: 'asc' },
      include: { _count: { select: { personnel: true } } },
    });

    return NextResponse.json({
      expeditions: expeditions.map((e) => ({
        id: e.id,
        name: e.name,
        additionalPeople: e.additionalPeople,
        startDate: e.startDate.toISOString(),
        endDate: e.endDate.toISOString(),
        assignedPersonnel: e._count.personnel,
      })),
    });
  } catch (error) {
    console.error('Failed to list expeditions:', error);
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
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { stationIdentifier, name, additionalPeople, startDate, endDate } = parsed.data;
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }
    if (end < start) {
      return NextResponse.json({ error: 'End date must not be before the start date' }, { status: 400 });
    }

    const station = await prisma.station.findUnique({ where: { identifier: stationIdentifier } });
    if (!station) {
      return NextResponse.json({ error: `Station "${stationIdentifier}" not found.` }, { status: 404 });
    }

    const expedition = await prisma.expedition.create({
      data: { stationId: station.id, name, additionalPeople, startDate: start, endDate: end },
    });

    return NextResponse.json({ success: true, expeditionId: expedition.id });
  } catch (error) {
    console.error('Failed to create expedition:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
