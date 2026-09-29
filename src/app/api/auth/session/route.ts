import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, validateMutationAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const auth = validateMutationAuth(request);
  return NextResponse.json({
    authenticated: auth.authorized,
  });
}

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Logged out successfully.' });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
