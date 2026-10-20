import type { IncomingMessage } from 'node:http';
import { jwtVerify } from 'jose';

// The identity service signs session tokens with the same secret
const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-only-secret-please-set-JWT_SECRET-in-env',
);
const COOKIE_NAME = 'bytebox_session';

export interface SessionUser {
  id: string;
  login: string;
  name: string;
  avatarUrl: string;
}

// The signed-in user from the session cookie, or null
export async function getUser(req: IncomingMessage): Promise<SessionUser | null> {
  const token = readCookie(req.headers.cookie ?? '', COOKIE_NAME);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: 'bytebox-identity' });
    return {
      id: String(payload.sub),
      login: String(payload.login),
      name: String(payload.name),
      avatarUrl: String(payload.avatar ?? ''),
    };
  } catch {
    return null; // expired, tampered with or signed with another secret
  }
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}
