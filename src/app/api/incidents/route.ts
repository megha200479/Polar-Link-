import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateMutationAuth } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  stationIdentifier: z.string().default('MAITRI'),
  title: z.string().trim().min(1, 'Title is required').max(140),
  description: z.string().trim().max(1000).optional(),
  location: z.string().trim().max(140).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
});

export async function GET() {
  try {
    const incidents = await prisma.incident.findMany({
      orderBy: { reportedAt: 'desc' },
    });

    return NextResponse.json({
      incidents: incidents.map((i) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        location: i.location,
        severity: i.severity,
        status: i.status,
        reportedAt: i.reportedAt.toISOString(),
        resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
      })),
    });
  } catch (error) {
    console.error('Failed to list incidents:', error);
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

    const { stationIdentifier, title, description, location, severity } = parsed.data;
    const station = await prisma.station.findUnique({ where: { identifier: stationIdentifier } });
    if (!station) {
      return NextResponse.json({ error: `Station "${stationIdentifier}" not found.` }, { status: 404 });
    }

    const incident = await prisma.incident.create({
      data: {
        stationId: station.id,
        title,
        description: description ? description : null,
        location: location ? location : null,
        severity,
      },
    });

    return NextResponse.json({ success: true, incidentId: incident.id });
  } catch (error) {
    console.error('Failed to report incident:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
