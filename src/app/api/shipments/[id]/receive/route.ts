import { NextRequest, NextResponse } from 'next/server';
import { receiveShipment } from '@/lib/services/shipmentService';
import { validateMutationAuth } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = validateMutationAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const outcome = await receiveShipment(id);

    switch (outcome.status) {
      case 'ACCEPTED':
        return NextResponse.json(outcome, { status: 200 });
      case 'ALREADY_RECEIVED':
        return NextResponse.json(outcome, { status: 200 });
      case 'NOT_FOUND':
        return NextResponse.json({ error: outcome.error }, { status: 404 });
      case 'INVALID_TRANSITION':
        return NextResponse.json({ error: outcome.error }, { status: 400 });
      default:
        return NextResponse.json({ error: 'Operation failed' }, { status: 400 });
    }
  } catch (error) {
    console.error('Failed to receive shipment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
