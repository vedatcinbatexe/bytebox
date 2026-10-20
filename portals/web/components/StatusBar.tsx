import type { Run } from '@/lib/runs';
import { STATUS } from './OutputPanel';

interface Props {
  language: string | null;
  lines: number;
  cursor: { line: number; column: number } | null;
  run: Run | null;
  saveState: 'saved' | 'unsaved' | 'local' | 'guest' | 'other';
  onShowShortcuts: () => void;
}

const LANGUAGE_NAMES: Record<string, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  java: 'Java',
  cpp: 'C++',
  html: 'HTML',
  css: 'CSS',
  json: 'JSON',
  markdown: 'Markdown',
  plaintext: 'Plain text',
};

const SAVE_LABELS = {
  saved: '✓ All changes saved',
  unsaved: '● Unsaved changes',
  local: 'Saved in this browser',
  guest: 'Guest (read-only)',
  other: 'Someone else’s project · fork to save',
};

// Thin bar at the bottom of the IDE
export function StatusBar({ language, lines, cursor, run, saveState, onShowShortcuts }: Props) {
  return (
    <footer className="flex shrink-0 items-center gap-4 overflow-x-auto border-t border-line bg-panel px-3 py-1 text-xs whitespace-nowrap text-muted">
      {language && <span>{LANGUAGE_NAMES[language] ?? language}</span>}
      {cursor && (
        <span>
          Ln {cursor.line}, Col {cursor.column}
        </span>
      )}
      {language && <span>{lines} lines</span>}
      {run && (
        <span className="flex items-center gap-1.5">
          <span className={`rounded px-1.5 ${STATUS[run.status].className}`}>{STATUS[run.status].label}</span>
          {run.status !== 'QUEUED' && run.status !== 'RUNNING' && <span>{run.timeMs} ms</span>}
        </span>
      )}
      <span className={`ml-auto ${saveState === 'unsaved' ? 'text-warning' : ''}`}>{SAVE_LABELS[saveState]}</span>
      <button onClick={onShowShortcuts} className="rounded px-1.5 hover:bg-raised hover:text-fg" title="Keyboard shortcuts (?)">
        ⌨ Shortcuts
      </button>
    </footer>
  );
}
