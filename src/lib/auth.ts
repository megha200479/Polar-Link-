import { NextRequest } from 'next/server';
import crypto from 'crypto';

const COOKIE_NAME = 'polarlink_demo_session';

export function getExpectedToken(): string {
  const secret = process.env.DEMO_SESSION_SECRET || 'polarlink-demo-session-secret-key-32-chars-minimum';
  return crypto.createHash('sha256').update(`polarlink-access:${secret}`).digest('hex');
}

export function validateMutationAuth(request: NextRequest): { authorized: boolean; reason?: string } {
  // In development and test environments, allow requests if DEMO_AUTH_DISABLED is explicitly true
  if (process.env.NODE_ENV === 'test' && process.env.DEMO_AUTH_ENFORCE !== 'true') {
    return { authorized: true };
  }

  const expected = getExpectedToken();
  const headerToken = request.headers.get('x-demo-access-token');
  const cookieToken = request.cookies.get(COOKIE_NAME)?.value;

  if (headerToken === expected || cookieToken === expected) {
    return { authorized: true };
  }

  return {
    authorized: false,
    reason: 'Authentication required. Please authenticate with the demo access key to perform write mutations.',
  };
}

export { COOKIE_NAME };
