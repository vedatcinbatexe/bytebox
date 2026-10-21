import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { getUserId } from './auth.js';
import { fetchProject } from './projects.js';
import { Room } from './room.js';

// Live collaboration: everyone editing a project shares one Yjs document through this service.
// Connect to ws://host:4200/<slug> (that's how the y-websocket client names rooms).

const port = Number(process.env.PORT ?? 4200);
// Only the Bytebox web portal may connect (stops other websites from using a visitor's browser)
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000').split(',');
const SLUG = /^\/([A-Za-z0-9]{8})$/;

// Rooms that are open or being opened (loading the project takes a moment)
const rooms = new Map<string, Promise<Room>>();

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'collab', rooms: rooms.size }));
    return;
  }
  res.writeHead(404).end();
});

// Set during the handshake: who connects to which project
const accepted = new WeakMap<IncomingMessage, { userId: string; slug: string }>();

const wss = new WebSocketServer({
  server,
  maxPayload: 1024 * 1024,
  verifyClient: (
    { origin, req }: { origin: string; req: IncomingMessage },
    accept: (ok: boolean, code?: number) => void,
  ) => {
    if (!allowedOrigins.includes(origin)) return accept(false, 403);
    const slug = SLUG.exec((req.url ?? '').split('?')[0])?.[1];
    if (!slug) return accept(false, 404);
    void (async () => {
      const userId = await getUserId(req);
      if (!userId) return accept(false, 401);
      // Only the owner and invited collaborators may join
      const project = await fetchProject(slug, userId).catch(() => null);
      if (!project?.canEdit) return accept(false, 403);
      accepted.set(req, { userId, slug });
      accept(true);
    })();
  },
});

function openRoom(slug: string, userId: string): Promise<Room> {
  let room = rooms.get(slug);
  if (!room) {
    room = (async () => {
      const project = await fetchProject(slug, userId);
      if (!project?.ownerId) throw new Error(`Project ${slug} not found`);
      return new Room(slug, project.ownerId, project, () => {
        rooms.delete(slug);
        void room!.then((open) => open.destroy());
        console.log(`Closed room ${slug}`);
      });
    })();
    rooms.set(slug, room);
    room.catch(() => rooms.delete(slug));
  }
  return room;
}

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const { userId, slug } = accepted.get(req)!;
  // Messages that arrive while the room is still loading are handled once it's ready
  const early: Buffer[] = [];
  const keep = (data: Buffer) => early.push(data);
  ws.on('message', keep);
  openRoom(slug, userId)
    .then((room) => {
      ws.off('message', keep);
      room.join(ws);
      for (const data of early) ws.emit('message', data);
      console.log(`${userId} joined ${slug} (${room.size} connected)`);
    })
    .catch((error) => {
      console.error(error);
      ws.close(1011, 'Could not open the project');
    });
});

// Save open rooms before stopping
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await Promise.all([...rooms.values()].map((room) => room.then((open) => open.saveNow()).catch(() => {})));
    process.exit(0);
  });
}

server.listen(port, () => {
  console.log(`Collab service listening on ws://localhost:${port}`);
});
