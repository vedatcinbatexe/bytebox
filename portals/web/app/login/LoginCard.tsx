'use client';

import Link from 'next/link';
import { logoutUrl, providerLoginUrl, useMe } from '@/lib/auth';

function errorMessage(error: string, provider?: string): string {
  if (error === 'not-configured') {
    const name = provider === 'google' ? 'Google' : 'GitHub';
    const env = provider === 'google' ? 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET' : 'GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET';
    return `${name} login isn’t set up on this server yet (missing ${env}).`;
  }
  if (error === 'failed') return 'Signing in didn’t work. Please try again.';
  return 'Something went wrong. Please try again.';
}

interface Props {
  returnTo: string;
  error?: string;
  provider?: string;
}

export function LoginCard({ returnTo, error, provider }: Props) {
  const { user, loading } = useMe();

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-950 p-8 text-center shadow-xl">
        <Link href="/" className="text-2xl font-bold">
          📦 Bytebox
        </Link>

        {loading ? (
          <p className="mt-6 text-sm text-zinc-500">Checking…</p>
        ) : user ? (
          <>
            <p className="mt-6 mb-6 text-sm text-zinc-300">
              You&apos;re signed in as <span className="font-semibold">@{user.login}</span>.
            </p>
            <Link
              href={returnTo}
              className="block rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Continue
            </Link>
            <a href={logoutUrl('/login')} className="mt-3 block text-xs text-zinc-500 hover:text-zinc-300">
              Sign in with a different account
            </a>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-lg font-semibold">Log in or sign up</h1>
            <p className="mt-2 mb-6 text-sm text-zinc-400">
              Use your GitHub or Google account. Your first sign-in creates your Bytebox account.
            </p>
            {error && (
              <p className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-left text-sm text-red-300">
                {errorMessage(error, provider)}
              </p>
            )}
            <a
              href={providerLoginUrl('github', returnTo)}
              className="flex items-center justify-center gap-2 rounded bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
            >
              <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              Continue with GitHub
            </a>
            <a
              href={providerLoginUrl('google', returnTo)}
              className="mt-2 flex items-center justify-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
            >
              <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Continue with Google
            </a>
            <Link href={returnTo} className="mt-4 block text-xs text-zinc-500 hover:text-zinc-300">
              Not now, just browse
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
