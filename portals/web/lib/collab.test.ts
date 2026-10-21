import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as Y from 'yjs';
import { colorFor, distinctPeople, readShared, replaceText, writeLocalChanges, type Presence, type SharedState } from './collab';

function docWith(state: SharedState): Y.Doc {
  const doc = new Y.Doc();
  writeLocalChanges(doc, { files: {}, folders: [], title: '', stdin: '', args: '' }, state, null, 'test');
  return doc;
}

const base: SharedState = {
  files: { 'main.py': 'print(1)\n', 'lib/util.py': 'x = 1\n' },
  folders: ['empty'],
  title: 'Shared',
  stdin: '',
  args: '',
};

test('replaceText only touches the part that changed', () => {
  const doc = new Y.Doc();
  const text = doc.getText('t');
  text.insert(0, 'hello world');
  let deltas: unknown[] = [];
  text.observe((event) => (deltas = event.delta));
  replaceText(text, 'hello brave world');
  assert.equal(text.toString(), 'hello brave world');
  assert.deepEqual(deltas, [{ retain: 6 }, { insert: 'brave ' }]);
});

test('local changes are written, remote changes are kept', () => {
  const doc = docWith(base);
  assert.deepEqual(readShared(doc), base);

  // Someone else edits util.py in the document…
  replaceText(doc.getMap<Y.Text>('files').get('lib/util.py')!, 'x = 2\n');
  // …while we rename main.py, add a folder and change the title (util.py unchanged on our side)
  const ours: SharedState = {
    ...base,
    files: { 'app.py': 'print(1)\n', 'lib/util.py': 'x = 1\n' },
    folders: ['empty', 'docs'],
    title: 'Renamed',
  };
  writeLocalChanges(doc, base, ours, null, 'test');

  const shared = readShared(doc);
  assert.deepEqual(Object.keys(shared.files).sort(), ['app.py', 'lib/util.py']);
  assert.equal(shared.files['lib/util.py'], 'x = 2\n'); // the remote edit survived
  assert.deepEqual(shared.folders, ['docs', 'empty']);
  assert.equal(shared.title, 'Renamed');
});

test('the file bound to the editor is skipped, and colors are stable', () => {
  const doc = docWith(base);
  writeLocalChanges(doc, base, { ...base, files: { ...base.files, 'main.py': 'stale' } }, 'main.py', 'test');
  assert.equal(readShared(doc).files['main.py'], 'print(1)\n');
  assert.equal(colorFor('user-1'), colorFor('user-1'));
  assert.match(colorFor('someone'), /^#[0-9a-f]{6}$/);
});

test('people are listed once per account, however many tabs they have open', () => {
  const user = (id: string, login: string) => ({ id, login, name: login, avatarUrl: '', color: colorFor(id) });
  const states = new Map<number, Partial<Presence>>([
    [1, { user: user('u-bob', 'bob') }],
    [2, { user: user('u-bob', 'bob'), cursor: { path: 'main.py', anchor: null, head: null } }],
    [3, { user: user('u-me', 'tester') }], // me, another tab
    [4, { user: user('u-me', 'tester') }], // me, this tab
    [5, {}], // connected but no user yet
  ]);
  const people = distinctPeople(states, 4, 'u-me');
  assert.deepEqual(
    people.map((person) => [person.presence.user.login, person.clientId, person.tabs, person.isMe]),
    [
      ['tester', 4, 2, true],
      ['bob', 2, 2, false], // the tab with a cursor, so we know which file bob is in
    ],
  );
});
