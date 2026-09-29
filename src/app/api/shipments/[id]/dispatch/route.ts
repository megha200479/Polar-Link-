import { NextRequest, NextResponse } from 'next/server';
import { dispatchShipment } from '@/lib/services/shipmentService';
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
    let eta: string | null = null;

    try {
      const body = await request.json();
      eta = body?.eta || null;
    } catch {
      // Body is optional
    }

    const outcome = await dispatchShipment(id, eta);

    switch (outcome.status) {
      case 'ACCEPTED':
      case 'ALREADY_PROCESSED':
        return NextResponse.json(outcome, { status: 200 });
      case 'NOT_FOUND':
        return NextResponse.json({ error: outcome.error }, { status: 404 });
      case 'INVALID_TRANSITION':
        return NextResponse.json({ error: outcome.error }, { status: 400 });
      default:
        return NextResponse.json({ error: 'Operation failed' }, { status: 400 });
    }
  } catch (error) {
    console.error('Failed to dispatch shipment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
