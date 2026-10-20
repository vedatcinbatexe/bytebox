'use client';

import { useState } from 'react';
import { parseAnsi, stripAnsi } from '@/lib/ansi';
import { splitLocations, type Location } from '@/lib/errorLocations';
import type { Run, RunStatus } from '@/lib/runs';

export const STATUS: Record<RunStatus, { label: string; className: string }> = {
  QUEUED: { label: 'Starting…', className: 'bg-info/15 text-info' },
  RUNNING: { label: 'Running…', className: 'animate-pulse bg-info/15 text-info' },
  COMPLETED: { label: 'Completed', className: 'bg-success/15 text-success' },
  TIMED_OUT: { label: 'Time limit exceeded', className: 'bg-warning/15 text-warning' },
  MEMORY_EXCEEDED: { label: 'Memory limit exceeded', className: 'bg-warning/15 text-warning' },
  FAILED: { label: 'Failed', className: 'bg-danger/15 text-danger' },
};

interface Props {
  run: Run | null;
  error: string | null;
  // Turn "main.py, line 3" in the output into links that open the file at that line
  filePaths?: string[];
  onOpenLocation?: (location: Location) => void;
}

// Queued or running: the run hasn't finished yet
export function isFinished(status: RunStatus): boolean {
  return status !== 'QUEUED' && status !== 'RUNNING';
}

interface AnsiTextProps {
  text: string;
  className: string;
  filePaths?: string[];
  onOpenLocation?: (location: Location) => void;
}

// Program output, with ANSI colors (e.g. \x1b[32m) shown as real colors
// and file locations as links when onOpenLocation is given
export function AnsiText({ text, className, filePaths = [], onOpenLocation }: AnsiTextProps) {
  return (
    <pre className={`whitespace-pre-wrap ${className}`}>
      {parseAnsi(text).map((segment, index) => (
        <span
          key={index}
          style={segment.color ? { color: segment.color } : undefined}
          className={segment.bold ? 'font-bold' : undefined}
        >
          {onOpenLocation
            ? splitLocations(segment.text, filePaths).map((piece, pieceIndex) =>
                piece.location ? (
                  <button
                    key={pieceIndex}
                    onClick={() => onOpenLocation(piece.location!)}
                    title={`Open ${piece.location.path} at line ${piece.location.line}`}
                    className="underline decoration-dotted underline-offset-2 hover:text-accent"
                  >
                    {piece.text}
                  </button>
                ) : (
                  piece.text
                ),
              )
            : segment.text}
        </span>
      ))}
    </pre>
  );
}

// stdout and stderr as plain text, for copying and downloading
function plainOutput(run: Run): string {
  return stripAnsi([run.stdout, run.stderr].filter(Boolean).join('\n'));
}

export function OutputPanel({ run, error, filePaths, onOpenLocation }: Props) {
  const [copied, setCopied] = useState(false);
  const hasOutput = run !== null && isFinished(run.status) && Boolean(run.stdout || run.stderr);

  async function copy() {
    try {
      await navigator.clipboard.writeText(plainOutput(run!));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: nothing to do
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([plainOutput(run!)], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'output.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Output</h2>
        {run && (
          <div className="flex items-center gap-3 text-xs text-muted">
            {hasOutput && (
              <>
                <button onClick={copy} className="hover:text-fg" title="Copy the output">
                  {copied ? '✓ Copied' : '⧉ Copy'}
                </button>
                <button onClick={download} className="hover:text-fg" title="Download the output as output.txt">
                  ⤓
                </button>
              </>
            )}
            {isFinished(run.status) && (
              <>
                {run.exitCode !== null && <span>exit {run.exitCode}</span>}
                <span>{run.timeMs} ms</span>
              </>
            )}
            <span className={`rounded px-2 py-0.5 font-medium ${STATUS[run.status].className}`}>
              {STATUS[run.status].label}
            </span>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 font-mono text-sm">
        {error && (
          <p className="mb-3 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-danger">
            {error}
          </p>
        )}
        {!run && !error && <p className="text-subtle">Press Run (⌘/Ctrl + Enter) to see output.</p>}
        {run && run.status === 'QUEUED' && <p className="text-subtle">Waiting for output…</p>}
        {run && run.status !== 'QUEUED' && (
          <>
            {run.stdout && (
              <AnsiText text={run.stdout} className="text-fg" filePaths={filePaths} onOpenLocation={onOpenLocation} />
            )}
            {run.stderr && (
              <AnsiText text={run.stderr} className="text-danger" filePaths={filePaths} onOpenLocation={onOpenLocation} />
            )}
            {!run.stdout && !run.stderr && isFinished(run.status) && <p className="text-subtle">No output.</p>}
            {run.status === 'RUNNING' && <span className="inline-block animate-pulse text-accent">▋</span>}
            {run.truncated && (
              <p className="mt-3 text-xs text-warning">Output was cut off at 64 KB.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
