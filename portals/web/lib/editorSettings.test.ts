import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_EDITOR_SETTINGS, parseEditorSettings } from './editorSettings';

test('missing or broken settings give the defaults', () => {
  assert.deepEqual(parseEditorSettings(null), DEFAULT_EDITOR_SETTINGS);
  assert.deepEqual(parseEditorSettings('not json'), DEFAULT_EDITOR_SETTINGS);
  assert.deepEqual(parseEditorSettings('null'), DEFAULT_EDITOR_SETTINGS);
});

test('valid values are kept, invalid ones fall back one by one', () => {
  const settings = parseEditorSettings(
    JSON.stringify({ fontSize: 18, tabSize: 3, wordWrap: true, minimap: 'yes', lineNumbers: false }),
  );
  assert.deepEqual(settings, { fontSize: 18, tabSize: 4, wordWrap: true, minimap: false, lineNumbers: false });
  assert.equal(parseEditorSettings(JSON.stringify({ fontSize: 99 })).fontSize, 14);
});

test('zoom goes through the font sizes and shows a percentage', async () => {
  const { zoomPercent, zoomStep } = await import('./editorSettings');
  assert.equal(zoomStep(14, 1), 15);
  assert.equal(zoomStep(14, -1), 13);
  assert.equal(zoomStep(32, 1), 32); // largest
  assert.equal(zoomStep(10, -1), 10); // smallest
  assert.equal(zoomStep(17, 1), 18); // between steps
  assert.equal(zoomPercent(14), 100);
  assert.equal(zoomPercent(21), 150);
});
