'use client';

import { useEffect, useRef, useState } from 'react';
import type { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

const TERMINAL_URL = process.env.NEXT_PUBLIC_TERMINAL_URL ?? 'ws://localhost:4100';
const SYNC_DELAY_MS = 800;

interface ProjectFile {
  path: string;
  content: string;
}

type ServerMessage =
  | { type: 'ready' }
  | { type: 'output'; data: string }
  | { type: 'files'; files: ProjectFile[]; folders: string[]; skipped: string[] }
  | { type: 'error'; message: string }
  | { type: 'exit'; reason: string };

interface Props {
  // Current project files: copied in when the terminal starts, then edits are pushed in
  files: Record<string, string>;
  // Called with files read back from the terminal (Refresh button)
  onPulled: (files: ProjectFile[], folders: string[], skipped: string[]) => void;
  onClose: () => void;
}

function toList(files: Record<string, string>): ProjectFile[] {
  return Object.entries(files).map(([path, content]) => ({ path, content }));
}

export function TerminalPanel({ files, onPulled, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const filesRef = useRef(files);
  const onPulledRef = useRef(onPulled);
  const lastSynced = useRef<Record<string, string>>({});
  const [status, setStatus] = useState<'connecting' | 'ready' | 'ended'>('connecting');
  const [endReason, setEndReason] = useState('');
  const [attempt, setAttempt] = useState(0); // bump to restart

  filesRef.current = files;
  onPulledRef.current = onPulled;

  // Connect: create the terminal, open the WebSocket, wire input/output/resize
  useEffect(() => {
    let terminal: Terminal | null = null;
    let observer: ResizeObserver | null = null;
    let cancelled = false; // set when this connection is replaced or the panel closes
    let started = false;
    const socket = new WebSocket(TERMINAL_URL);
    socketRef.current = socket;
    setStatus('connecting');
    setEndReason('');

    const send = (message: object) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    };
    let endedWith = '';
    const end = (reason: string) => {
      if (cancelled || endedWith) return; // keep the first reason (e.g. "opened in another tab")
      endedWith = reason;
      setStatus('ended');
      setEndReason(reason);
    };

    // xterm.js needs the browser, so load it here instead of at the top of the file
    Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]).then(([xterm, fitAddon]) => {
      if (cancelled || !containerRef.current) return;
      terminal = new xterm.Terminal({
        fontSize: 13,
        cursorBlink: true,
        theme: { background: '#09090b' },
      });
      const fit = new fitAddon.FitAddon();
      terminal.loadAddon(fit);
      terminal.open(containerRef.current);
      fit.fit();
      terminal.onData((data) => send({ type: 'input', data }));

      observer = new ResizeObserver(() => {
        fit.fit();
        if (started) send({ type: 'resize', cols: terminal!.cols, rows: terminal!.rows });
      });
      observer.observe(containerRef.current);

      const start = () => {
        started = true;
        lastSynced.current = { ...filesRef.current };
        send({ type: 'init', files: toList(filesRef.current), cols: terminal!.cols, rows: terminal!.rows });
      };
      if (socket.readyState === WebSocket.OPEN) start();
      else socket.addEventListener('open', start);
    });

    socket.onmessage = (event) => {
      if (cancelled) return;
      const message = JSON.parse(event.data as string) as ServerMessage;
      switch (message.type) {
        case 'ready':
          setStatus('ready');
          terminal?.focus();
          break;
        case 'output':
          terminal?.write(message.data);
          break;
        case 'files':
          onPulledRef.current(message.files, message.folders, message.skipped);
          break;
        case 'error':
          terminal?.writeln(`\r\n\x1b[31m${message.message}\x1b[0m`);
          break;
        case 'exit':
          end(message.reason);
          break;
      }
    };
    socket.onerror = () => end('Cannot reach the terminal service. Is it running?');
    socket.onclose = () => end('Disconnected');

    return () => {
      cancelled = true;
      socket.close();
      observer?.disconnect();
      terminal?.dispose();
    };
  }, [attempt]);

  // Push edited files into the terminal (only the ones that changed)
  useEffect(() => {
    if (status !== 'ready') return;
    const timer = setTimeout(() => {
      const changed = Object.entries(files)
        .filter(([path, content]) => lastSynced.current[path] !== content)
        .map(([path, content]) => ({ path, content }));
      if (changed.length === 0) return;
      socketRef.current?.send(JSON.stringify({ type: 'sync', files: changed }));
      lastSynced.current = { ...files };
    }, SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [files, status]);

  function refresh() {
    socketRef.current?.send(JSON.stringify({ type: 'pull' }));
  }

  return (
    <section className="flex h-72 shrink-0 flex-col border-t border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1.5 text-xs">
        <h2 className="font-semibold tracking-wide text-zinc-400 uppercase">Terminal</h2>
        <span className={status === 'ready' ? 'text-emerald-300' : 'text-zinc-500'}>
          {status === 'connecting' && 'Starting…'}
          {status === 'ready' && '● Connected'}
          {status === 'ended' && (endReason || 'Disconnected')}
        </span>
        <span className="ml-auto" />
        <button
          onClick={refresh}
          disabled={status !== 'ready'}
          title="Copy files created or changed in the terminal into the file tree"
          className="rounded px-2 py-0.5 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
        >
          ⟳ Refresh files
        </button>
        {status === 'ended' && (
          <button
            onClick={() => setAttempt((count) => count + 1)}
            className="rounded px-2 py-0.5 text-zinc-300 hover:bg-zinc-800"
          >
            Restart
          </button>
        )}
        <button onClick={onClose} title="Close terminal" className="rounded px-2 py-0.5 text-zinc-300 hover:bg-zinc-800">
          ✕
        </button>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 px-2 py-1" />
    </section>
  );
}
