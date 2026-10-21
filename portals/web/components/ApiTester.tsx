'use client';

import { useMemo, useState } from 'react';
import { examplePath, findRoutes } from '@/lib/routes';
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
const METHOD_COLORS: Record<string, string> = {
  GET: 'text-success',
  POST: 'text-warning',
  PUT: 'text-info',
  PATCH: 'text-info',
  DELETE: 'text-danger',
};
const SEND_BODY = (method: string) => !['GET', 'HEAD', 'DELETE'].includes(method);

function statusClass(status: number): string {
  if (status >= 200 && status < 300) return 'bg-success/15 text-success';
  if (status >= 300 && status < 400) return 'bg-info/15 text-info';
  if (status >= 400 && status < 500) return 'bg-warning/15 text-warning';
  return 'bg-danger/15 text-danger';
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

// JSON bodies are shown indented; anything else as it is
function prettyBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
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

  async function submit() {
    if (sending) return;
    const request: ApiRequest = {
      method,
      path: path.startsWith('/') ? path : `/${path}`,
      headers: Object.fromEntries(headers.filter((header) => header.name.trim()).map((header) => [header.name.trim(), header.value])),
      body: SEND_BODY(method) ? body : '',
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
  }

  const TAB = (active: boolean) =>
    `border-b-2 px-2 py-1 ${active ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto text-xs">
      {/* Request line */}
      <form
        className="flex gap-1 border-b border-line p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          aria-label="Method"
          className={`rounded border border-line-strong bg-raised px-1 font-mono font-semibold ${METHOD_COLORS[method]}`}
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
          className="min-w-0 flex-1 rounded border border-line-strong bg-app px-2 py-1 font-mono outline-none focus:border-accent"
        />
        <button
          disabled={sending || !running}
          title={running ? 'Send (⌘/Ctrl + Enter)' : 'Start the server first'}
          className="rounded bg-accent px-3 font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
        >
          {sending ? '…' : 'Send'}
        </button>
      </form>

      {/* Endpoints found in the code */}
      {routes.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-line px-2 py-1.5">
          {routes.map((route) => (
            <button
              key={`${route.method} ${route.path}`}
              onClick={() => {
                setMethod(route.method);
                setPath(examplePath(route.path));
              }}
              title={`Found in ${route.file}`}
              className="rounded border border-line px-1.5 py-0.5 font-mono hover:border-accent"
            >
              <span className={`font-semibold ${METHOD_COLORS[route.method] ?? ''}`}>{route.method}</span> {route.path}
            </button>
          ))}
        </div>
      )}

      {/* Request body / headers */}
      <div className="border-b border-line">
        <div className="flex gap-1 px-2 pt-1">
          <button onClick={() => setRequestTab('body')} className={TAB(requestTab === 'body')}>
            Body
          </button>
          <button onClick={() => setRequestTab('headers')} className={TAB(requestTab === 'headers')}>
            Headers ({headers.filter((header) => header.name.trim()).length})
          </button>
        </div>
        {requestTab === 'body' ? (
          SEND_BODY(method) ? (
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              spellCheck={false}
              rows={5}
              aria-label="Request body"
              className="w-full resize-y bg-app px-2 py-1.5 font-mono outline-none"
            />
          ) : (
            <p className="px-2 py-2 text-subtle">{method} requests have no body.</p>
          )
        ) : (
          <div className="space-y-1 p-2">
            {headers.map((header, index) => (
              <div key={index} className="flex gap-1">
                <input
                  value={header.name}
                  placeholder="Header"
                  aria-label="Header name"
                  onChange={(event) =>
                    setHeaders(headers.map((other, i) => (i === index ? { ...other, name: event.target.value } : other)))
                  }
                  className="w-2/5 rounded border border-line bg-app px-1.5 py-0.5 font-mono outline-none focus:border-accent"
                />
                <input
                  value={header.value}
                  placeholder="Value"
                  aria-label="Header value"
                  onChange={(event) =>
                    setHeaders(headers.map((other, i) => (i === index ? { ...other, value: event.target.value } : other)))
                  }
                  className="min-w-0 flex-1 rounded border border-line bg-app px-1.5 py-0.5 font-mono outline-none focus:border-accent"
                />
                <button
                  onClick={() => setHeaders(headers.filter((_, i) => i !== index))}
                  aria-label="Remove header"
                  className="px-1 text-muted hover:text-danger"
                >
                  ✕
                </button>
              </div>
            ))}
            <button onClick={() => setHeaders([...headers, { name: '', value: '' }])} className="text-muted hover:text-fg">
              + Header
            </button>
          </div>
        )}
      </div>

      {/* Response */}
      <div className="flex min-h-32 flex-1 flex-col">
        {!response ? (
          <p className="p-3 text-subtle">
            {running ? 'Pick an endpoint or type a path, then Send.' : 'Start the server, then send requests to it here.'}
          </p>
        ) : response.error ? (
          <p className="m-2 rounded border border-danger/30 bg-danger/10 px-2 py-1.5 text-danger">{response.error}</p>
        ) : (
          <>
            <div className="flex items-center gap-2 px-2 pt-1.5">
              <span className={`rounded px-1.5 py-0.5 font-mono font-semibold ${statusClass(response.status)}`}>
                {response.status} {response.statusText}
              </span>
              <span className="text-muted">{response.timeMs} ms</span>
              <span className="text-muted">{formatSize(response.sizeBytes)}</span>
              <span className="ml-auto flex gap-1">
                <button onClick={() => setResponseTab('body')} className={TAB(responseTab === 'body')}>
                  Body
                </button>
                <button onClick={() => setResponseTab('headers')} className={TAB(responseTab === 'headers')}>
                  Headers
                </button>
              </span>
            </div>
            {responseTab === 'body' ? (
              <pre className="min-h-0 flex-1 overflow-auto bg-app p-2 font-mono whitespace-pre-wrap text-fg">
                {response.body ? prettyBody(response.body) : <span className="text-subtle">(empty body)</span>}
                {response.truncated && <span className="block text-warning">… cut off at 1 MB</span>}
              </pre>
            ) : (
              <dl className="min-h-0 flex-1 overflow-auto bg-app p-2 font-mono">
                {Object.entries(response.headers).map(([name, value]) => (
                  <div key={name} className="flex gap-2">
                    <dt className="shrink-0 text-muted">{name}:</dt>
                    <dd className="break-all text-fg">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </div>

      {/* Recent requests */}
      {history.length > 0 && (
        <div className="border-t border-line px-2 py-1.5">
          <p className="mb-1 font-semibold tracking-wide text-muted uppercase">History</p>
          <ul>
            {history.map((item, index) => (
              <li key={index}>
                <button
                  onClick={() => restore(item.request)}
                  className="flex w-full gap-2 rounded px-1 py-0.5 text-left font-mono hover:bg-raised"
                >
                  <span className={`w-12 shrink-0 font-semibold ${METHOD_COLORS[item.request.method] ?? ''}`}>
                    {item.request.method}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.request.path}</span>
                  <span className={item.status < 400 ? 'text-success' : 'text-danger'}>{item.status}</span>
                  <span className="text-subtle">{item.timeMs} ms</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
