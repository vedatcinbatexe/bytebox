'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fuzzyFilter } from '@/lib/fuzzy';

export interface Command {
  id: string;
  label: string;
  group: 'File' | 'Action' | 'Theme' | 'Go to';
  hint?: string; // e.g. a keyboard shortcut
  run: () => void;
}

interface Props {
  commands: Command[];
  onClose: () => void;
}

// ⌘/Ctrl + K: search files and actions, Enter to run
export function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const shown = useMemo(
    () => fuzzyFilter(commands, query, (command) => `${command.group} ${command.label}`).slice(0, 50),
    [commands, query],
  );

  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    listRef.current?.children[selected]?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  function runCommand(command: Command | undefined) {
    if (!command) return;
    onClose();
    command.run();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-lg border border-line bg-panel shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSelected((index) => Math.min(index + 1, shown.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSelected((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              runCommand(shown[selected]);
            } else if (event.key === 'Escape') {
              onClose();
            }
          }}
          placeholder="Type a file name or a command…"
          aria-label="Search files and commands"
          className="w-full border-b border-line bg-transparent px-4 py-3 text-sm outline-none"
        />
        <ul ref={listRef} role="listbox" className="max-h-80 overflow-y-auto py-1">
          {shown.length === 0 && <li className="px-4 py-3 text-sm text-subtle">Nothing found</li>}
          {shown.map((command, index) => (
            <li
              key={command.id}
              role="option"
              aria-selected={index === selected}
              onMouseEnter={() => setSelected(index)}
              onClick={() => runCommand(command)}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2 text-sm ${
                index === selected ? 'bg-accent/15 text-fg' : 'text-fg'
              }`}
            >
              <span className="w-14 shrink-0 text-xs text-subtle">{command.group}</span>
              <span className="min-w-0 flex-1 truncate">{command.label}</span>
              {command.hint && (
                <kbd className="shrink-0 rounded border border-line-strong px-1.5 font-mono text-[11px] text-muted">
                  {command.hint}
                </kbd>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
