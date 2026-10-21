import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import type { WebSocket } from 'ws';
import { readDoc, seedDoc } from './doc.js';
import { saveProject, type Project } from './projects.js';

// Message types of the y-websocket protocol (what the browser's WebsocketProvider speaks)
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const SAVE_AFTER_MS = Number(process.env.SAVE_AFTER_MS ?? 2000);

// One room per project: the shared document, who is connected and their cursors (awareness)
export class Room {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  // Each connection and the awareness client ids it controls
  private connections = new Map<WebSocket, Set<number>>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> = Promise.resolve();

  constructor(
    readonly slug: string,
    private readonly ownerId: string,
    project: Project,
    private readonly onEmpty: () => void,
  ) {
    this.awareness.setLocalState(null); // the server itself has no cursor
    seedDoc(this.doc, project);

    this.doc.on('update', (update: Uint8Array) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      this.broadcast(encoding.toUint8Array(encoder));
      this.scheduleSave();
    });

    this.awareness.on(
      'update',
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        const connection = this.connections.get(origin as WebSocket);
        if (connection) {
          added.forEach((id) => connection.add(id));
          removed.forEach((id) => connection.delete(id));
        }
        const changed = [...added, ...updated, ...removed];
        this.broadcast(this.awarenessMessage(changed));
      },
    );
  }

  get size(): number {
    return this.connections.size;
  }

  join(ws: WebSocket): void {
    this.connections.set(ws, new Set());

    ws.on('message', (data: Buffer) => {
      try {
        this.handleMessage(ws, new Uint8Array(data));
      } catch (error) {
        console.error(`Bad message in ${this.slug}:`, error);
        ws.close(1003, 'Bad message');
      }
    });
    ws.on('close', () => this.leave(ws));

    // Start syncing: send what we have and ask for what the client has
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    ws.send(encoding.toUint8Array(encoder));
    const others = [...this.awareness.getStates().keys()];
    if (others.length > 0) ws.send(this.awarenessMessage(others));
  }

  private handleMessage(ws: WebSocket, message: Uint8Array): void {
    const decoder = decoding.createDecoder(message);
    const type = decoding.readVarUint(decoder);
    if (type === MESSAGE_SYNC) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, this.doc, ws);
      // Only answer if there is something to say (e.g. sync step 2)
      if (encoding.length(encoder) > 1) ws.send(encoding.toUint8Array(encoder));
    } else if (type === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), ws);
    }
  }

  private leave(ws: WebSocket): void {
    const ids = this.connections.get(ws);
    this.connections.delete(ws);
    // Their cursors disappear for everyone else
    if (ids && ids.size > 0) awarenessProtocol.removeAwarenessStates(this.awareness, [...ids], null);
    if (this.connections.size === 0) {
      void this.saveNow().finally(() => {
        if (this.connections.size === 0) this.onEmpty();
      });
    }
  }

  private awarenessMessage(clientIds: number[]): Uint8Array {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, clientIds));
    return encoding.toUint8Array(encoder);
  }

  private broadcast(message: Uint8Array): void {
    for (const ws of this.connections.keys()) {
      if (ws.readyState === ws.OPEN) ws.send(message);
    }
  }

  // Save a moment after the last change, so typing doesn't cause a save per keystroke
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveNow(), SAVE_AFTER_MS);
  }

  saveNow(): Promise<void> {
    if (!this.saveTimer) return this.saving; // nothing changed since the last save
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    // One save at a time, in order
    this.saving = this.saving.then(() =>
      saveProject(this.slug, this.ownerId, readDoc(this.doc)).catch((error) => console.error(error)),
    );
    return this.saving;
  }

  destroy(): void {
    this.awareness.destroy();
    this.doc.destroy();
  }
}
