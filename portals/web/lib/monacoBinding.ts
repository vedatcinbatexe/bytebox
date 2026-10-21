// Connects one Monaco editor model to one Y.Text, both ways, and shows other people's cursors.
// (Like y-monaco, but small and without importing a second copy of Monaco.)
import type { OnMount } from '@monaco-editor/react';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import type { Presence } from './collab';

type Editor = Parameters<OnMount>[0];
type Monaco = Parameters<OnMount>[1];

const STYLE_ID = 'bytebox-collab-cursors';

// One CSS rule set per remote person: their selection color and a cursor with their name
function updateCursorStyles(people: { clientId: number; name: string; color: string }[]) {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = people
    .map(({ clientId, name, color }) => {
      const label = JSON.stringify(name.replace(/[^\w .@-]/g, '').slice(0, 30)); // safe inside CSS
      return `
.yc-selection-${clientId} { background-color: ${color}40; }
.yc-cursor-${clientId} { position: relative; border-left: 2px solid ${color}; margin-left: -1px; }
.yc-cursor-${clientId}::after {
  content: ${label}; position: absolute; left: -2px; top: -1.25em; z-index: 10;
  background: ${color}; color: #fff; font: 600 10px/1.4 system-ui, sans-serif; padding: 0 4px;
  border-radius: 3px 3px 3px 0; white-space: nowrap; pointer-events: none;
}`;
    })
    .join('\n');
}

export function bindEditor(
  monaco: Monaco,
  editor: Editor,
  doc: Y.Doc,
  text: Y.Text,
  awareness: Awareness,
  path: string,
): () => void {
  const model = editor.getModel();
  if (!model) return () => {};
  let applyingRemote = false;
  const origin = {}; // marks our own edits, so we don't apply them twice

  // Start from the shared text
  if (model.getValue() !== text.toString()) {
    applyingRemote = true;
    model.setValue(text.toString());
    applyingRemote = false;
  }

  // Remote edits → editor
  const onTextChange = (event: Y.YTextEvent, transaction: Y.Transaction) => {
    if (transaction.origin === origin) return;
    applyingRemote = true;
    let index = 0;
    const edits: { range: InstanceType<Monaco['Range']>; text: string }[] = [];
    for (const op of event.delta) {
      if (op.retain !== undefined) {
        index += op.retain;
      } else if (op.insert !== undefined) {
        const position = model.getPositionAt(index);
        edits.push({ range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: op.insert as string });
        // Later ops count from the document *before* this change, as Monaco applies the edits together
      } else if (op.delete !== undefined) {
        const start = model.getPositionAt(index);
        const end = model.getPositionAt(index + op.delete);
        edits.push({ range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column), text: '' });
        index += op.delete;
      }
    }
    model.pushEditOperations([], edits, () => null);
    applyingRemote = false;
    renderCursors();
  };
  text.observe(onTextChange);

  // Our edits → shared text (last change first, so the offsets stay right)
  const contentListener = model.onDidChangeContent((event) => {
    if (applyingRemote) return;
    doc.transact(() => {
      for (const change of [...event.changes].sort((a, b) => b.rangeOffset - a.rangeOffset)) {
        if (change.rangeLength > 0) text.delete(change.rangeOffset, change.rangeLength);
        if (change.text) text.insert(change.rangeOffset, change.text);
      }
    }, origin);
  });

  // Our cursor → everyone (relative positions follow the text as others type)
  const shareCursor = () => {
    const selection = editor.getSelection();
    if (!selection) return;
    const anchor = model.getOffsetAt(selection.getStartPosition());
    const head = model.getOffsetAt(selection.getEndPosition());
    awareness.setLocalStateField('cursor', {
      path,
      anchor: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, anchor)),
      head: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, head)),
    });
  };
  const selectionListener = editor.onDidChangeCursorSelection(shareCursor);
  shareCursor();

  // Everyone else's cursor in this file → decorations
  const decorations = editor.createDecorationsCollection();
  function renderCursors() {
    const people: { clientId: number; name: string; color: string }[] = [];
    const ranges: Parameters<typeof decorations.set>[0][number][] = [];
    const myUserId = (awareness.getLocalState() as Partial<Presence> | null)?.user?.id;
    awareness.getStates().forEach((state, clientId) => {
      const presence = state as Partial<Presence>;
      // Only other people: not this tab, and not your own other tabs
      if (clientId === doc.clientID || !presence.user || presence.user.id === myUserId) return;
      people.push({ clientId, name: presence.user.login || presence.user.name, color: presence.user.color });
      const cursor = presence.cursor;
      if (!cursor || cursor.path !== path) return;
      const anchor = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(cursor.anchor), doc);
      const head = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(cursor.head), doc);
      if (!anchor || !head || anchor.type !== text || head.type !== text) return;
      const start = model!.getPositionAt(Math.min(anchor.index, head.index));
      const end = model!.getPositionAt(Math.max(anchor.index, head.index));
      if (anchor.index !== head.index) {
        ranges.push({
          range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
          options: { className: `yc-selection-${clientId}` },
        });
      }
      ranges.push({
        range: new monaco.Range(end.lineNumber, end.column, end.lineNumber, end.column),
        options: { beforeContentClassName: `yc-cursor-${clientId}`, showIfCollapsed: true },
      });
    });
    updateCursorStyles(people);
    decorations.set(ranges);
  }
  awareness.on('change', renderCursors);
  renderCursors();

  return () => {
    text.unobserve(onTextChange);
    contentListener.dispose();
    selectionListener.dispose();
    awareness.off('change', renderCursors);
    decorations.clear();
  };
}
