'use client';

import { useEffect, useState } from 'react';
import { request } from './graphql';

// Login happens on the identity service (it redirects to GitHub and back)
const IDENTITY_URL = process.env.NEXT_PUBLIC_IDENTITY_URL ?? 'http://localhost:5001';

export interface User {
  id: string;
  login: string;
  name: string;
  avatarUrl: string;
}

export function githubLoginUrl(returnTo: string): string {
  return `${IDENTITY_URL}/auth/github/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function logoutUrl(returnTo: string): string {
  return `${IDENTITY_URL}/auth/logout?returnTo=${encodeURIComponent(returnTo)}`;
}

// Our own login page, coming back to the current page afterwards
export function loginPageUrl(): string {
  const here = window.location.pathname + window.location.search;
  return `/login?returnTo=${encodeURIComponent(here)}`;
}

export async function fetchMe(): Promise<User | null> {
  const data = await request<{ me: User | null }>('{ me { id login name avatarUrl } }');
  return data.me;
}

// The signed-in user; loading is true until we know
export function useMe() {
  const [state, setState] = useState<{ user: User | null; loading: boolean }>({
    user: null,
    loading: true,
  });
  useEffect(() => {
    fetchMe()
      .then((user) => setState({ user, loading: false }))
      .catch(() => setState({ user: null, loading: false }));
  }, []);
  return state;
}
