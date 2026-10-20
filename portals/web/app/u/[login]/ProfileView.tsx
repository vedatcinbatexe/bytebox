'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar, UserMenu } from '@/components/UserMenu';
import { ThemePicker } from '@/components/ThemePicker';
import { useMe } from '@/lib/auth';
import { fetchProfile, type UserProfile } from '@/lib/projects';

// Someone's public profile: who they are and their public projects
export function ProfileView({ login }: { login: string }) {
  const { user, loading } = useMe();
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile(login)
      .then(setProfile)
      .catch((loadError: Error) => setError(loadError.message));
  }, [login]);

  const isMe = user?.login.toLowerCase() === login.toLowerCase();

  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-2 border-b border-line bg-panel px-4 py-2.5">
        <Link href="/" className="text-lg font-bold">
          📦 Bytebox
        </Link>
        <Link href="/explore" className="mr-auto text-sm text-muted hover:text-fg">
          Explore
        </Link>
        <ThemePicker />
        <UserMenu user={user} loading={loading} />
      </header>

      <main className="mx-auto max-w-4xl p-6">
        {error && <p className="text-danger">{error}</p>}
        {profile === undefined && !error && <p className="text-subtle">Loading…</p>}
        {profile === null && (
          <div className="py-16 text-center">
            <h1 className="mb-2 text-2xl font-bold">No such user</h1>
            <p className="text-muted">There&apos;s nobody called @{login} on Bytebox.</p>
          </div>
        )}

        {profile && (
          <>
            <section className="mb-8 flex items-center gap-5">
              <Avatar user={profile} size={80} />
              <div>
                <h1 className="text-2xl font-bold">{profile.name}</h1>
                <p className="text-muted">@{profile.login}</p>
                <p className="mt-1 text-xs text-subtle">
                  Joined {new Date(profile.joinedAt.endsWith('Z') ? profile.joinedAt : `${profile.joinedAt}Z`).toLocaleDateString()} ·{' '}
                  {profile.projects.length} public {profile.projects.length === 1 ? 'project' : 'projects'}
                </p>
              </div>
            </section>

            {profile.projects.length === 0 ? (
              <div className="rounded-lg border border-line bg-panel p-8 text-center text-muted">
                {isMe ? (
                  <>
                    No public projects yet. Open one of <Link href="/projects" className="text-accent underline">your projects</Link> and set it to 🌍 Public.
                  </>
                ) : (
                  'No public projects yet.'
                )}
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {profile.projects.map((project) => (
                  <li key={project.slug}>
                    <Link
                      href={`/p/${project.slug}`}
                      className="flex h-full flex-col rounded-lg border border-line bg-panel p-4 transition-colors hover:border-accent"
                    >
                      <span className="mb-2 truncate font-semibold">{project.title}</span>
                      <span className="mt-auto text-xs text-subtle">
                        {project.fileCount} {project.fileCount === 1 ? 'file' : 'files'} · updated{' '}
                        {new Date(project.updatedAt.endsWith('Z') ? project.updatedAt : `${project.updatedAt}Z`).toLocaleDateString()}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
