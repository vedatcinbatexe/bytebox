import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { hostname } from 'node:os';
import { PassThrough } from 'node:stream';
import Docker from 'dockerode';
import type { WebSocket } from 'ws';
import { checkFiles, packFiles } from './files.js';
import { PORT, detectFramework, type ProjectFile } from './frameworks.js';
import { SlidingWindowLimiter } from './limits.js';

export const docker = new Docker();
export const LABEL = 'bytebox-devserver';

const PUBLIC_URL = process.env.PUBLIC_URL ?? 'http://localhost:4300';
const MAX_MS = Number(process.env.MAX_MINUTES ?? 30) * 60_000;
const READY_TIMEOUT_MS = 120_000;
const MAX_LOG_BYTES = 2 * 1024 * 1024; // per session; a server that floods its log is stopped
const USER = '65534:65534'; // nobody

// Messages between the browser and this service (JSON over the WebSocket)
export type ClientMessage = { type: 'start'; files: ProjectFile[] } | { type: 'stop' };
export type ServerMessage =
  | { type: 'status'; status: 'starting' | 'running' | 'stopped'; framework?: string; previewUrl?: string }
  | { type: 'log'; data: string }
  | { type: 'error'; message: string };

// Where the preview proxy sends requests: preview id → container address
export const previews = new Map<string, string>();

// One server per user; a new one replaces the old one
const sessions = new Map<string, ServerSession>();
const starts = new SlidingWindowLimiter(Number(process.env.STARTS_PER_HOUR ?? 60), 60 * 60_000);

export function openSession(ws: WebSocket, userId: string) {
  sessions.get(userId)?.close('The server was opened in another tab');
  const session = new ServerSession(ws, userId);
  sessions.set(userId, session);
  ws.on('close', () => {
    void session.stop();
    if (sessions.get(userId) === session) sessions.delete(userId);
  });
}

class ServerSession {
  private container: Docker.Container | null = null;
  private network: Docker.Network | null = null;
  private previewId: string | null = null;
  private maxTimer: NodeJS.Timeout | null = null;
  private logBytes = 0;
  private queue: Promise<void> = Promise.resolve(); // one message at a time, in order

  constructor(
    private ws: WebSocket,
    private userId: string,
  ) {
    ws.on('message', (raw) => {
      this.queue = this.queue
        .then(() => this.handle(raw.toString()))
        .catch((error) => {
          console.error(error);
          this.send({ type: 'error', message: 'Something went wrong with the server.' });
          return this.stop();
        });
    });
  }

