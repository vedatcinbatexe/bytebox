'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserMenu } from '@/components/UserMenu';
import { ThemePicker } from '@/components/ThemePicker';
import { STATUS } from '@/components/OutputPanel';
import { LANGUAGE_NAMES } from '@/components/StatusBar';
import { useMe } from '@/lib/auth';
import { fetchStats, type PlatformStats } from '@/lib/projects';
import type { RunStatus } from '@/lib/runs';

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

// Public numbers about Bytebox, from the identity, project and execution services
export default function StatsPage() {
  const { user, loading } = useMe();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch((loadError: Error) => setError(loadError.message));
  }, []);

  const mostRuns = Math.max(1, ...(stats?.languages.map((item) => item.runs) ?? []));
  const busiestDay = Math.max(1, ...(stats?.last7Days.map((item) => item.runs) ?? []));

  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-2 border-b border-line bg-panel px-4 py-2.5">
        <Link href="/" className="mr-auto text-lg font-bold">
          📦 Bytebox
        </Link>
        <ThemePicker />
        <UserMenu user={user} loading={loading} />
      </header>

      <main className="mx-auto max-w-5xl p-6">
        <h1 className="mb-1 text-2xl font-bold">📊 Stats</h1>
        <p className="mb-5 text-sm text-muted">
          What&apos;s happening on Bytebox. Updated every 30 seconds.{' '}
          <Link href="/explore" className="text-accent hover:underline">
            Explore public projects →
          </Link>
        </p>

        {error && <p className="text-danger">{error}</p>}
        {!stats && !error && <p className="text-subtle">Loading…</p>}
        {stats && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Card label="Users" value={stats.users} />
              <Card label="Projects" value={stats.projects} />
              <Card label="Public projects" value={stats.publicProjects} />
              <Card label="Stars" value={stats.stars} />
              <Card label="Runs" value={stats.totalRuns} />
              <Card label="Runs in the last 24 h" value={stats.runsLast24h} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-lg border border-line bg-panel p-4">
                <h2 className="mb-3 font-semibold">Runs by language</h2>
                {stats.languages.length === 0 && <p className="text-sm text-subtle">No runs yet.</p>}
                <ul className="space-y-2.5">
                  {stats.languages.map((item) => (
                    <li key={item.language}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{LANGUAGE_NAMES[item.language] ?? item.language}</span>
                        <span className="text-muted tabular-nums">
                          {item.runs.toLocaleString()} · avg {item.averageTimeMs} ms
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-raised">
                        <div className="h-2 rounded-full bg-accent" style={{ width: `${(item.runs / mostRuns) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-lg border border-line bg-panel p-4">
                <h2 className="mb-3 font-semibold">Runs in the last 7 days</h2>
                <div className="flex h-40 items-end gap-2" role="img" aria-label="Runs per day for the last 7 days">
                  {stats.last7Days.map((item) => (
                    <div key={item.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-xs text-muted tabular-nums">{item.runs}</span>
                      <div
                        className="w-full rounded-t bg-accent"
                        style={{ height: `${(item.runs / busiestDay) * 100}%`, minHeight: item.runs ? 4 : 1 }}
                        title={`${item.day}: ${item.runs} runs`}
                      />
                      <span className="text-[11px] text-subtle">
                        {new Date(`${item.day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}
                      </span>
                    </div>
                  ))}
                </div>

                <h2 className="mt-5 mb-2 font-semibold">How runs ended</h2>
                <div className="flex flex-wrap gap-2">
                  {stats.statuses.map((item) => {
                    const status = STATUS[item.status.toUpperCase() as RunStatus];
                    return (
                      <span key={item.status} className={`rounded px-2 py-0.5 text-xs ${status?.className ?? 'bg-raised'}`}>
                        {status?.label ?? item.status}: {item.runs.toLocaleString()}
                      </span>
                    );
                  })}
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
