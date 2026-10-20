import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moveTarget, renamePath } from './project';

const project = {
  files: { 'main.py': '', 'utils/greet.py': '', 'utils/deep/x.py': '', 'other/greet.py': '' },
  folders: ['empty'],
};

test('moves a file into a folder or to the root', () => {
  assert.deepEqual(moveTarget(project, 'main.py', 'utils'), { to: 'utils/main.py' });
  assert.deepEqual(moveTarget(project, 'utils/deep/x.py', ''), { to: 'x.py' });
});

test('dropping in the same place does nothing', () => {
  assert.deepEqual(moveTarget(project, 'utils/greet.py', 'utils'), { error: '' });
});

test('refuses to move a folder into itself or onto an existing name', () => {
  assert.match((moveTarget(project, 'utils', 'utils/deep') as { error: string }).error, /into itself/);
  assert.match((moveTarget(project, 'other/greet.py', 'utils') as { error: string }).error, /already exists/);
});

test('renamePath moves a folder with everything inside', () => {
  const moved = renamePath(project, 'utils', 'empty/utils');
  assert.deepEqual(Object.keys(moved.files).sort(), [
    'empty/utils/deep/x.py',
    'empty/utils/greet.py',
    'main.py',
    'other/greet.py',
  ]);
});