  private async handle(raw: string) {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      return this.send({ type: 'error', message: 'Invalid message' });
    }
    if (message.type === 'stop') return this.stop();
    if (message.type === 'start') {
      await this.stop(); // restarting = stop, then start with the latest files
      return this.start(message.files);
    }
  }

  private async start(files: ProjectFile[]) {
    const problem = checkFiles(files);
    const framework = problem ? { error: problem } : detectFramework(files);
    if ('error' in framework) return this.send({ type: 'error', message: framework.error });
    if (!starts.tryTake(this.userId)) {
      return this.send({ type: 'error', message: 'Too many server starts in the last hour. Please try again later.' });
    }

    this.send({ type: 'status', status: 'starting', framework: framework.name });
    for (const warning of framework.warnings) this.log(`⚠ ${warning}\n`);
    this.log(`▶ Starting ${framework.name}…\n`);

    // A private network for this server only: no internet, no other servers
    const id = randomBytes(12).toString('hex');
    this.network = await docker.createNetwork({ Name: `bytebox-server-${id}`, Internal: true, Labels: { [LABEL]: '1' } });
    // This service joins it to reach the server (when it runs in Docker, as with docker compose)
    await this.network.connect({ Container: hostname() }).catch(() => {});

    this.container = await docker.createContainer({
      Image: framework.image,
      // Waits for the files (copied in after the start, into the tmpfs), then runs the server
      Cmd: ['sh', '-c', `while [ ! -f .bytebox-ready ]; do sleep 0.1; done; ${framework.script}`],
      User: USER,
      WorkingDir: '/workspace',
      Env: [
        'HOME=/tmp',
        `PORT=${PORT}`,
        `SERVER_PORT=${PORT}`,
        `ASPNETCORE_URLS=http://0.0.0.0:${PORT}`,
        'ASPNETCORE_ENVIRONMENT=Development',
        'DOTNET_NOLOGO=1',
        'DOTNET_CLI_TELEMETRY_OPTOUT=1',
        'NUGET_PACKAGES=/tmp/nuget',
        'NODE_ENV=development',
      ],
      Labels: { [LABEL]: String(Date.now()) },
      HostConfig: {
        NetworkMode: `bytebox-server-${id}`,
        ReadonlyRootfs: true,
        Tmpfs: {
          '/workspace': 'rw,exec,nosuid,size=128m,mode=1777',
          '/tmp': 'rw,exec,nosuid,size=256m,mode=1777',
        },
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        Memory: framework.memoryMb * 1024 * 1024,
        MemorySwap: framework.memoryMb * 1024 * 1024,
        NanoCpus: 1_000_000_000,
        PidsLimit: 256,
      },
    });

    // Server output → browser (attach before starting so nothing is missed)
    const stream = await this.container.attach({ stream: true, stdout: true, stderr: true });
    const output = new PassThrough();
    docker.modem.demuxStream(stream, output, output);
    output.on('data', (chunk: Buffer) => this.log(chunk.toString('utf8')));

    await this.container.start();
    await this.copyFiles(this.container, [...files, { path: '.bytebox-ready', content: '' }]);
    void this.container.wait().then(({ StatusCode }: { StatusCode: number }) => {
      if (!this.container) return; // stopped on purpose
      this.log(`\n■ The server stopped (exit code ${StatusCode}).\n`);
      void this.stop();
    });
    this.maxTimer = setTimeout(() => {
      this.log(`\n■ Servers can run for ${MAX_MS / 60_000} minutes; start it again to continue.\n`);
      void this.stop();
    }, MAX_MS);

    const info = await this.container.inspect();
    const host = info.NetworkSettings.Networks[`bytebox-server-${id}`]?.IPAddress;
    if (!host) throw new Error('The server has no address');
    if (await this.waitUntilListening(host)) {
      this.previewId = id;
      previews.set(id, host);
      this.send({ type: 'status', status: 'running', framework: framework.name, previewUrl: `${PUBLIC_URL}/preview/${id}/` });
    }
  }

  // Docker can't copy into a read-only container, so the files go through tar (like the terminal service).
  // The .bytebox-ready file comes last: the server starts once it exists.
  private async copyFiles(container: Docker.Container, files: ProjectFile[]) {
    const archive = await packFiles(files);
    const exec = await container.exec({
      Cmd: ['sh', '-c', `head -c ${archive.length} | tar -x -C /workspace -f -`],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      User: USER,
    });
    const stream = await exec.start({ hijack: true, stdin: true });
    stream.resume();
    const done = new Promise((resolve) => stream.on('end', resolve));
    stream.write(archive);
    await done;
  }

  // Wait until the server accepts connections on its port (its pages may be slow, or 404 on "/")
  private async waitUntilListening(host: string): Promise<boolean> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!this.container) return false;
      const listening = await new Promise<boolean>((resolve) => {
        const socket = net.connect({ host, port: PORT, timeout: 1000 }, () => {
          socket.destroy();
          resolve(true);
        });
        socket.on('error', () => resolve(false));
        socket.on('timeout', () => {
          socket.destroy();
          resolve(false);
        });
      });
      if (listening) return true;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    this.log(`\n■ Nothing answered on port ${PORT} within ${READY_TIMEOUT_MS / 1000} s. Does the app listen on process.env.PORT / port 8080?\n`);
    await this.stop();
    return false;
  }

  private log(data: string) {
    this.logBytes += data.length;
    if (this.logBytes > MAX_LOG_BYTES) {
      if (this.container) {
        this.send({ type: 'log', data: '\n■ The server printed too much output and was stopped.\n' });
        void this.stop();
      }
      return;
    }
    this.send({ type: 'log', data });
  }

  private send(message: ServerMessage) {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(message));
  }

  async stop() {
    const { container, network, previewId } = this;
    this.container = null;
    this.network = null;
    this.previewId = null;
    this.logBytes = 0;
    if (this.maxTimer) clearTimeout(this.maxTimer);
    if (previewId) previews.delete(previewId);
    if (!container && !network) return;
    await container?.remove({ force: true }).catch(() => {});
    await network?.disconnect({ Container: hostname(), Force: true }).catch(() => {});
    await network?.remove().catch(() => {});
    this.send({ type: 'status', status: 'stopped' });
  }

  close(reason: string) {
    this.send({ type: 'error', message: reason });
    void this.stop();
    this.ws.close();
  }
}

// Servers and networks left behind (e.g. if this service restarted) are removed
export async function removeLeftovers() {
  const containers = await docker.listContainers({ all: true, filters: { label: [LABEL] } });
  await Promise.all(containers.map((info) => docker.getContainer(info.Id).remove({ force: true }).catch(() => {})));
  const networks = await docker.listNetworks({ filters: { label: [LABEL] } });
  for (const info of networks) {
    const network = docker.getNetwork(info.Id);
    await network.disconnect({ Container: hostname(), Force: true }).catch(() => {});
    await network.remove().catch(() => {});
  }
}
