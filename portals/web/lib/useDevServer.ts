'use client';

import { useEffect, useRef, useState } from 'react';
import { DEVSERVER_URL } from './devserver';
import type { ProjectFile } from './runs';

export type ServerStatus = 'idle' | 'starting' | 'running' | 'stopped';

const MAX_LOG = 200_000; // characters kept in the browser

function failedResponse(error: string): ApiResponse {
  return { status: 0, statusText: '', headers: {}, body: '', truncated: false, timeMs: 0, sizeBytes: 0, error };
}

// The API tester's request and the answer (sent through the devserver, see services/devserver/src/apiRequest.ts)
export interface ApiRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}

export interface ApiResponse {
  status: number; // 0 when the server didn't answer
  statusText: string;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
  timeMs: number;
  sizeBytes: number;
  error?: string;
}

// Starts and stops a project's server on the devserver service, and collects its log
export function useDevServer() {
  const [status, setStatus] = useState<ServerStatus>('idle');
  const [framework, setFramework] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [log, setLog] = useState('');
  const socket = useRef<WebSocket | null>(null);
  // API tester requests waiting for their answer, by id
  const pending = useRef(new Map<number, (response: ApiResponse) => void>());
  const nextId = useRef(1);

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
        // Requests still waiting won't get an answer anymore
        pending.current.forEach((resolve) => resolve(failedResponse('The connection to the server was lost')));
        pending.current.clear();
        setStatus((current) => (current === 'idle' ? 'idle' : 'stopped'));
        setPreviewUrl(null);
      };
      ws.onmessage = (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type === 'log') setLog((current) => (current + message.data).slice(-MAX_LOG));
        if (message.type === 'response') {
          pending.current.get(message.id)?.(message);
          pending.current.delete(message.id);
        }
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
    // Send a request to the running server (API tester)
    send(request: ApiRequest): Promise<ApiResponse> {
      const ws = socket.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve(failedResponse('Start the server first'));
      const id = nextId.current++;
      return new Promise((resolve) => {
        pending.current.set(id, resolve);
        ws.send(JSON.stringify({ type: 'request', id, ...request }));
      });
    },
  };
}
