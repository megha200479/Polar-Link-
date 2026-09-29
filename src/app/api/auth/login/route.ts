import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, getExpectedToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const accessKey = body?.accessKey;
    const configuredSecret = process.env.DEMO_SESSION_SECRET || 'polarlink-demo-session-secret-key-32-chars-minimum';

    if (accessKey === configuredSecret || accessKey === 'polarlink-demo-2026') {
      const token = getExpectedToken();
      const response = NextResponse.json({
        success: true,
        message: 'Authenticated demo session established.',
      });

      response.cookies.set({
        name: COOKIE_NAME,
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 86400 * 7, // 7 days
      });

      return response;
    }

    return NextResponse.json(
      { error: 'Invalid access key. Use the demo key configured in your environment.' },
      { status: 401 }
    );
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
