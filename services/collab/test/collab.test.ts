import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { SignJWT } from 'jose';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// A fake project service: one project owned by alice, bob is a collaborator, carol is not
const saves: { userId: string; body: { title: string; files: { path: string; content: string }[] } }[] = [];
const project = {
  slug: 'Abc12345',
  ownerId: 'alice',
  title: 'Shared',
  files: [{ path: 'main.py', content: 'print(1)\n' }],
  folders: ['lib'],
  stdin: '',
  args: '',
};
const fakeProjects = createServer((req, res) => {
  const userId = String(req.headers['x-user-id']);
  if (req.method === 'GET' && req.url === `/projects/${project.slug}`) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ...project, canEdit: userId === 'alice' || userId === 'bob' }));
  }
  if (req.method === 'PUT') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      saves.push({ userId, body: JSON.parse(body) });
      res.writeHead(200).end('{}');
    });
    return;
  }
  res.writeHead(404).end();
});

const SECRET = 'test-secret-that-is-long-enough-for-hs256';
let url = '';

before(async () => {
  await new Promise<void>((resolve) => fakeProjects.listen(0, resolve));
  process.env.PROJECT_URL = `http://localhost:${(fakeProjects.address() as AddressInfo).port}`;
  process.env.JWT_SECRET = SECRET;
  process.env.PORT = '4299';
  process.env.SAVE_AFTER_MS = '100';
  await import('../src/index.ts');
  url = 'ws://localhost:4299';
});

after(() => {
  fakeProjects.close();
  setTimeout(() => process.exit(0), 50); // the collab server keeps running otherwise
});

async function cookieFor(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer('bytebox-identity')
    .sign(new TextEncoder().encode(SECRET));
  return `bytebox_session=${token}`;
}

// A browser-like client: the y-websocket provider with the session cookie and our origin
async function connect(userId: string, origin = 'http://localhost:3000') {
  const cookie = await cookieFor(userId);
  class BrowserSocket extends WebSocket {
    constructor(address: string, protocols?: string | string[]) {
      super(address, protocols, { headers: { origin, cookie } });
    }
  }
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(url, project.slug, doc, {
    WebSocketPolyfill: BrowserSocket as unknown as typeof globalThis.WebSocket,
    maxBackoffTime: 100,
  });
  return { doc, provider };
}

function waitFor(check: () => boolean, ms = 3000) {
  return new Promise<void>((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (check()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - start > ms) {
        clearInterval(timer);
        reject(new Error('timed out'));
      }
    }, 20);
  });
}

test('two editors share the files, see each other and the result is saved as the owner', async () => {
  const alice = await connect('alice');
  const bob = await connect('bob');
  const text = (doc: Y.Doc) => doc.getMap<Y.Text>('files').get('main.py')?.toString();
  await waitFor(() => text(alice.doc) === 'print(1)\n' && text(bob.doc) === 'print(1)\n');
  assert.equal(bob.doc.getMap('meta').get('title'), 'Shared');

  // Typing at the same time ends up the same on both sides
  alice.doc.getMap<Y.Text>('files').get('main.py')!.insert(0, '# alice\n');
  bob.doc.getMap<Y.Text>('files').get('main.py')!.insert(9, 'print(2)\n');
  await waitFor(() => text(alice.doc) === text(bob.doc) && text(alice.doc)!.includes('# alice') && text(alice.doc)!.includes('print(2)'));

  // Cursors and names travel through awareness
  alice.provider.awareness.setLocalStateField('user', { name: 'Alice' });
  await waitFor(() => [...bob.provider.awareness.getStates().values()].some((state) => state.user?.name === 'Alice'));

  await waitFor(() => saves.some((save) => save.body.files[0].content.includes('# alice')));
  const last = saves[saves.length - 1];
  assert.equal(last.userId, 'alice'); // the server saves as the owner
  assert.deepEqual(last.body.files.map((file) => file.path), ['main.py']);

  alice.provider.destroy();
  bob.provider.destroy();
});

test('people who may not edit, and other websites, are turned away', async () => {
  for (const [userId, origin] of [
    ['carol', 'http://localhost:3000'],
    ['alice', 'https://evil.example'],
  ]) {
    const status = await new Promise<number>(async (resolve) => {
      const socket = new WebSocket(`${url}/${project.slug}`, { headers: { origin, cookie: await cookieFor(userId) } });
      socket.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      socket.on('open', () => resolve(101));
    });
    assert.equal(status, 403, `${userId} from ${origin}`);
  }
});
