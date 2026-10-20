'use client';

import Link from 'next/link';
import { ThemePicker } from '@/components/ThemePicker';
import { githubLoginUrl, logoutUrl, useMe } from '@/lib/auth';

const ERRORS: Record<string, string> = {
  failed: 'Signing in with GitHub didn’t work. Please try again.',
  'not-configured': 'GitHub login isn’t set up on this server yet (missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET).',
};

interface Props {
  returnTo: string;
  error?: string;
}

export function LoginCard({ returnTo, error }: Props) {
  const { user, loading } = useMe();

  return (
    <main className="relative flex min-h-dvh items-center justify-center p-4">
      <div className="absolute top-3 right-3">
        <ThemePicker />
      </div>
      <div className="w-full max-w-sm rounded-lg border border-line bg-panel p-8 text-center shadow-xl">
        <Link href="/" className="text-2xl font-bold">
          📦 Bytebox
        </Link>

        {loading ? (
          <p className="mt-6 text-sm text-subtle">Checking…</p>
        ) : user ? (
          <>
            <p className="mt-6 mb-6 text-sm text-fg">
              You&apos;re signed in as <span className="font-semibold">@{user.login}</span>.
            </p>
            <Link
              href={returnTo}
              className="block rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
            >
              Continue
            </Link>
            <a href={logoutUrl('/login')} className="mt-3 block text-xs text-subtle hover:text-fg">
              Sign in with a different account
            </a>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-lg font-semibold">Log in or sign up</h1>
            <p className="mt-2 mb-6 text-sm text-muted">
              Use your GitHub account. Your first sign-in creates your Bytebox account.
            </p>
            {error && (
              <p className="mb-4 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-left text-sm text-danger">
                {ERRORS[error] ?? 'Something went wrong. Please try again.'}
              </p>
            )}
            <a
              href={githubLoginUrl(returnTo)}
              className="flex items-center justify-center gap-2 rounded bg-fg px-4 py-2 text-sm font-semibold text-app hover:opacity-90"
            >
              <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              Continue with GitHub
            </a>
            <Link href={returnTo} className="mt-4 block text-xs text-subtle hover:text-fg">
              Not now, just browse
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
