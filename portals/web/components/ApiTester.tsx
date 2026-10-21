'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ResizeHandle } from './ResizeHandle';
import { highlightJson, type JsonToken } from '@/lib/jsonHighlight';
import { examplePath, findRoutes } from '@/lib/routes';
import { useStoredSize } from '@/lib/useStoredSize';
import type { ApiRequest, ApiResponse } from '@/lib/useDevServer';

interface Props {
  files: Record<string, string>; // to list the endpoints found in the code
  running: boolean;
  send: (request: ApiRequest) => Promise<ApiResponse>;
}

interface Header {
  name: string;
  value: string;
}

interface HistoryItem {
  request: ApiRequest;
  status: number;
  timeMs: number;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
// Method badge colors (text on a light background of the same color)
const METHOD_STYLE: Record<string, string> = {
  GET: 'bg-success/15 text-success',
  POST: 'bg-warning/15 text-warning',
  PUT: 'bg-info/15 text-info',
  PATCH: 'bg-info/15 text-info',
  DELETE: 'bg-danger/15 text-danger',
};
const JSON_COLORS: Record<JsonToken['kind'], string> = {
  key: 'text-info',
  string: 'text-success',
  number: 'text-warning',
  literal: 'text-accent',
  plain: 'text-muted',
};
const HAS_BODY = (method: string) => !['GET', 'HEAD', 'DELETE'].includes(method);

function statusStyle(status: number): string {
  if (status >= 200 && status < 300) return 'bg-success/15 text-success ring-success/30';
  if (status >= 300 && status < 400) return 'bg-info/15 text-info ring-info/30';
  if (status >= 400 && status < 500) return 'bg-warning/15 text-warning ring-warning/30';
  return 'bg-danger/15 text-danger ring-danger/30';
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

// JSON bodies are indented (and colored); anything else is shown as it is
function prettyJson(body: string): string | null {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return null;
  }
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span className={`rounded px-1.5 py-px font-mono text-[10px] font-bold ${METHOD_STYLE[method] ?? 'bg-raised text-muted'}`}>
      {method}
    </span>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-2.5 py-1.5 font-medium transition-colors ${
        active ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}

// A small Postman: send any request to the running server and read the answer
export function ApiTester({ files, running, send }: Props) {
  const routes = useMemo(() => findRoutes(files), [files]);
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState(() => (routes[0] ? examplePath(routes[0].path) : '/'));
  const [body, setBody] = useState('{\n  "title": "Hello from the API tester"\n}');
  const [headers, setHeaders] = useState<Header[]>([{ name: 'Content-Type', value: 'application/json' }]);
  const [requestTab, setRequestTab] = useState<'body' | 'headers'>('body');
  const [responseTab, setResponseTab] = useState<'body' | 'headers'>('body');
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const requestSize = useStoredSize('api-request', 230, 120, 640);
  const historyRef = useRef<HTMLDivElement>(null);
  const headerCount = headers.filter((header) => header.name.trim()).length;
  const pretty = response?.body ? prettyJson(response.body) : null;

  // Close the history list when clicking elsewhere
  useEffect(() => {
    if (!historyOpen) return;
    const close = (event: MouseEvent) => {
      if (!historyRef.current?.contains(event.target as Node)) setHistoryOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [historyOpen]);

  async function submit() {
    if (sending || !running) return;
    const request: ApiRequest = {
      method,
      path: path.startsWith('/') ? path : `/${path}`,
      headers: Object.fromEntries(headers.filter((header) => header.name.trim()).map((header) => [header.name.trim(), header.value])),
      body: HAS_BODY(method) ? body : '',
    };
    setSending(true);
    const answer = await send(request);
    setSending(false);
    setResponse(answer);
    setResponseTab('body');
    if (!answer.error) {
      setHistory((current) => [{ request, status: answer.status, timeMs: answer.timeMs }, ...current].slice(0, 15));
    }
  }

  function restore(request: ApiRequest) {
    setMethod(request.method);
    setPath(request.path);
    if (request.body) setBody(request.body);
    setHeaders(Object.entries(request.headers).map(([name, value]) => ({ name, value })));
    setHistoryOpen(false);
  }

  async function copyBody() {
    await navigator.clipboard.writeText(pretty ?? response?.body ?? '').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col text-xs">
      {/* ---------- Request ---------- */}
      <div className="flex shrink-0 flex-col" style={{ height: requestSize.size }}>
        {/* Method + path + send, as one bar */}
        <form
          className="flex items-stretch gap-2 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-md border border-line-strong bg-app focus-within:border-accent">
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              aria-label="Method"
              className={`border-r border-line-strong px-2 font-mono text-[11px] font-bold outline-none ${METHOD_STYLE[method]}`}
            >
              {METHODS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit();
              }}
              aria-label="Path"
              spellCheck={false}
              placeholder="/api/…"
              className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 font-mono text-[12px] outline-none"
            />
          </div>
          <button
            disabled={sending || !running}
            title={running ? 'Send (⌘/Ctrl + Enter)' : 'Start the server first'}
            className="rounded-md bg-accent px-3.5 font-semibold text-accent-fg shadow-sm transition hover:bg-accent-hover disabled:opacity-40"
          >
            {sending ? 'Sending…' : 'Send ➤'}
          </button>
          <div ref={historyRef} className="relative">
            <button
              type="button"
              onClick={() => setHistoryOpen((open) => !open)}
              disabled={history.length === 0}
              title="Recent requests"
              className="h-full rounded-md border border-line-strong px-2 text-muted hover:bg-raised hover:text-fg disabled:opacity-40"
            >
              🕘 {history.length > 0 && history.length}
            </button>
            {historyOpen && (
              <ul className="absolute top-full right-0 z-20 mt-1 w-72 overflow-hidden rounded-md border border-line bg-panel py-1 shadow-xl">
                {history.map((item, index) => (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={() => restore(item.request)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-raised"
                    >
                      <MethodBadge method={item.request.method} />
                      <span className="min-w-0 flex-1 truncate font-mono">{item.request.path}</span>
                      <span className={`font-mono ${item.status < 400 ? 'text-success' : 'text-danger'}`}>{item.status}</span>
                      <span className="text-subtle">{item.timeMs} ms</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>

        {/* Endpoints found in the code */}
        {routes.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-2 pb-2">
            <span className="shrink-0 text-[10px] font-semibold tracking-wider text-subtle uppercase">Endpoints</span>
            {routes.map((route) => (
              <button
                key={`${route.method} ${route.path}`}
                onClick={() => {
                  setMethod(route.method);
                  setPath(examplePath(route.path));
                }}
                title={`Found in ${route.file}`}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-app py-0.5 pr-2.5 pl-1 font-mono whitespace-nowrap transition hover:border-accent"
              >
                <MethodBadge method={route.method} />
                {route.path}
              </button>
            ))}
          </div>
        )}

        {/* Body / headers */}
        <div className="flex shrink-0 border-y border-line bg-panel px-1">
          <Tab active={requestTab === 'body'} onClick={() => setRequestTab('body')}>
            Body
          </Tab>
          <Tab active={requestTab === 'headers'} onClick={() => setRequestTab('headers')}>
            Headers
            {headerCount > 0 && <span className="ml-1 rounded-full bg-raised px-1.5 text-[10px] text-muted">{headerCount}</span>}
          </Tab>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-app">
          {requestTab === 'body' ? (
            HAS_BODY(method) ? (
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                spellCheck={false}
                aria-label="Request body"
                className="code-text-small h-full w-full resize-none bg-transparent px-3 py-2 font-mono outline-none"
              />
            ) : (
              <p className="px-3 py-3 text-subtle">{method} requests are sent without a body.</p>
            )
          ) : (
            <div className="space-y-1.5 p-2">
              {headers.map((header, index) => (
                <div key={index} className="flex gap-1.5">
                  <input
                    value={header.name}
                    placeholder="Header"
                    aria-label="Header name"
                    onChange={(event) =>
                      setHeaders(headers.map((other, i) => (i === index ? { ...other, name: event.target.value } : other)))
                    }
                    className="w-2/5 rounded border border-line bg-panel px-2 py-1 font-mono outline-none focus:border-accent"
                  />
                  <input
                    value={header.value}
                    placeholder="Value"
                    aria-label="Header value"
                    onChange={(event) =>
                      setHeaders(headers.map((other, i) => (i === index ? { ...other, value: event.target.value } : other)))
                    }
                    className="min-w-0 flex-1 rounded border border-line bg-panel px-2 py-1 font-mono outline-none focus:border-accent"
                  />
                  <button
                    onClick={() => setHeaders(headers.filter((_, i) => i !== index))}
                    aria-label="Remove header"
                    className="rounded px-1.5 text-muted hover:bg-raised hover:text-danger"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => setHeaders([...headers, { name: '', value: '' }])}
                className="rounded border border-dashed border-line-strong px-2 py-0.5 text-muted hover:text-fg"
              >
                + Add header
              </button>
            </div>
          )}
        </div>
      </div>

      <ResizeHandle
        direction="y"
        label="Resize the request and response"
        onResize={(delta) => requestSize.resize(delta)}
        onReset={requestSize.reset}
      />

      {/* ---------- Response ---------- */}
      <div className="flex min-h-24 flex-1 flex-col">
        {!response ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 p-4 text-center text-subtle">
            <span className="text-2xl">📡</span>
            <p>{running ? 'Pick an endpoint or type a path, then press Send.' : 'Start the server, then send requests to it here.'}</p>
          </div>
        ) : response.error ? (
          <p className="m-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-danger">{response.error}</p>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
              <span className={`rounded-full px-2 py-0.5 font-mono font-semibold ring-1 ${statusStyle(response.status)}`}>
                {response.status} {response.statusText}
              </span>
              <span className="text-muted" title="Time">
                ⏱ {response.timeMs} ms
              </span>
              <span className="text-muted" title="Size">
                {formatSize(response.sizeBytes)}
              </span>
              <span className="ml-auto flex items-center">
                <Tab active={responseTab === 'body'} onClick={() => setResponseTab('body')}>
                  Body
                </Tab>
                <Tab active={responseTab === 'headers'} onClick={() => setResponseTab('headers')}>
                  Headers
                </Tab>
                <button onClick={copyBody} className="ml-1 rounded px-1.5 py-0.5 text-muted hover:bg-raised hover:text-fg" title="Copy the body">
                  {copied ? '✓' : '⧉'}
                </button>
              </span>
            </div>
            {responseTab === 'body' ? (
              <pre className="code-text-small min-h-0 flex-1 overflow-auto bg-app px-3 py-2 font-mono whitespace-pre-wrap">
                {!response.body ? (
                  <span className="text-subtle">(empty body)</span>
                ) : pretty ? (
                  highlightJson(pretty).map((token, index) => (
                    <span key={index} className={JSON_COLORS[token.kind]}>
                      {token.text}
                    </span>
                  ))
                ) : (
                  <span className="text-fg">{response.body}</span>
                )}
                {response.truncated && <span className="block text-warning">… cut off at 1 MB</span>}
              </pre>
            ) : (
              <dl className="code-text-small min-h-0 flex-1 divide-y divide-line overflow-auto bg-app font-mono">
                {Object.entries(response.headers).map(([name, value]) => (
                  <div key={name} className="flex gap-3 px-3 py-1">
                    <dt className="w-2/5 shrink-0 truncate text-info">{name}</dt>
                    <dd className="min-w-0 break-all text-fg">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </div>
    </div>
  );
}
