import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileIcon, folderIcon, type IconLookup } from './fileIcons';

// The real table from material-icon-theme (made by `npm run predev` / `prebuild`)
const lookup = JSON.parse(
  readFileSync(new URL('../public/material-icons/lookup.json', import.meta.url), 'utf8'),
) as IconLookup;

test('files get the Material icon for their name, extension or language', () => {
  assert.equal(fileIcon(lookup, 'main.py'), 'python.svg');
  assert.equal(fileIcon(lookup, 'Program.cs'), 'csharp.svg');
  assert.equal(fileIcon(lookup, 'src/App.jsx'), 'react.svg');
  assert.equal(fileIcon(lookup, 'package.json'), 'nodejs.svg');
  assert.equal(fileIcon(lookup, 'README.md'), 'readme.svg');
  assert.equal(fileIcon(lookup, 'app.test.ts'), fileIcon(lookup, 'x.test.ts')); // compound extension
  assert.equal(fileIcon(lookup, 'notes.unknownext'), 'file.svg');
});

test('known folders get their own icon, open and closed', () => {
  assert.equal(folderIcon(lookup, 'src', false), 'folder-src.svg');
  assert.equal(folderIcon(lookup, 'project/src', true), 'folder-src-open.svg');
  assert.equal(folderIcon(lookup, 'my-stuff', false), 'folder.svg');
  assert.equal(folderIcon(lookup, 'my-stuff', true), 'folder-open.svg');
});
