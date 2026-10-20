'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createProject } from '@/lib/projects';
import { NEW_WORKSPACE_CODE, NEW_WORKSPACE_FILE } from '@/lib/templates';

interface Props {
  onClose: () => void;
}

// Asks for a name, then creates a workspace with one file (init.js) and opens it
export function CreateWorkspaceModal({ onClose }: Props) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !creating) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, creating]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const title = name.trim();
    if (!title) {
      setError('Please give your workspace a name.');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const created = await createProject({
        title,
        project: { files: { [NEW_WORKSPACE_FILE]: NEW_WORKSPACE_CODE }, folders: [] },
        stdin: '',
      });
      router.push(`/p/${created.slug}`);
    } catch (createError) {
      const { message, code } = createError as { message: string; code?: string };
      setError(code === 'UNAUTHENTICATED' ? 'Please log in again to create a workspace.' : message);
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => !creating && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-workspace-title"
        onSubmit={create}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-line bg-panel p-6 shadow-xl"
      >
        <h2 id="create-workspace-title" className="mb-1 text-lg font-semibold">
          Create workspace
        </h2>
        <p className="mb-4 text-sm text-muted">
          It starts with one file, <code className="text-success">{NEW_WORKSPACE_FILE}</code>, that prints
          &quot;hello world&quot;.
        </p>

        <label htmlFor="workspace-name" className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
          Name
        </label>
        <input
          id="workspace-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          autoFocus
          placeholder="e.g. My first app"
          className="w-full rounded border border-line-strong bg-raised px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            className="rounded px-4 py-2 text-sm text-muted hover:bg-raised disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create workspace'}
          </button>
        </div>
      </form>
    </div>
  );
}
