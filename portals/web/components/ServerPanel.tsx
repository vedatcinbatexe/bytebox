'use client';

import { ResizeHandle } from './ResizeHandle';
import { useStoredSize } from '@/lib/useStoredSize';
import { useEffect, useRef, useState } from 'react';
import { AnsiText } from './OutputPanel';
import { ApiTester } from './ApiTester';
import type { ApiRequest, ApiResponse, ServerStatus } from '@/lib/useDevServer';

interface Props {
  framework: string; // what the project looks like, e.g. "Spring Boot"
  status: ServerStatus;
  runningFramework: string | null;
  previewUrl: string | null;
  log: string;
  onStart: () => void;
  onStop: () => void;
  files: Record<string, string>; // for the API tester's list of endpoints
  onSend: (request: ApiRequest) => Promise<ApiResponse>;
}

const BADGE: Record<ServerStatus, { text: string; className: string }> = {
  idle: { text: 'Not started', className: 'bg-raised text-muted' },
  starting: { text: 'Starting…', className: 'animate-pulse bg-info/15 text-info' },
  running: { text: '● Running', className: 'bg-success/15 text-success' },
  stopped: { text: 'Stopped', className: 'bg-raised text-muted' },
};

// The 🖥 Server tab: start/stop the project's server, try it in a preview and read its log
export function ServerPanel(props: Props) {
  const { framework, status, runningFramework, previewUrl, log, onStart, onStop } = props;
  const [view, setView] = useState<'preview' | 'api'>('preview');
  const [path, setPath] = useState('/');
  const [reloads, setReloads] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const logSize = useStoredSize('server-log', 160, 48, 600);
  const badge = BADGE[status];
  const busy = status === 'starting' || status === 'running';
  const pageUrl = previewUrl ? previewUrl.replace(/\/$/, '') + (path.startsWith('/') ? path : `/${path}`) : null;

  // Keep the newest log lines in view
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-xs">
        <span className="font-semibold">{runningFramework ?? framework}</span>
        <span className={`rounded px-2 py-0.5 ${badge.className}`}>{badge.text}</span>
        <span role="radiogroup" aria-label="View" className="flex overflow-hidden rounded border border-line-strong">
          {(['preview', 'api'] as const).map((option) => (
            <button
              key={option}
              role="radio"
              aria-checked={view === option}
              onClick={() => setView(option)}
              className={`px-2 py-0.5 ${view === option ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-raised'}`}
            >
              {option === 'preview' ? 'Preview' : 'API'}
            </button>
          ))}
        </span>
        <span className="ml-auto flex gap-2">
          <button
            onClick={onStart}
            disabled={status === 'starting'}
            className="rounded bg-accent px-2.5 py-1 font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
            title="Start the server with the latest code"
          >
            {busy ? '↻ Restart' : '▶ Start server'}
          </button>
          {busy && (
            <button onClick={onStop} className="rounded border border-line-strong px-2.5 py-1 hover:bg-raised">
              ■ Stop
            </button>
          )}
        </span>
      </div>

      {view === 'api' ? (
        <ApiTester files={props.files} running={status === 'running'} send={props.onSend} />
      ) : pageUrl ? (
        <>
          <form
            className="flex gap-1 border-b border-line px-2 py-1.5 text-xs"
            onSubmit={(event) => {
              event.preventDefault();
              setReloads((count) => count + 1);
            }}
          >
            <span className="self-center font-mono text-subtle">GET</span>
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              aria-label="Path to open"
              spellCheck={false}
              className="min-w-0 flex-1 rounded border border-line bg-app px-2 py-0.5 font-mono outline-none focus:border-accent"
            />
            <button className="rounded px-2 text-muted hover:bg-raised hover:text-fg" title="Load this path">
              ⟳
            </button>
            <a href={pageUrl} target="_blank" rel="noreferrer" className="self-center px-1 text-muted hover:text-fg" title="Open in a new tab">
              ↗
            </a>
          </form>
          <iframe
            key={`${pageUrl}#${reloads}`}
            title="Server preview"
            src={pageUrl}
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
            className="min-h-40 w-full flex-1 bg-white"
          />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-subtle">
          {status === 'starting'
            ? 'Starting the server… the first start of a project can take a few seconds.'
            : `Press ▶ Start server to run this ${framework} project. Your app should listen on port 8080 (PORT / server.port / ASPNETCORE_URLS are set for you).`}
        </div>
      )}

      <ResizeHandle direction="y" label="Resize the server log" onResize={(delta) => logSize.resize(-delta)} onReset={logSize.reset} />
      <div
        ref={logRef}
        className="code-text-small shrink-0 overflow-auto bg-app px-3 py-2 font-mono"
        style={{ height: logSize.size }}
      >
        {log ? <AnsiText text={log} className="text-fg" /> : <p className="text-subtle">The server log appears here.</p>}
      </div>
    </section>
  );
}
