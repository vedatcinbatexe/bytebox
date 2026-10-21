// Live collaboration: a project shared as a Yjs document (same layout as services/collab/src/doc.ts)
//   files   Y.Map<path, Y.Text>   file contents, edited together character by character
//   folders Y.Map<path, true>     empty folders
//   meta    Y.Map                 title, stdin and args
import * as Y from 'yjs';

export const COLLAB_URL = process.env.NEXT_PUBLIC_COLLAB_URL ?? 'ws://localhost:4200';

export interface SharedState {
  files: Record<string, string>;
  folders: string[];
  title: string;
  stdin: string;
  args: string;
}

export function readShared(doc: Y.Doc): SharedState {
  const meta = doc.getMap<string>('meta');
  const files: Record<string, string> = {};
  doc.getMap<Y.Text>('files').forEach((text, path) => (files[path] = text.toString()));
  return {
    files,
    folders: [...doc.getMap<boolean>('folders').keys()].sort(),
    title: meta.get('title') ?? '',
    stdin: meta.get('stdin') ?? '',
    args: meta.get('args') ?? '',
  };
}

// Change a Y.Text into `next` with one small edit (only the part that differs),
// so other people's cursors and concurrent typing elsewhere in the file are kept
export function replaceText(text: Y.Text, next: string): void {
  const current = text.toString();
  if (current === next) return;
  let start = 0;
  while (start < current.length && start < next.length && current[start] === next[start]) start++;
  let end = 0;
  while (
    end < current.length - start &&
    end < next.length - start &&
    current[current.length - 1 - end] === next[next.length - 1 - end]
  ) {
    end++;
  }
  text.delete(start, current.length - start - end);
  text.insert(start, next.slice(start, next.length - end));
}

// Write what changed locally (compared with `previous`, what we last had in sync) into the document.
// Files that only changed in the document since then are left alone, so remote edits are never undone.
// `skipPath` is the file bound to the editor: its edits already go straight into the document.
export function writeLocalChanges(
  doc: Y.Doc,
  previous: SharedState,
  next: SharedState,
  skipPath: string | null,
  origin: unknown,
): void {
  doc.transact(() => {
    const files = doc.getMap<Y.Text>('files');
    for (const [path, content] of Object.entries(next.files)) {
      if (path === skipPath || previous.files[path] === content) continue;
      const text = files.get(path);
      if (text) replaceText(text, content);
      else files.set(path, new Y.Text(content));
    }
    for (const path of Object.keys(previous.files)) {
      if (!(path in next.files)) files.delete(path);
    }

    const folders = doc.getMap<boolean>('folders');
    for (const folder of next.folders) if (!previous.folders.includes(folder)) folders.set(folder, true);
    for (const folder of previous.folders) if (!next.folders.includes(folder)) folders.delete(folder);

    const meta = doc.getMap<string>('meta');
    for (const key of ['title', 'stdin', 'args'] as const) {
      if (next[key] !== previous[key]) meta.set(key, next[key]);
    }
  }, origin);
}

// A stable color per user, readable on dark and light themes
const COLORS = ['#e5484d', '#3e9bf5', '#30a46c', '#f76b15', '#8e4ec6', '#d6409f', '#12a594', '#ad7f58'];

export function colorFor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

// What each person shares about themselves (Yjs "awareness")
export interface Presence {
  user: { id: string; login: string; name: string; avatarUrl: string; color: string };
  // Open file and selection; positions are Yjs relative positions (JSON), so they move with edits
  cursor?: { path: string; anchor: unknown; head: unknown } | null;
}

export interface Person {
  clientId: number;
  presence: Presence;
  isMe: boolean;
  tabs: number; // the same account can be open in several tabs or windows
}

// One entry per account (not per tab), you first, then by login.
// For each account it keeps the tab with a cursor (for "which file"), and this tab for you.
export function distinctPeople(
  states: Map<number, Partial<Presence>>,
  myClientId: number,
  myUserId: string,
): Person[] {
  const byUser = new Map<string, Person>();
  states.forEach((state, clientId) => {
    if (!state.user) return;
    const presence = state as Presence;
    const existing = byUser.get(presence.user.id);
    const better =
      !existing ||
      clientId === myClientId ||
      (existing.clientId !== myClientId && !existing.presence.cursor && Boolean(presence.cursor));
    const tabs = (existing?.tabs ?? 0) + 1;
    if (better) byUser.set(presence.user.id, { clientId, presence, isMe: presence.user.id === myUserId, tabs });
    else existing.tabs = tabs;
  });
  return [...byUser.values()].sort(
    (a, b) => Number(b.isMe) - Number(a.isMe) || a.presence.user.login.localeCompare(b.presence.user.login),
  );
}
