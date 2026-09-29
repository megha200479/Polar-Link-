import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateMutationAuth } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  stationIdentifier: z.string().default('MAITRI'),
  name: z.string().trim().min(1, 'Name is required'),
  role: z.string().trim().min(1, 'Role is required'),
});

export async function GET() {
  try {
    const [personnel, movements] = await Promise.all([
      prisma.personnel.findMany({
        orderBy: { name: 'asc' },
        include: { expedition: true },
      }),
      prisma.personnelMovement.findMany({
        orderBy: { occurredAt: 'desc' },
        take: 25,
        include: { personnel: true },
      }),
    ]);

    return NextResponse.json({
      personnel: personnel.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        status: p.status,
        expeditionId: p.expeditionId,
        expeditionName: p.expedition ? p.expedition.name : null,
      })),
      movements: movements.map((m) => ({
        id: m.id,
        personnelId: m.personnelId,
        personnelName: m.personnel.name,
        fromStatus: m.fromStatus,
        toStatus: m.toStatus,
        note: m.note,
        occurredAt: m.occurredAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Failed to list personnel:', error);
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

    const { stationIdentifier, name, role } = parsed.data;
    const station = await prisma.station.findUnique({ where: { identifier: stationIdentifier } });
    if (!station) {
      return NextResponse.json({ error: `Station "${stationIdentifier}" not found.` }, { status: 404 });
    }

    const person = await prisma.personnel.create({
      data: { stationId: station.id, name, role },
    });

    return NextResponse.json({ success: true, personnelId: person.id });
  } catch (error) {
    console.error('Failed to add personnel:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
