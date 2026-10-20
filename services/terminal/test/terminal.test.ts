// Integration tests: need `docker compose up` (terminal service on localhost:4100)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import WebSocket from 'ws';
import type { ProjectFile, ServerMessage } from '../src/protocol.js';

const URL = process.env.TERMINAL_URL ?? 'ws://localhost:4100';
const ORIGIN = 'http://localhost:3000';

const PROJECT: ProjectFile[] = [
  { path: 'main.py', content: 'from utils.greet import greet\nprint(greet("terminal"))\n' },
  { path: 'utils/greet.py', content: 'def greet(name):\n    return f"Hello, {name}!"\n' },
];

// A connected terminal with helpers to type commands and wait for output
async function openTerminal(files = PROJECT) {
  const ws = new WebSocket(URL, { origin: ORIGIN });
  const messages: ServerMessage[] = [];
  let output = '';
  ws.on('message', (raw) => {
    const message = JSON.parse(raw.toString()) as ServerMessage;
    messages.push(message);
    if (message.type === 'output') output += message.data;
  });
  await new Promise((resolve, reject) => ws.on('open', resolve).on('error', reject));
  ws.send(JSON.stringify({ type: 'init', files, cols: 120, rows: 30 }));

  const waitFor = async (check: () => boolean, what: string, timeoutMs = 10_000) => {
    const deadline = Date.now() + timeoutMs;
    while (!check()) {
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}. Output:\n${output}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  return {
    ws,
    messages,
    output: () => output,
    waitFor,
    ready: () => waitFor(() => messages.some((m) => m.type === 'ready'), 'ready'),
    type: (text: string) => ws.send(JSON.stringify({ type: 'input', data: text })),
    waitForOutput: (text: string) => waitFor(() => output.includes(text), `"${text}"`),
    close: () => ws.close(),
  };
}

test('runs project files from the shell', async () => {
  const terminal = await openTerminal();
  await terminal.ready();
  terminal.type('python3 main.py\n');
  await terminal.waitForOutput('Hello, terminal!');
  terminal.type('ls utils\n');
  await terminal.waitForOutput('greet.py');
  terminal.close();
});

test('runs as an unprivileged user without network', async () => {
  const terminal = await openTerminal();
  await terminal.ready();
  terminal.type('echo "uid=$(id -u)"\n');
  await terminal.waitForOutput('uid=65534');
  terminal.type(
    'python3 -c "import urllib.request; urllib.request.urlopen(\'http://1.1.1.1\', timeout=2)" || echo NO_NETWORK\n',
  );
  await terminal.waitForOutput('NO_NETWORK');
  terminal.type('touch /etc/hacked || echo READ_ONLY\n');
  await terminal.waitForOutput('READ_ONLY');
  terminal.close();
});

test('sync pushes edited files into the workspace', async () => {
  const terminal = await openTerminal();
  await terminal.ready();
  terminal.ws.send(
    JSON.stringify({ type: 'sync', files: [{ path: 'main.py', content: 'print("edited in the editor")\n' }] }),
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  terminal.type('python3 main.py\n');
  await terminal.waitForOutput('edited in the editor');
  terminal.close();
});

test('pull returns files created in the terminal and skips binaries', async () => {
  const terminal = await openTerminal();
  await terminal.ready();
  terminal.type('mkdir -p notes && echo "from the shell" > notes/todo.txt && head -c 100 /dev/urandom > blob.bin && echo DONE\n');
  await terminal.waitForOutput('DONE');
  terminal.ws.send(JSON.stringify({ type: 'pull' }));
  const hasTodo = (m: ServerMessage) =>
    m.type === 'files' && m.files.some((file) => file.path === 'notes/todo.txt');
  await terminal.waitFor(() => terminal.messages.some(hasTodo), 'files with notes/todo.txt');

  const result = terminal.messages.find(hasTodo);
  assert.ok(result && result.type === 'files');
  const paths = result.files.map((file) => file.path).sort();
  assert.deepEqual(paths, ['main.py', 'notes/todo.txt', 'utils/greet.py']);
  assert.equal(result.files.find((file) => file.path === 'notes/todo.txt')?.content, 'from the shell\n');
  assert.ok(result.folders.includes('notes'));
  assert.ok(result.skipped.includes('blob.bin'));
  terminal.close();
});

// Latest automatic "files" message that matches a condition
function latestFiles(terminal: Awaited<ReturnType<typeof openTerminal>>) {
  const all = terminal.messages.filter((m) => m.type === 'files');
  return all[all.length - 1];
}

test('changes made in the shell are sent automatically', async () => {
  const terminal = await openTerminal();
  await terminal.ready();
  terminal.type('echo auto > auto.txt && mv utils lib && rm main.py && echo DONE\n');
  await terminal.waitFor(() => {
    const files = latestFiles(terminal);
    return files?.type === 'files' && files.files.some((file) => file.path === 'auto.txt');
  }, 'automatic files message');

  const result = latestFiles(terminal);
  assert.ok(result && result.type === 'files');
  assert.deepEqual(result.files.map((file) => file.path).sort(), ['auto.txt', 'lib/greet.py']);
  assert.ok(result.folders.includes('lib') && !result.folders.includes('utils'));
  terminal.close();
});

test('deletes and new folders from the editor reach the workspace', async () => {
  const terminal = await openTerminal();
  await terminal.ready();
  terminal.ws.send(JSON.stringify({ type: 'delete', paths: ['utils/greet.py'] }));
  terminal.ws.send(JSON.stringify({ type: 'sync', files: [], folders: ['docs/drafts'] }));
  await new Promise((resolve) => setTimeout(resolve, 500));
  terminal.type('ls -d utils 2>/dev/null || echo NO_UTILS; ls -d docs/drafts && echo HAS_DRAFTS\n');
  await terminal.waitForOutput('NO_UTILS');
  await terminal.waitForOutput('HAS_DRAFTS');
  terminal.close();
});

test('a new terminal from the same client replaces the old one', async () => {
  const first = await openTerminal();
  await first.ready();
  const second = await openTerminal();
  await second.ready();
  await first.waitFor(
    () => first.messages.some((m) => m.type === 'exit' && m.reason.includes('another tab')),
    'exit message',
  );
  second.close();
});

test('exiting the shell ends the session', async () => {
  const terminal = await openTerminal();
  await terminal.ready();
  terminal.type('exit\n');
  await terminal.waitFor(() => terminal.messages.some((m) => m.type === 'exit'), 'exit message');
});

test('invalid file paths are rejected', async () => {
  const terminal = await openTerminal([{ path: '../evil.sh', content: '' }]);
  await terminal.waitFor(() => terminal.messages.some((m) => m.type === 'error'), 'error');
  terminal.close();
});

test('other websites cannot open a terminal', async () => {
  const ws = new WebSocket(URL, { origin: 'https://evil.example' });
  const error = await new Promise<Error>((resolve) => ws.on('error', resolve));
  assert.match(error.message, /403/);
});
