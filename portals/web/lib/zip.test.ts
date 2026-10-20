import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { projectFromZip, projectToZip } from './zip';

test('a project survives a round trip through a zip', () => {
  const project = {
    files: { 'main.py': 'print("hi")\n', 'utils/greet.py': 'def greet():\n    pass\n' },
    folders: ['empty'],
  };
  const { project: back, skipped } = projectFromZip(projectToZip(project));
  assert.deepEqual(back.files, project.files);
  assert.deepEqual(back.folders, ['empty']);
  assert.deepEqual(skipped, []);
});

test('drops the single top-level folder of GitHub-style zips and junk files', () => {
  const zip = zipSync({
    'repo-main/index.js': strToU8('console.log(1)'),
    'repo-main/lib/a.js': strToU8('module.exports = 1'),
    'repo-main/.DS_Store': strToU8('x'),
    '__MACOSX/repo-main/._index.js': strToU8('x'),
  });
  const { project } = projectFromZip(zip);
  assert.deepEqual(Object.keys(project.files).sort(), ['index.js', 'lib/a.js']);
});

test('skips binary files, odd names and files over the limits', () => {
  const zip = zipSync({
    'main.py': strToU8('print(1)'),
    'logo.png': new Uint8Array([137, 80, 78, 71, 0, 1, 2]),
    'my file.txt': strToU8('spaces are not allowed'),
    'big.txt': strToU8('x'.repeat(300 * 1024)),
  });
  const { project, skipped } = projectFromZip(zip);
  assert.deepEqual(Object.keys(project.files), ['main.py']);
  assert.equal(skipped.length, 3);
  assert.ok(skipped.some((reason) => reason.startsWith('logo.png (not a text file')));
});
