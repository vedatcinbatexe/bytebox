'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserMenu } from '@/components/UserMenu';
import { ThemePicker } from '@/components/ThemePicker';
import { CreateWorkspaceModal } from '@/components/CreateWorkspaceModal';
import { useMe } from '@/lib/auth';
import { deleteProject, fetchMyProjects, renameProject, type ProjectSummary } from '@/lib/projects';

export default function MyProjectsPage() {
  const { user, loading } = useMe();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    fetchMyProjects()
      .then(setProjects)
      .catch((loadError: Error) => setError(loadError.message));
  }, [user]);

  async function rename(project: ProjectSummary) {
    const title = window.prompt('Rename workspace', project.title)?.trim();
    if (!title || title === project.title) return;
    try {
      await renameProject(project.slug, title);
      setProjects((current) => current?.map((item) => (item.slug === project.slug ? { ...item, title } : item)) ?? null);
    } catch (renameError) {
      setError((renameError as Error).message);
    }
  }

  async function remove(project: ProjectSummary) {
    if (!window.confirm(`Delete "${project.title}"? This cannot be undone.`)) return;
    try {
      await deleteProject(project.slug);
      setProjects((current) => current?.filter((item) => item.slug !== project.slug) ?? null);
    } catch (deleteError) {
      setError((deleteError as Error).message);
    }
  }

  const query = search.trim().toLowerCase();
  const shown = (projects ?? []).filter(
    (project) => !query || project.title.toLowerCase().includes(query) || project.slug.toLowerCase().includes(query),
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

      <main className="mx-auto max-w-3xl p-6">
        <div className="mb-6 flex items-center gap-3">
          <h1 className="mr-auto text-2xl font-bold">My projects</h1>
          {user && (
            <button
              onClick={() => setCreating(true)}
              className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
            >
              ＋ Create workspace
            </button>
          )}
        </div>

        {loading && <p className="text-subtle">Loading…</p>}

        {!loading && !user && (
          <div className="rounded-lg border border-line p-8 text-center">
            <p className="mb-4 text-muted">Log in to see the projects you&apos;ve saved.</p>
            <Link
              href="/login?returnTo=%2Fprojects"
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
            >
              Log in or sign up
            </Link>
          </div>
        )}

        {error && <p className="text-danger">{error}</p>}

        {user && projects && projects.length === 0 && (
          <div className="rounded-lg border border-line p-8 text-center text-muted">
            <p className="mb-4">No workspaces yet.</p>
            <button
              onClick={() => setCreating(true)}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
            >
              ＋ Create your first workspace
            </button>
          </div>
        )}

        {user && projects && projects.length > 0 && (
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your workspaces…"
            aria-label="Search workspaces"
            className="mb-3 w-full rounded border border-line-strong bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
          />
        )}

        {user && projects && projects.length > 0 && shown.length === 0 && (
          <p className="text-sm text-muted">No workspaces match “{search}”.</p>
        )}

        {user && shown.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
            {shown.map((project) => (
              <li key={project.slug} className="group flex items-center hover:bg-raised">
                <Link href={`/p/${project.slug}`} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3">
                  <span className="text-xl">📁</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{project.title}</span>
                    <span className="block text-xs text-subtle">
                      {project.fileCount} {project.fileCount === 1 ? 'file' : 'files'} · /p/{project.slug}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-subtle">
                    {new Date(project.updatedAt + (project.updatedAt.endsWith('Z') ? '' : 'Z')).toLocaleString()}
                  </span>
                </Link>
                <div className="flex shrink-0 gap-1 pr-3">
                  <button
                    onClick={() => rename(project)}
                    title="Rename"
                    aria-label={`Rename ${project.title}`}
                    className="rounded px-2 py-1 text-muted hover:bg-line hover:text-fg"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => remove(project)}
                    title="Delete"
                    aria-label={`Delete ${project.title}`}
                    className="rounded px-2 py-1 text-muted hover:bg-line hover:text-danger"
                  >
                    🗑
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
      {creating && <CreateWorkspaceModal onClose={() => setCreating(false)} />}
    </div>
  );
}
