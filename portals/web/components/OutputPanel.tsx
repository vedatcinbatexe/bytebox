import type { Run, RunStatus } from '@/lib/runs';

const STATUS: Record<RunStatus, { label: string; className: string }> = {
  QUEUED: { label: 'Running…', className: 'bg-sky-500/15 text-sky-300' },
  COMPLETED: { label: 'Completed', className: 'bg-emerald-500/15 text-emerald-300' },
  TIMED_OUT: { label: 'Time limit exceeded', className: 'bg-amber-500/15 text-amber-300' },
  MEMORY_EXCEEDED: { label: 'Memory limit exceeded', className: 'bg-amber-500/15 text-amber-300' },
  FAILED: { label: 'Failed', className: 'bg-red-500/15 text-red-300' },
};

interface Props {
  run: Run | null;
  error: string | null;
}

export function OutputPanel({ run, error }: Props) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-2">
        <h2 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Output</h2>
        {run && (
          <div className="flex items-center gap-3 text-xs text-zinc-400">
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
          <p className="mb-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-300">
            {error}
          </p>
        )}
        {!run && !error && <p className="text-zinc-500">Press Run (⌘/Ctrl + Enter) to see output.</p>}
        {run && run.status === 'QUEUED' && <p className="text-zinc-500">Waiting for output…</p>}
        {run && run.status !== 'QUEUED' && (
          <>
            {run.stdout && <pre className="whitespace-pre-wrap text-zinc-100">{run.stdout}</pre>}
            {run.stderr && <pre className="whitespace-pre-wrap text-red-300">{run.stderr}</pre>}
            {!run.stdout && !run.stderr && <p className="text-zinc-500">No output.</p>}
            {run.truncated && (
              <p className="mt-3 text-xs text-amber-300">Output was cut off at 64 KB.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
