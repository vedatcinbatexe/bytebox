import { PassThrough, type Duplex } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import Docker from 'dockerode';
import type { WebSocket } from 'ws';
import { checkFiles, isSafePath, packFiles, unpackFiles } from './files.js';
import type { ClientMessage, ProjectFile, ServerMessage } from './protocol.js';

export const docker = new Docker();

const IMAGE = process.env.WORKSPACE_IMAGE ?? 'bytebox/sandbox-workspace';
const IDLE_MS = Number(process.env.IDLE_MINUTES ?? 15) * 60_000;
const MAX_MS = Number(process.env.MAX_MINUTES ?? 60) * 60_000;
const USER = '65534:65534'; // nobody
// The workspace is scanned shortly after the shell goes quiet, and regularly for programs that keep running
const SCAN_AFTER_OUTPUT_MS = 400;
const SCAN_EVERY_MS = 5000;
export const LABEL = 'bytebox-terminal';

// One terminal session per client (IP address). A new one replaces the old one.
const sessions = new Map<string, Session>();

export function openSession(ws: WebSocket, clientId: string) {
  console.log(`Session opened for ${clientId}`);
  sessions.get(clientId)?.end('The terminal was opened in another tab');
  const session = new Session(ws, () => {
    if (sessions.get(clientId) === session) sessions.delete(clientId);
  });
  sessions.set(clientId, session);
}

class Session {
  private container: Docker.Container | null = null;
  private shell: Duplex | null = null;
  private shellExec: Docker.Exec | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private maxTimer: NodeJS.Timeout | null = null;
  private scanTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastSnapshot = '';
  private scanning = false;
  private scanAgain = false; // a change happened while scanning
  private appliedSeq = 0; // last editor change applied to the workspace
  private queue: Promise<void> = Promise.resolve(); // handle messages one at a time, in order
  private ended = false;

  constructor(
    private ws: WebSocket,
    private onEnd: () => void,
  ) {
    ws.on('message', (raw) => {
      this.queue = this.queue.then(() => this.handle(raw.toString())).catch((error) => this.fail(error));
    });
    ws.on('close', () => this.end());
  }

  private async handle(raw: string) {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      return this.send({ type: 'error', message: 'Invalid message' });
    }

    if (message.type === 'init') return this.start(message.files, message.cols, message.rows);
    if (!this.shell || !this.container) {
      return this.send({ type: 'error', message: 'Send "init" first' });
    }

