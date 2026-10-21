import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer } from 'ws';
import { getUserId } from './auth.js';
import { proxy } from './proxy.js';
import { openSession, removeLeftovers } from './session.js';

// Server projects (Express, Spring Boot, ASP.NET Core): start one in a container and see it through
// the preview proxy. WebSocket /session controls the server; everything else is the preview.

const port = Number(process.env.PORT ?? 4300);
// Only the Bytebox web portal may start servers (stops other websites from using a visitor's browser)
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000').split(',');

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'devserver' }));
    return;
  }
  // A bad request to one preview must never take the whole service down
  try {
    proxy(req, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(502);
    res.end();
  }
});

const userIds = new WeakMap<IncomingMessage, string>();
const wss = new WebSocketServer({
  server,
  path: '/session',
  maxPayload: 1024 * 1024,
  verifyClient: (
    { origin, req }: { origin: string; req: IncomingMessage },
    accept: (ok: boolean, code?: number) => void,
  ) => {
    if (!allowedOrigins.includes(origin)) return accept(false, 403);
    void getUserId(req).then((userId) => {
      if (!userId) return accept(false, 401);
      userIds.set(req, userId);
      accept(true);
    });
  },
});
wss.on('connection', (ws, req) => openSession(ws, userIds.get(req)!));

// Servers don't survive a restart of this service
await removeLeftovers();

server.listen(port, () => console.log(`Devserver listening on http://localhost:${port}`));
