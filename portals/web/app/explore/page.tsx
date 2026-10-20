'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserMenu } from '@/components/UserMenu';
import { ThemePicker } from '@/components/ThemePicker';
import { useMe } from '@/lib/auth';
import { fetchExplore, type ProjectSummary } from '@/lib/projects';

function timeAgo(iso: string): string {
  const date = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  return date.toLocaleDateString();
}

// Public projects from everyone, newest first
export default function ExplorePage() {
  const { user, loading } = useMe();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'NEWEST' | 'STARS'>('NEWEST');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProjects(null);
    fetchExplore(sort)
      .then(setProjects)
      .catch((loadError: Error) => setError(loadError.message));
  }, [sort]);

  const query = search.trim().toLowerCase();
  const shown = (projects ?? []).filter(
    (project) =>
      !query || project.title.toLowerCase().includes(query) || (project.ownerLogin ?? '').toLowerCase().includes(query),
  );

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
        <h1 className="mb-1 text-2xl font-bold">🌍 Explore</h1>
        <p className="mb-5 text-sm text-muted">
          Public projects from the Bytebox community. Open one to run it, or fork it to make it yours.
        </p>
        <div className="mb-5 flex gap-2">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title or author…"
            aria-label="Search public projects"
            className="min-w-0 flex-1 rounded border border-line-strong bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div role="radiogroup" aria-label="Sort" className="flex shrink-0 overflow-hidden rounded border border-line-strong text-sm">
            {(['NEWEST', 'STARS'] as const).map((option) => (
              <button
                key={option}
                role="radio"
                aria-checked={sort === option}
                onClick={() => setSort(option)}
                className={`px-3 ${sort === option ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-raised'}`}
              >
                {option === 'NEWEST' ? 'Newest' : '★ Most starred'}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-danger">{error}</p>}
        {projects === null && !error && <p className="text-subtle">Loading…</p>}
        {projects?.length === 0 && (
          <div className="rounded-lg border border-line bg-panel p-8 text-center text-muted">
            Nothing here yet. Make one of your projects <span className="text-fg">🌍 Public</span> to share it with everyone.
          </div>
        )}
        {projects && projects.length > 0 && shown.length === 0 && (
          <p className="text-sm text-muted">No public projects match “{search}”.</p>
        )}

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((project) => (
            <li key={project.slug}>
              <Link
                href={`/p/${project.slug}`}
                className="flex h-full flex-col rounded-lg border border-line bg-panel p-4 transition-colors hover:border-accent"
              >
                <span className="mb-1 truncate font-semibold">{project.title}</span>
                {project.ownerLogin ? (
                  <span
                    role="link"
                    tabIndex={0}
                    onClick={(event) => {
                      event.preventDefault(); // the card itself opens the project
                      router.push(`/u/${encodeURIComponent(project.ownerLogin!)}`);
                    }}
                    className="mb-3 w-fit text-xs text-muted hover:text-accent hover:underline"
                  >
                    by @{project.ownerLogin}
                  </span>
                ) : (
                  <span className="mb-3 text-xs text-muted">by someone</span>
                )}
                <span className="mt-auto flex justify-between text-xs text-subtle">
                  <span>
                    ★ {project.starCount} · {project.fileCount} {project.fileCount === 1 ? 'file' : 'files'}
                  </span>
                  <span>{timeAgo(project.updatedAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
