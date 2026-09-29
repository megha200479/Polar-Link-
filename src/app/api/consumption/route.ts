import { NextRequest, NextResponse } from 'next/server';
import { recordConsumption } from '@/lib/services/consumptionService';
import { validateMutationAuth } from '@/lib/auth';
import { z } from 'zod';

const consumptionSchema = z.object({
  operationId: z.string().uuid('operationId must be a valid UUID'),
  supplyId: z.string().min(1, 'supplyId is required'),
  quantity: z.number().positive('quantity must be strictly positive'),
  occurredAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
});

export async function POST(request: NextRequest) {
  const auth = validateMutationAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = consumptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const outcome = await recordConsumption(parsed.data);

    switch (outcome.status) {
      case 'ACCEPTED':
        return NextResponse.json(
          {
            status: 'ACCEPTED',
            eventId: outcome.eventId,
            newOnHandQuantity: outcome.newOnHandQuantity,
            message: outcome.message,
          },
          { status: 200 }
        );

      case 'ALREADY_APPLIED':
        return NextResponse.json(
          {
            status: 'ALREADY_APPLIED',
            eventId: outcome.eventId,
            newOnHandQuantity: outcome.newOnHandQuantity,
            message: outcome.message,
          },
          { status: 200 }
        );

      case 'CONFLICT':
        return NextResponse.json(
          { status: 'CONFLICT', error: outcome.error },
          { status: 409 }
        );

      case 'INSUFFICIENT_STOCK':
        return NextResponse.json(
          {
            status: 'INSUFFICIENT_STOCK',
            error: outcome.error,
            available: outcome.available,
            requested: outcome.requested,
          },
          { status: 422 }
        );

      case 'INVALID_SUPPLY':
        return NextResponse.json(
          { status: 'INVALID_SUPPLY', error: outcome.error },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Unhandled consumption error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
