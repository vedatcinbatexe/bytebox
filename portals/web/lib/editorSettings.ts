// Editor preferences, remembered per browser
import { load, save } from './storage';

export interface EditorSettings {
  fontSize: number;
  tabSize: 2 | 4;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontSize: 14,
  tabSize: 4,
  wordWrap: false,
  minimap: false,
  lineNumbers: true,
};

// Also the zoom steps (− / + in the status bar); 14 px is 100%
export const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32];

// The next bigger or smaller size (a size between two steps goes to the nearest step that way)
export function zoomStep(fontSize: number, direction: 1 | -1): number {
  if (direction > 0) return FONT_SIZES.find((size) => size > fontSize) ?? FONT_SIZES[FONT_SIZES.length - 1];
  return [...FONT_SIZES].reverse().find((size) => size < fontSize) ?? FONT_SIZES[0];
}

export function zoomPercent(fontSize: number): number {
  return Math.round((fontSize / DEFAULT_EDITOR_SETTINGS.fontSize) * 100);
}

const STORAGE_KEY = 'bytebox:editor';

// Anything missing or invalid falls back to the default
export function parseEditorSettings(json: string | null): EditorSettings {
  let saved: Partial<EditorSettings> = {};
  try {
    saved = JSON.parse(json ?? '{}') ?? {};
  } catch {
    // keep the defaults
  }
  const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
  return {
    fontSize: FONT_SIZES.includes(saved.fontSize as number) ? (saved.fontSize as number) : DEFAULT_EDITOR_SETTINGS.fontSize,
    tabSize: saved.tabSize === 2 || saved.tabSize === 4 ? saved.tabSize : DEFAULT_EDITOR_SETTINGS.tabSize,
    wordWrap: flag(saved.wordWrap, DEFAULT_EDITOR_SETTINGS.wordWrap),
    minimap: flag(saved.minimap, DEFAULT_EDITOR_SETTINGS.minimap),
    lineNumbers: flag(saved.lineNumbers, DEFAULT_EDITOR_SETTINGS.lineNumbers),
  };
}

export function loadEditorSettings(): EditorSettings {
  return parseEditorSettings(load(STORAGE_KEY));
}

export function saveEditorSettings(settings: EditorSettings) {
  save(STORAGE_KEY, JSON.stringify(settings));
}
