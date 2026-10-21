import type { IncomingMessage } from 'node:http';
import { jwtVerify } from 'jose';

// Same session cookie and secret as the gateway (signed by the identity service)
const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-only-secret-please-set-JWT_SECRET-in-env',
);
const COOKIE_NAME = 'bytebox_session';

// The signed-in user's id from the session cookie, or null
export async function getUserId(req: IncomingMessage): Promise<string | null> {
  const token = readCookie(req.headers.cookie ?? '', COOKIE_NAME);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: 'bytebox-identity' });
    return payload.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}
