'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchForks, type ProjectSummary } from '@/lib/projects';

interface Props {
  slug: string;
  forkCount: number;
  onClose: () => void;
}

// Public forks of a project (unlisted and private forks are counted but not listed)
export function ForksDialog({ slug, forkCount, onClose }: Props) {
  const [forks, setForks] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchForks(slug)
      .then(setForks)
      .catch((loadError: Error) => setError(loadError.message));
  }, [slug]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hidden = forks ? forkCount - forks.length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="forks-title"
        className="w-full max-w-md rounded-lg border border-line bg-panel p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center">
          <h2 id="forks-title" className="mr-auto text-lg font-semibold">
            ⑂ Forks ({forkCount})
          </h2>
          <button onClick={onClose} title="Close (Esc)" className="rounded px-2 py-1 text-muted hover:bg-raised hover:text-fg">
            ✕
          </button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {!forks && !error && <p className="text-sm text-subtle">Loading…</p>}
        {forks && (
          <ul className="max-h-80 divide-y divide-line overflow-y-auto text-sm">
            {forks.map((fork) => (
              <li key={fork.slug}>
                <Link href={`/p/${fork.slug}`} className="flex items-center gap-2 py-2 hover:text-accent">
                  <span className="min-w-0 flex-1 truncate">{fork.title}</span>
                  {fork.ownerLogin && <span className="text-xs text-muted">@{fork.ownerLogin}</span>}
                  <span className="text-xs text-subtle">★ {fork.starCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {hidden > 0 && (
          <p className="mt-3 text-xs text-subtle">
            {hidden === 1 ? '1 fork isn’t public, so it isn’t listed.' : `${hidden} forks aren’t public, so they aren’t listed.`}
          </p>
        )}
      </div>
    </div>
  );
}
