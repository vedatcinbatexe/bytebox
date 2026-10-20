'use client';

import { useEffect, useState } from 'react';
import {
  fetchVersionFiles,
  fetchVersions,
  restoreVersion,
  type SavedProject,
  type VersionSummary,
} from '@/lib/projects';

interface Props {
  slug: string;
  onRestored: (project: SavedProject) => void;
  onClose: () => void;
}

function timeAgo(iso: string): string {
  const date = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return date.toLocaleString();
}

// Earlier versions of a project: browse their files read-only and restore one
export function HistoryPanel({ slug, onRestored, onClose }: Props) {
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [selected, setSelected] = useState<VersionSummary | null>(null);
  const [files, setFiles] = useState<Record<string, string> | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    fetchVersions(slug)
      .then(setVersions)
      .catch((loadError: Error) => setError(loadError.message));
  }, [slug]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !restoring) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, restoring]);

  async function select(version: VersionSummary) {
    setSelected(version);
    setFiles(null);
    try {
      const loaded = await fetchVersionFiles(slug, version.id);
      setFiles(loaded);
      setOpenFile(Object.keys(loaded).sort()[0] ?? null);
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  }

  async function restore() {
    if (!selected || !window.confirm('Restore this version? Your current version stays in the history.')) return;
    setRestoring(true);
    try {
      onRestored(await restoreVersion(slug, selected.id));
      onClose();
    } catch (restoreError) {
      setError((restoreError as Error).message);
      setRestoring(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !restoring && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <h2 id="history-title" className="mr-auto text-lg font-semibold">
            🕘 Version history
          </h2>
          {selected && (
            <button
              onClick={restore}
              disabled={restoring || !files}
              className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
            >
              {restoring ? 'Restoring…' : 'Restore this version'}
            </button>
          )}
          <button onClick={onClose} title="Close (Esc)" className="rounded px-2 py-1 text-muted hover:bg-raised hover:text-fg">
            ✕
          </button>
        </div>
        {error && <p className="border-b border-line px-5 py-2 text-sm text-danger">{error}</p>}

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <ul className="max-h-48 shrink-0 overflow-y-auto border-b border-line md:max-h-none md:w-64 md:border-r md:border-b-0">
            {versions === null && <li className="px-4 py-3 text-sm text-subtle">Loading…</li>}
            {versions?.length === 0 && (
              <li className="px-4 py-3 text-sm text-subtle">No earlier versions yet. Every save keeps the previous one here.</li>
            )}
            {versions?.map((version) => (
              <li key={version.id}>
                <button
                  onClick={() => select(version)}
                  className={`w-full px-4 py-2.5 text-left text-sm ${selected?.id === version.id ? 'bg-accent/15' : 'hover:bg-raised'}`}
                >
                  <span className="block font-medium">{timeAgo(version.savedAt)}</span>
                  <span className="block truncate text-xs text-muted">
                    {version.title} · {version.fileCount} {version.fileCount === 1 ? 'file' : 'files'}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {!selected && <p className="p-5 text-sm text-subtle">Pick a version to see its files.</p>}
            {selected && !files && <p className="p-5 text-sm text-subtle">Loading files…</p>}
            {files && (
              <>
                <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
                  {Object.keys(files)
                    .sort()
                    .map((path) => (
                      <button
                        key={path}
                        onClick={() => setOpenFile(path)}
                        className={`shrink-0 rounded px-2 py-0.5 font-mono text-xs ${openFile === path ? 'bg-raised text-fg' : 'text-muted hover:text-fg'}`}
                      >
                        {path}
                      </button>
                    ))}
                </div>
                <pre className="min-h-0 flex-1 overflow-auto bg-app p-4 font-mono text-sm whitespace-pre text-fg">
                  {openFile ? files[openFile] : ''}
                </pre>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
