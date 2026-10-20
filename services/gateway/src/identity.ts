// REST client for the identity service (public profile info only)
const baseUrl = process.env.IDENTITY_URL ?? 'http://localhost:5001';

export interface PublicUser {
  login: string;
  name: string;
  avatarUrl: string;
  createdAt: string;
}

export async function getPublicUser(login: string): Promise<PublicUser | null> {
  const response = await fetch(`${baseUrl}/users/${encodeURIComponent(login)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Identity service error: ${response.status}`);
  return (await response.json()) as PublicUser;
}
