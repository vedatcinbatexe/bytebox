'use client';

import { useEffect, useRef, useState } from 'react';
import { DEVSERVER_URL } from './devserver';
import type { ProjectFile } from './runs';

export type ServerStatus = 'idle' | 'starting' | 'running' | 'stopped';

const MAX_LOG = 200_000; // characters kept in the browser

// Starts and stops a project's server on the devserver service, and collects its log
export function useDevServer() {
  const [status, setStatus] = useState<ServerStatus>('idle');
  const [framework, setFramework] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [log, setLog] = useState('');
  const socket = useRef<WebSocket | null>(null);

  // The server stops when the page is closed
  useEffect(() => () => socket.current?.close(), []);

  function connect(): Promise<WebSocket> {
    const open = socket.current;
    if (open && open.readyState === WebSocket.OPEN) return Promise.resolve(open);
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${DEVSERVER_URL}/session`);
      socket.current = ws;
      ws.onopen = () => resolve(ws);
      ws.onerror = () => reject(new Error('Can’t reach the server service. Is it running?'));
      ws.onclose = () => {
        if (socket.current === ws) socket.current = null;
        setStatus((current) => (current === 'idle' ? 'idle' : 'stopped'));
        setPreviewUrl(null);
      };
      ws.onmessage = (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type === 'log') setLog((current) => (current + message.data).slice(-MAX_LOG));
        if (message.type === 'error') setLog((current) => `${current}\n■ ${message.message}\n`);
        if (message.type === 'status') {
          setStatus(message.status);
          if (message.framework) setFramework(message.framework);
          setPreviewUrl(message.status === 'running' ? message.previewUrl : null);
        }
      };
    });
  }

  return {
    status,
    framework,
    previewUrl,
    log,
    // Start (or restart) with the latest files
    async start(files: ProjectFile[]) {
      setLog('');
      setPreviewUrl(null);
      setStatus('starting');
      try {
        (await connect()).send(JSON.stringify({ type: 'start', files }));
      } catch (error) {
        setLog(`■ ${(error as Error).message}\n`);
        setStatus('stopped');
      }
    },
    stop() {
      socket.current?.send(JSON.stringify({ type: 'stop' }));
    },
  };
}
