import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateMutationAuth } from '@/lib/auth';
import { z } from 'zod';

const moveSchema = z.object({
  toStatus: z.enum(['AT_STATION', 'IN_TRANSIT', 'ON_EXPEDITION']),
  expeditionId: z.string().nullable().optional(),
  note: z.string().trim().max(300).optional(),
});

export async function POST(
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
    const parsed = moveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { toStatus, expeditionId, note } = parsed.data;
    if (toStatus === 'ON_EXPEDITION' && !expeditionId) {
      return NextResponse.json({ error: 'Choose an expedition' }, { status: 400 });
    }
    const targetExpedition = toStatus === 'ON_EXPEDITION' ? (expeditionId as string) : null;

    const outcome = await prisma.$transaction(async (tx) => {
      const person = await tx.personnel.findUnique({ where: { id } });
      if (!person) return 'NOT_FOUND' as const;

      if (person.status === toStatus && person.expeditionId === targetExpedition) {
        return 'NO_CHANGE' as const;
      }

      if (targetExpedition) {
        const expedition = await tx.expedition.findUnique({ where: { id: targetExpedition } });
        if (!expedition) return 'BAD_EXPEDITION' as const;
      }

      await tx.personnel.update({
        where: { id },
        data: { status: toStatus, expeditionId: targetExpedition },
      });
      await tx.personnelMovement.create({
        data: {
          personnelId: id,
          fromStatus: person.status,
          toStatus,
          note: note ? note : null,
        },
      });
      return 'MOVED' as const;
    });

    if (outcome === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }
    if (outcome === 'BAD_EXPEDITION') {
      return NextResponse.json({ error: 'Expedition not found' }, { status: 400 });
    }
    if (outcome === 'NO_CHANGE') {
      return NextResponse.json({ error: 'No change: already in that status' }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to record movement:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
