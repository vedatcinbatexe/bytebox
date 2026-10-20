'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserMenu } from '@/components/UserMenu';
import { useMe } from '@/lib/auth';
import { fetchMyProjects, type ProjectSummary } from '@/lib/projects';

export default function MyProjectsPage() {
  const { user, loading } = useMe();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchMyProjects()
      .then(setProjects)
      .catch((loadError: Error) => setError(loadError.message));
  }, [user]);

  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <Link href="/" className="mr-auto text-lg font-bold">
          📦 Bytebox
        </Link>
        <UserMenu user={user} loading={loading} />
      </header>

      <main className="mx-auto max-w-3xl p-6">
        <div className="mb-6 flex items-center gap-3">
          <h1 className="mr-auto text-2xl font-bold">My projects</h1>
          <Link href="/" className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500">
            Open workspace
          </Link>
        </div>

        {loading && <p className="text-zinc-500">Loading…</p>}

        {!loading && !user && (
          <div className="rounded-lg border border-zinc-800 p-8 text-center">
            <p className="mb-4 text-zinc-400">Log in to see the projects you&apos;ve saved.</p>
            <Link
              href="/login?returnTo=%2Fprojects"
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Log in or sign up
            </Link>
          </div>
        )}

        {error && <p className="text-red-300">{error}</p>}

        {user && projects && projects.length === 0 && (
          <div className="rounded-lg border border-zinc-800 p-8 text-center text-zinc-400">
            No projects yet. Open the workspace and click <span className="text-zinc-200">Share</span> to save one.
          </div>
        )}

        {user && projects && projects.length > 0 && (
          <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {projects.map((project) => (
              <li key={project.slug}>
                <Link href={`/p/${project.slug}`} className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-900">
                  <span className="text-xl">📁</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{project.title}</span>
                    <span className="block text-xs text-zinc-500">
                      {project.fileCount} {project.fileCount === 1 ? 'file' : 'files'} · /p/{project.slug}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {new Date(project.updatedAt + (project.updatedAt.endsWith('Z') ? '' : 'Z')).toLocaleString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
