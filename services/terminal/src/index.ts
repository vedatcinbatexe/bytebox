import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'node:http';
import { getUserId } from './auth.js';
import { openSession, removeExpiredContainers } from './session.js';

// Set during the handshake once the session cookie is verified
const userIds = new WeakMap<IncomingMessage, string>();

const port = Number(process.env.PORT ?? 4100);
// Only the Bytebox web portal may open terminals (stops other websites from using a visitor's browser)
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000').split(',');

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'terminal' }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({
  server,
  maxPayload: 1024 * 1024,
  // Only the web portal, and only signed-in users
  verifyClient: (
    { origin, req }: { origin: string; req: IncomingMessage },
    accept: (ok: boolean, code?: number) => void,
  ) => {
    if (!allowedOrigins.includes(origin)) return accept(false, 403);
    getUserId(req).then((userId) => {
      if (!userId) return accept(false, 401);
      userIds.set(req, userId);
      accept(true);
    });
  },
});

wss.on('connection', (ws, req) => {
  openSession(ws, userIds.get(req)!);
});

// Sessions don't survive a restart, so clean up containers from before; then sweep every minute
await removeExpiredContainers(true);
setInterval(() => void removeExpiredContainers(), 60_000);

server.listen(port, () => {
  console.log(`Terminal service listening on ws://localhost:${port}`);
});