    switch (message.type) {
      case 'input':
        this.resetIdleTimer();
        this.shell.write(message.data);
        break;
      case 'resize':
        await this.shellExec?.resize({ h: message.rows, w: message.cols }).catch(() => {});
        break;
      case 'sync':
        await this.writeFiles(message.files);
        await this.createFolders(message.folders ?? []);
        this.changeApplied(message.seq);
        break;
      case 'delete':
        await this.deletePaths(message.paths);
        this.changeApplied(message.seq);
        break;
      case 'pull':
        await this.scan(true);
        break;
    }
  }

  private async start(files: ProjectFile[], cols: number, rows: number) {
    if (this.container) return this.send({ type: 'error', message: 'Already started' });
    const problem = checkFiles(files);
    if (problem) {
      this.send({ type: 'error', message: problem });
      return this.end(problem);
    }

    // Same isolation as one-off runs, but the container lives for the whole session
    this.container = await docker.createContainer({
      Image: IMAGE,
      Cmd: ['tail', '-f', '/dev/null'], // keeps the container alive; the shell runs as an exec
      User: USER,
      WorkingDir: '/workspace',
      Hostname: 'bytebox',
      Labels: { [LABEL]: String(Date.now()) },
      HostConfig: {
        NetworkMode: 'none',
        ReadonlyRootfs: true,
        // mode=1777: writable for the nobody user (WorkingDir would otherwise make it root-only)
        Tmpfs: {
          '/workspace': 'rw,exec,nosuid,size=64m,mode=1777',
          '/tmp': 'rw,exec,nosuid,size=64m,mode=1777',
        },
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        Memory: 256 * 1024 * 1024,
        MemorySwap: 256 * 1024 * 1024,
        NanoCpus: 500_000_000, // half a CPU
        PidsLimit: 64,
      },
    });
    if (this.ended) return this.removeContainer(); // the browser left while we were starting
    await this.container.start();
    await this.writeFiles(files);

    this.shellExec = await this.container.exec({
      Cmd: ['bash'],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      User: USER,
      WorkingDir: '/workspace',
      Env: ['HOME=/workspace', 'TERM=xterm-256color', 'PS1=\\w $ '],
    });
    this.shell = await this.shellExec.start({ hijack: true, stdin: true, Tty: true });
    await this.shellExec.resize({ h: rows, w: cols }).catch(() => {});

    const decoder = new StringDecoder('utf8');
    this.shell.on('data', (chunk: Buffer) => {
      this.send({ type: 'output', data: decoder.write(chunk) });
      this.scheduleScan();
    });
    this.shell.on('end', () => this.end('The shell exited'));

    this.resetIdleTimer();
    this.maxTimer = setTimeout(() => this.end('Sessions last at most 1 hour'), MAX_MS);
    this.pollTimer = setInterval(() => void this.scan(), SCAN_EVERY_MS);
    this.send({ type: 'ready' });
  }

  // Extract files into /workspace. head reads exactly the archive, so we never wait for stdin to close.
  private async writeFiles(files: ProjectFile[]) {
    const problem = checkFiles(files);
    if (problem) return this.send({ type: 'error', message: problem });
    if (files.length === 0) return;
    const archive = await packFiles(files);
    await this.exec(['sh', '-c', `head -c ${archive.length} | tar -x -C /workspace -f -`], archive);
  }

  private async createFolders(folders: string[]) {
    const safe = folders.filter(isSafePath);
    if (safe.length > 0) await this.exec(['mkdir', '-p', '--', ...safe]);
  }

  // Remove files or (empty) folders, then any parent folders left empty
  private async deletePaths(paths: string[]) {
    const safe = paths.filter(isSafePath);
    if (safe.length === 0) return;
    const script = `for p in "$@"; do
      if [ -d "$p" ]; then rmdir -- "$p" 2>/dev/null; else rm -f -- "$p"; fi
      d=$(dirname -- "$p")
      [ "$d" = . ] || rmdir -p --ignore-fail-on-non-empty -- "$d" 2>/dev/null
    done; true`;
    await this.exec(['sh', '-c', script, 'sh', ...safe]);
  }

  private changeApplied(seq?: number) {
    if (seq !== undefined) this.appliedSeq = seq;
    this.scheduleScan();
  }

  private scheduleScan() {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => void this.scan(), SCAN_AFTER_OUTPUT_MS);
  }

  // Send the workspace files to the browser if they changed since the last scan
  private async scan(force = false) {
    if (this.ended || !this.container) return;
    if (this.scanning) {
      this.scanAgain = true;
      return;
    }
    this.scanning = true;
    const seq = this.appliedSeq;
    try {
      const result = await this.readFiles();
      const snapshot = JSON.stringify([seq, result.files, result.folders]);
      if (force || snapshot !== this.lastSnapshot) {
        this.lastSnapshot = snapshot;
        this.send({ type: 'files', ...result, seq });
      }
    } catch {
      // the container may be stopping; the next scan will try again
    } finally {
      this.scanning = false;
    }
    if (this.scanAgain) {
      this.scanAgain = false;
      void this.scan();
    }
  }

  private async readFiles() {
    const archive = await this.exec([
      'tar', '-c', '-C', '/workspace',
      '--exclude=node_modules', '--exclude=__pycache__', '--exclude=.git', '.',
    ]);
    return unpackFiles(archive);
  }

  // Run a command in the workspace and return its stdout
  private async exec(cmd: string[], input?: Buffer): Promise<Buffer> {
    const exec = await this.container!.exec({
      Cmd: cmd,
      AttachStdin: Boolean(input),
      AttachStdout: true,
      AttachStderr: true,
      User: USER,
      WorkingDir: '/workspace',
    });
    const stream = await exec.start({ hijack: true, stdin: Boolean(input) });
    const stdout = new PassThrough();
    const chunks: Buffer[] = [];
    stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    docker.modem.demuxStream(stream, stdout, new PassThrough());

    const done = new Promise((resolve) => stream.on('end', resolve));
    if (input) stream.write(input);
    await done;
    return Buffer.concat(chunks);
  }

  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(
      () => this.end('Closed after 15 minutes without input'),
      IDLE_MS,
    );
  }

  private send(message: ServerMessage) {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(message));
  }

  private fail(error: unknown) {
    console.error(error);
    this.send({ type: 'error', message: 'Something went wrong in the terminal' });
  }

  end(reason?: string) {
    if (this.ended) return;
    this.ended = true;
    console.log(`Session ended: ${reason ?? 'browser disconnected'}`);
    if (reason) this.send({ type: 'exit', reason });
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.maxTimer) clearTimeout(this.maxTimer);
    if (this.scanTimer) clearTimeout(this.scanTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.shell?.destroy();
    this.ws.close();
    this.onEnd();
    void this.removeContainer();
  }

  private async removeContainer() {
    await this.container?.remove({ force: true }).catch(() => {});
  }
}

// Remove session containers that outlived the maximum session length (e.g. after a crash)
export async function removeExpiredContainers(all = false) {
  const containers = await docker.listContainers({ all: true, filters: { label: [LABEL] } });
  for (const info of containers) {
    const startedAt = Number(info.Labels[LABEL]);
    if (all || Date.now() - startedAt > MAX_MS) {
      await docker.getContainer(info.Id).remove({ force: true }).catch(() => {});
    }
  }
}
