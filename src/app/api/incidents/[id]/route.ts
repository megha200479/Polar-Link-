import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateMutationAuth } from '@/lib/auth';
import { z } from 'zod';

const patchSchema = z.object({
  status: z.enum(['OPEN', 'RESPONDING', 'RESOLVED']),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = validateMutationAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const existing = await prisma.incident.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    await prisma.incident.update({
      where: { id },
      data: {
        status: parsed.data.status,
        resolvedAt: parsed.data.status === 'RESOLVED' ? new Date() : null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update incident:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
