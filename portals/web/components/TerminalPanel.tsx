'use client';

import { useEffect, useRef, useState } from 'react';
import type { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { Project } from '@/lib/project';
import {
  incoming,
  outgoing,
  startState,
  type ProjectFile,
  type Scan,
  type SyncState,
  type TerminalChanges,
} from '@/lib/terminalSync';

const TERMINAL_URL = process.env.NEXT_PUBLIC_TERMINAL_URL ?? 'ws://localhost:4100';
const SYNC_DELAY_MS = 800;

type ServerMessage =
  | { type: 'ready' }
  | { type: 'output'; data: string }
  | ({ type: 'files'; seq: number } & Scan)
  | { type: 'error'; message: string }
  | { type: 'exit'; reason: string };

interface Props {
  // The project is copied in when the terminal starts; after that, changes flow both ways
  project: Project;
  // Called with changes made in the terminal (files created, edited, moved or deleted)
  onTerminalChanges: (changes: TerminalChanges) => void;
  onClose: () => void;
}

function toList(files: Record<string, string>): ProjectFile[] {
  return Object.entries(files).map(([path, content]) => ({ path, content }));
}

export function TerminalPanel({ project, onTerminalChanges, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const projectRef = useRef(project);
  const onChangesRef = useRef(onTerminalChanges);
  const syncState = useRef<SyncState>(startState(project));
  const seq = useRef(0); // numbers our changes; scans taken before the latest one are ignored
  const structure = useRef(''); // file and folder names, to send renames/deletes without delay
  const [status, setStatus] = useState<'connecting' | 'ready' | 'ended'>('connecting');
  const [endReason, setEndReason] = useState('');
  const [attempt, setAttempt] = useState(0); // bump to restart

  projectRef.current = project;
  onChangesRef.current = onTerminalChanges;

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
        const { files } = projectRef.current;
        // Empty folders aren't part of init: leaving them out of the state makes the sync effect send them
        syncState.current = { files: { ...files }, folders: new Set() };
        seq.current = 0;
        send({ type: 'init', files: toList(files), cols: terminal!.cols, rows: terminal!.rows });
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
        case 'files': {
          if (message.seq < seq.current) break; // taken before our latest change reached the terminal
          const changes = incoming(projectRef.current, syncState.current, message);
          if (changes) onChangesRef.current(changes);
          break;
        }
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

  // Push editor changes into the terminal. New, renamed and deleted files or folders go right away;
  // typing inside a file is sent after a short pause.
  useEffect(() => {
    if (status !== 'ready') return;
    const names = JSON.stringify([Object.keys(project.files).sort(), project.folders]);
    const structureChanged = names !== structure.current;
    structure.current = names;

    const timer = setTimeout(
      () => {
        const { deletes, files, folders } = outgoing(project, syncState.current);
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        if (deletes.length > 0) {
          socket.send(JSON.stringify({ type: 'delete', paths: deletes, seq: ++seq.current }));
        }
        if (files.length > 0 || folders.length > 0) {
          socket.send(JSON.stringify({ type: 'sync', files, folders, seq: ++seq.current }));
        }
      },
      structureChanged ? 0 : SYNC_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [project, status]);

  return (
    <section className="flex h-72 shrink-0 flex-col border-t border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1.5 text-xs">
        <h2 className="font-semibold tracking-wide text-zinc-400 uppercase">Terminal</h2>
        <span className={status === 'ready' ? 'text-emerald-300' : 'text-zinc-500'}>
          {status === 'connecting' && 'Starting…'}
          {status === 'ready' && '● Connected'}
          {status === 'ended' && (endReason || 'Disconnected')}
        </span>
        {status === 'ready' && (
          <span className="text-zinc-500" title="Changes in the terminal show up in the file tree automatically">
            · files in sync
          </span>
        )}
        <span className="ml-auto" />
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
