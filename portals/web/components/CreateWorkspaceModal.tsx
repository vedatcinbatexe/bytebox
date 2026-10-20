'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createProject } from '@/lib/projects';
import { WORKSPACE_TEMPLATES } from '@/lib/templates';

interface Props {
  onClose: () => void;
}

// Asks for a name and a template, then creates the workspace and opens it
export function CreateWorkspaceModal({ onClose }: Props) {
  const router = useRouter();
  const [template, setTemplate] = useState(WORKSPACE_TEMPLATES[0]);
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
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
        project: { files: template.files, folders: [] },
        stdin: template.stdin ?? '',
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
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-line bg-panel p-6 shadow-xl"
      >
        <h2 id="create-workspace-title" className="mb-1 text-lg font-semibold">
          Create workspace
        </h2>
        <p className="mb-4 text-sm text-muted">Pick a starting point and give it a name.</p>

        <div role="radiogroup" aria-label="Template" className="mb-5 grid gap-2 sm:grid-cols-2">
          {WORKSPACE_TEMPLATES.map((item) => {
            const selected = item.id === template.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setTemplate(item);
                  if (!nameEdited) setName(item.id === 'blank-js' ? '' : item.name);
                }}
                className={`flex gap-3 rounded-lg border p-3 text-left ${
                  selected ? 'border-accent bg-accent/10' : 'border-line hover:bg-raised'
                }`}
              >
                <span className="text-2xl" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{item.name}</span>
                  <span className="block text-xs text-muted">{item.description}</span>
                  <span className="mt-1 block truncate font-mono text-[11px] text-subtle">
                    {Object.keys(item.files).join(' · ')}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <label htmlFor="workspace-name" className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
          Name
        </label>
        <input
          id="workspace-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNameEdited(true);
          }}
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
