import http from 'node:http';
import { PORT } from './frameworks.js';
import { previews } from './session.js';

const PREFIX = /^\/preview\/([0-9a-f]{24})(\/.*)?$/;

// Which running server a request is for, and the path to ask it for:
//   /preview/<id>/api/todos   → <id>, /api/todos
//   /api/todos (from a page under /preview/<id>/, e.g. fetch('/api/todos')) → <id> from the Referer
export function route(url: string, referer: string | undefined): { id: string; path: string } | null {
  const direct = PREFIX.exec(url.split('?')[0]);
  if (direct) return { id: direct[1], path: url.slice(`/preview/${direct[1]}`.length) || '/' };
  const from = referer ? PREFIX.exec(new URL(referer, 'http://x').pathname) : null;
  return from ? { id: from[1], path: url } : null;
}

// The Bytebox session cookie never reaches a user's server, and a server can't set it
export function withoutSessionCookie(cookie: string | undefined): string | undefined {
  const kept = (cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith('bytebox_'));
  return kept.length > 0 ? kept.join('; ') : undefined;
}

export function proxy(req: http.IncomingMessage, res: http.ServerResponse) {
  const target = route(req.url ?? '/', req.headers.referer);
  const host = target ? previews.get(target.id) : undefined;
  if (!target || !host) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('This server is not running. Start it again in Bytebox.');
    return;
  }

  const headers: http.OutgoingHttpHeaders = { ...req.headers, host: `localhost:${PORT}` };
  const cookie = withoutSessionCookie(req.headers.cookie);
  if (cookie) headers.cookie = cookie;
  else delete headers.cookie;
  delete headers.authorization;
  const upstream = http.request({ host, port: PORT, method: req.method, path: target.path, headers }, (response) => {
    const responseHeaders = { ...response.headers };
    const setCookie = response.headers['set-cookie']?.filter((cookie) => !cookie.trim().startsWith('bytebox_'));
    if (setCookie?.length) responseHeaders['set-cookie'] = setCookie;
    else delete responseHeaders['set-cookie'];
    res.writeHead(response.statusCode ?? 502, responseHeaders);
    response.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('The server did not answer.');
  });
  req.pipe(upstream);
}
