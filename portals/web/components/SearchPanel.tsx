'use client';

import { useMemo, useState } from 'react';
import { replaceInProject, searchProject } from '@/lib/search';

interface Props {
  files: Record<string, string>;
  // Open a file and select the match
  onOpenMatch: (path: string, line: number, column: number, length: number) => void;
  // Save replaced files; without it there is no Replace (e.g. read-only)
  onReplace?: (changed: Record<string, string>, count: number) => void;
}

// "Find in files" for the file explorer
export function SearchPanel({ files, onOpenMatch, onReplace }: Props) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replacement, setReplacement] = useState('');
  const { results, total, limited } = useMemo(
    () => searchProject(files, query, caseSensitive),
    [files, query, caseSensitive],
  );

  function replace(onlyPath?: string) {
    const { changed, count } = replaceInProject(files, query, replacement, caseSensitive, onlyPath);
    if (count > 0) onReplace?.(changed, count);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-1 p-2">
        {onReplace && (
          <button
            onClick={() => setReplaceOpen((open) => !open)}
            aria-expanded={replaceOpen}
            title="Replace"
            className="w-4 shrink-0 text-xs text-muted hover:text-fg"
          >
            {replaceOpen ? '▾' : '▸'}
          </button>
        )}
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find in files"
          aria-label="Find in files"
          autoFocus
          className="min-w-0 flex-1 rounded border border-line-strong bg-app px-2 py-1 text-sm outline-none focus:border-accent"
        />
        <button
          onClick={() => setCaseSensitive((value) => !value)}
          aria-pressed={caseSensitive}
          title="Match case"
          className={`rounded border px-1.5 text-xs ${caseSensitive ? 'border-accent text-accent' : 'border-line-strong text-muted'}`}
        >
          Aa
        </button>
      </div>
      {onReplace && replaceOpen && (
        <div className="flex gap-1 px-2 pb-2 pl-7">
          <input
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            placeholder="Replace with"
            aria-label="Replace with"
            className="min-w-0 flex-1 rounded border border-line-strong bg-app px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={() => replace()}
            disabled={total === 0}
            title="Replace every match in every file"
            className="rounded border border-line-strong px-1.5 text-xs whitespace-nowrap text-fg hover:bg-raised disabled:opacity-40"
          >
            All
          </button>
        </div>
      )}
      {query && (
        <p className="px-3 pb-1 text-xs text-subtle">
          {total === 0 ? 'No results' : `${total}${limited ? '+' : ''} result${total === 1 ? '' : 's'} in ${results.length} file${results.length === 1 ? '' : 's'}`}
        </p>
      )}
      <ul className="min-h-0 flex-1 overflow-auto pb-2 text-sm">
        {results.map((file) => (
          <li key={file.path}>
            <div className="flex items-center gap-2 px-3 pt-2 pb-0.5">
              <p className="min-w-0 flex-1 truncate text-xs font-semibold text-muted">📄 {file.path}</p>
              {onReplace && replaceOpen && (
                <button
                  onClick={() => replace(file.path)}
                  title={`Replace every match in ${file.path}`}
                  className="shrink-0 text-xs text-muted hover:text-accent"
                >
                  Replace
                </button>
              )}
            </div>
            {file.matches.map((match) => {
              const start = match.column - 1;
              return (
                <button
                  key={`${match.line}:${match.column}`}
                  onClick={() => onOpenMatch(file.path, match.line, match.column, query.length)}
                  className="flex w-full gap-2 px-3 py-0.5 text-left font-mono text-xs hover:bg-raised"
                >
                  <span className="w-7 shrink-0 text-right text-subtle">{match.line}</span>
                  <span className="truncate text-fg">
                    {match.text.slice(Math.max(0, start - 20), start).trimStart()}
                    <mark className="rounded-sm bg-accent/30 text-fg">{match.text.slice(start, start + query.length)}</mark>
                    {match.text.slice(start + query.length)}
                  </span>
                </button>
              );
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}
