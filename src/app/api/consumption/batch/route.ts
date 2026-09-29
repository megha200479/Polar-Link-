import { NextRequest, NextResponse } from 'next/server';
import { recordConsumption, RecordConsumptionInput } from '@/lib/services/consumptionService';
import { validateMutationAuth } from '@/lib/auth';
import { z } from 'zod';

const batchItemSchema = z.object({
  operationId: z.string().uuid(),
  supplyId: z.string().min(1),
  quantity: z.number().positive(),
  occurredAt: z.string(),
});

const batchSchema = z.object({
  operations: z.array(batchItemSchema).max(100, 'Batch size limit is 100'),
});

export async function POST(request: NextRequest) {
  const auth = validateMutationAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = batchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid batch payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { operations } = parsed.data;
    const results = [];

    // Process each operation sequentially to maintain deterministic order
    for (const op of operations) {
      try {
        const outcome = await recordConsumption(op as RecordConsumptionInput);
        results.push({
          operationId: op.operationId,
          ...outcome,
        });
      } catch (err: unknown) {
        results.push({
          operationId: op.operationId,
          status: 'ERROR',
          error: err instanceof Error ? err.message : 'Unknown execution error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      processedCount: results.length,
      results,
    });
  } catch (error) {
    console.error('Batch sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
