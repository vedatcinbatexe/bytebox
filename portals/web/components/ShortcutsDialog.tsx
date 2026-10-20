'use client';

import { useEffect } from 'react';

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: '⌘/Ctrl + K', action: 'Command palette (files and actions)' },
  { keys: '⌘/Ctrl + Enter', action: 'Run the open file' },
  { keys: '⌘/Ctrl + S', action: 'Save (your own projects)' },
  { keys: 'Shift + Alt + F', action: 'Format the open file' },
  { keys: '⌘/Ctrl + Shift + F', action: 'Find in files' },
  { keys: '⌘/Ctrl + F', action: 'Find in the open file' },
  { keys: '⌘/Ctrl + Z / Shift + Z', action: 'Undo / redo' },
  { keys: '⌘/Ctrl + /', action: 'Comment or uncomment lines' },
  { keys: 'Alt + ↑ / ↓', action: 'Move lines up or down' },
  { keys: '⌘/Ctrl + D', action: 'Select the next match' },
  { keys: '?', action: 'Show this list' },
];

interface Props {
  onClose: () => void;
}

export function ShortcutsDialog({ onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="w-full max-w-md rounded-lg border border-line bg-panel p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center">
          <h2 id="shortcuts-title" className="mr-auto text-lg font-semibold">
            ⌨ Keyboard shortcuts
          </h2>
          <button onClick={onClose} title="Close (Esc)" className="rounded px-2 py-1 text-muted hover:bg-raised hover:text-fg">
            ✕
          </button>
        </div>
        <dl className="divide-y divide-line text-sm">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="flex items-center justify-between gap-4 py-2">
              <dt className="text-muted">{shortcut.action}</dt>
              <dd>
                <kbd className="rounded border border-line-strong bg-raised px-2 py-0.5 font-mono text-xs text-fg">
                  {shortcut.keys}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
