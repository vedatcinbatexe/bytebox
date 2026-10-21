'use client';

import { useEffect, useRef, useState } from 'react';
import type { OnMount } from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { User } from './auth';
import {
  COLLAB_URL,
  colorFor,
  distinctPeople,
  readShared,
  writeLocalChanges,
  type Person,
  type Presence,
  type SharedState,
} from './collab';
import { bindEditor } from './monacoBinding';

// connecting → live (in sync with everyone) → offline (connection lost, retrying)
export type CollabStatus = 'off' | 'connecting' | 'live' | 'offline';

export type { Person };

interface Options {
  slug?: string;
  enabled: boolean; // the owner and collaborators join the live session
  user: User | null;
  // The shared project changed (someone else's edit, or the first sync)
  onRemote: (state: SharedState) => void;
}

const LOCAL = 'local-change'; // origin of changes made through writeLocalChanges

// Joins the project's live session on the collab service while `enabled`
export function useCollab({ slug, enabled, user, onRemote }: Options) {
  const [status, setStatus] = useState<CollabStatus>('off');
  const [people, setPeople] = useState<Person[]>([]);
  const session = useRef<{ doc: Y.Doc; provider: WebsocketProvider; synced: boolean } | null>(null);
  const boundPath = useRef<string | null>(null);
  const onRemoteRef = useRef(onRemote);
  onRemoteRef.current = onRemote;

  useEffect(() => {
    if (!enabled || !slug || !user) return;
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(COLLAB_URL, slug, doc, { maxBackoffTime: 5000 });
    const current = { doc, provider, synced: false };
    session.current = current;
    setStatus('connecting');

    provider.awareness.setLocalStateField('user', {
      id: user.id,
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      color: colorFor(user.id),
    } satisfies Presence['user']);

    provider.on('status', ({ status: connection }) => {
      if (connection === 'connected') setStatus(current.synced ? 'live' : 'connecting');
      else setStatus(connection === 'disconnected' ? 'offline' : 'connecting');
    });
    provider.on('sync', (isSynced) => {
      if (!isSynced) return;
      // The shared document wins: everyone sees the same files
      current.synced = true;
      onRemoteRef.current(readShared(doc));
      setStatus('live');
    });
    doc.on('update', (_update: Uint8Array, origin: unknown) => {
      if (current.synced && origin !== LOCAL) onRemoteRef.current(readShared(doc));
    });

    // One entry per account, even if someone has the project open in several tabs
    const updatePeople = () =>
      setPeople(distinctPeople(provider.awareness.getStates() as Map<number, Partial<Presence>>, doc.clientID, user.id));
    provider.awareness.on('change', updatePeople);
    updatePeople();

    return () => {
      session.current = null;
      provider.destroy();
      doc.destroy();
      setStatus('off');
      setPeople([]);
    };
  }, [enabled, slug, user]);

  return {
    status,
    people,
    // Send what we changed (from the workspace before and after a change)
    localChange(previous: SharedState, next: SharedState) {
      const live = session.current;
      if (live?.synced) writeLocalChanges(live.doc, previous, next, boundPath.current, LOCAL);
    },
    // Edit the open file together; returns the function that stops it
    bind(monaco: Parameters<OnMount>[1], editor: Parameters<OnMount>[0], path: string): (() => void) | null {
      const live = session.current;
      const text = live?.synced ? live.doc.getMap<Y.Text>('files').get(path) : undefined;
      if (!live || !text) return null;
      boundPath.current = path;
      const unbind = bindEditor(monaco, editor, live.doc, text, live.provider.awareness, path);
      return () => {
        unbind();
        boundPath.current = null;
        live.provider.awareness.setLocalStateField('cursor', null);
      };
    },
  };
}
