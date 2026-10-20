import type { Run, RunStatus } from '@/lib/runs';

const STATUS: Record<RunStatus, { label: string; className: string }> = {
  QUEUED: { label: 'Running…', className: 'bg-info/15 text-info' },
  COMPLETED: { label: 'Completed', className: 'bg-success/15 text-success' },
  TIMED_OUT: { label: 'Time limit exceeded', className: 'bg-warning/15 text-warning' },
  MEMORY_EXCEEDED: { label: 'Memory limit exceeded', className: 'bg-warning/15 text-warning' },
  FAILED: { label: 'Failed', className: 'bg-danger/15 text-danger' },
};

interface Props {
  run: Run | null;
  error: string | null;
}

export function OutputPanel({ run, error }: Props) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Output</h2>
        {run && (
          <div className="flex items-center gap-3 text-xs text-muted">
            {run.status !== 'QUEUED' && (
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
            {run.stdout && <pre className="whitespace-pre-wrap text-fg">{run.stdout}</pre>}
            {run.stderr && <pre className="whitespace-pre-wrap text-danger">{run.stderr}</pre>}
            {!run.stdout && !run.stderr && <p className="text-subtle">No output.</p>}
            {run.truncated && (
              <p className="mt-3 text-xs text-warning">Output was cut off at 64 KB.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
