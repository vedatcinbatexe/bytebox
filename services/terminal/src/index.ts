import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { openSession, removeExpiredContainers } from './session.js';

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
  verifyClient: ({ origin }: { origin: string }, accept: (ok: boolean, code?: number) => void) =>
    accept(allowedOrigins.includes(origin), 403),
});

wss.on('connection', (ws, req) => {
  openSession(ws, req.socket.remoteAddress ?? 'unknown');
});

// Sessions don't survive a restart, so clean up containers from before; then sweep every minute
await removeExpiredContainers(true);
setInterval(() => void removeExpiredContainers(), 60_000);

server.listen(port, () => {
  console.log(`Terminal service listening on ws://localhost:${port}`);
});
