'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserMenu } from '@/components/UserMenu';
import { ThemePicker } from '@/components/ThemePicker';
import { STATUS } from '@/components/OutputPanel';
import { useMe } from '@/lib/auth';
import { fetchMyRuns, type RunSummary } from '@/lib/runs';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function RunHistoryPage() {
  const { user, loading } = useMe();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchMyRuns()
      .then(setRuns)
      .catch((loadError: Error) => setError(loadError.message));
  }, [user]);

  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-2 border-b border-line bg-panel px-4 py-2.5">
        <Link href="/" className="mr-auto text-lg font-bold">
          📦 Bytebox
        </Link>
        <ThemePicker />
        <UserMenu user={user} loading={loading} />
      </header>

      <main className="mx-auto max-w-3xl p-6">
        <h1 className="mb-1 text-2xl font-bold">Run history</h1>
        <p className="mb-6 text-sm text-muted">Your last 50 runs, newest first.</p>

        {loading && <p className="text-subtle">Loading…</p>}

        {!loading && !user && (
          <div className="rounded-lg border border-line bg-panel p-8 text-center">
            <p className="mb-4 text-muted">Log in to see the code you&apos;ve run.</p>
            <Link
              href="/login?returnTo=%2Fruns"
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
            >
              Log in or sign up
            </Link>
          </div>
        )}

        {error && <p className="text-danger">{error}</p>}

        {user && runs && runs.length === 0 && (
          <div className="rounded-lg border border-line bg-panel p-8 text-center text-muted">
            No runs yet. Open a workspace and press <span className="text-fg">▶ Run</span>.
          </div>
        )}

        {user && runs && runs.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
            {runs.map((run) => {
              const status = STATUS[run.status];
              const isOpen = openRun === run.id;
              return (
                <li key={run.id}>
                  <button
                    onClick={() => setOpenRun(isOpen ? null : run.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-raised"
                  >
                    <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${status.className}`}>
                      {status.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">{run.entryFile}</span>
                    <span className="hidden shrink-0 text-xs text-subtle sm:inline">
                      {run.language} · {run.timeMs} ms{run.exitCode !== null ? ` · exit ${run.exitCode}` : ''}
                    </span>
                    <span className="shrink-0 text-xs text-subtle">{formatDate(run.createdAt)}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-line bg-app px-4 py-3 font-mono text-sm">
                      {run.stdout && <pre className="whitespace-pre-wrap text-fg">{run.stdout}</pre>}
                      {run.stderr && <pre className="whitespace-pre-wrap text-danger">{run.stderr}</pre>}
                      {!run.stdout && !run.stderr && <p className="text-subtle">No output.</p>}
                      {run.truncated && <p className="mt-2 text-xs text-warning">Output was cut off at 64 KB.</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
