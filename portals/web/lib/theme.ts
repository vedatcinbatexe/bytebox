// Themes: the colors live in app/globals.css; this file switches between them
// and gives the editor (Monaco) and terminal (xterm) matching colors.

'use client';

import { useEffect, useState } from 'react';
import { THEME_STORAGE_KEY } from './themeScript';

export type ThemeId = 'dark' | 'synthwave' | 'blue' | 'purple' | 'light';

export const THEMES: { id: ThemeId; name: string; swatch: [string, string] }[] = [
  { id: 'dark', name: 'Dark', swatch: ['#09090b', '#059669'] },
  { id: 'synthwave', name: 'Synthwave', swatch: ['#1a1033', '#ff2e97'] },
  { id: 'blue', name: 'Blue', swatch: ['#0a1222', '#2f7bf5'] },
  { id: 'purple', name: 'Purple', swatch: ['#110b1d', '#8b5cf6'] },
  { id: 'light', name: 'Light', swatch: ['#ffffff', '#059669'] },
];

const CHANGE_EVENT = 'bytebox:theme';

function currentTheme(): ThemeId {
  const theme = document.documentElement.dataset.theme as ThemeId | undefined;
  return THEMES.some((item) => item.id === theme) ? theme! : 'dark';
}

export function setTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // the theme still applies, it just isn't remembered
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

// The active theme; re-renders when it changes anywhere on the page
export function useTheme(): ThemeId {
  const [theme, setState] = useState<ThemeId>('dark');
  useEffect(() => {
    const update = () => setState(currentTheme());
    update();
    window.addEventListener(CHANGE_EVENT, update);
    return () => window.removeEventListener(CHANGE_EVENT, update);
  }, []);
  return theme;
}

// The CSS minifier shortens colors (#ffffff -> #fff), but Monaco only accepts #rrggbb
function sixDigitHex(color: string): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : color;
}

// Read the active theme's colors from the CSS variables
export function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const color = (name: string) => sixDigitHex(css.getPropertyValue(`--${name}`).trim());
  return {
    app: color('app'),
    panel: color('panel'),
    raised: color('raised'),
    line: color('line'),
    fg: color('fg'),
    muted: color('muted'),
    subtle: color('subtle'),
    accent: color('accent'),
    success: color('success'),
    warning: color('warning'),
    info: color('info'),
  };
}

// Brighter code colors for Synthwave; other themes use Monaco's defaults
const SYNTHWAVE_TOKENS = [
  { token: 'keyword', foreground: 'fede5d' },
  { token: 'string', foreground: 'ff8b39' },
  { token: 'number', foreground: 'f97e72' },
  { token: 'comment', foreground: '848bbd', fontStyle: 'italic' },
  { token: 'type', foreground: '36f9f6' },
  { token: 'identifier', foreground: 'fbeaff' },
  { token: 'delimiter', foreground: 'ff7edb' },
];

// Minimal Monaco type: just what we use
interface MonacoLike {
  editor: {
    defineTheme: (name: string, data: object) => void;
    setTheme: (name: string) => void;
  };
}

export const MONACO_THEME = 'bytebox';

export function applyMonacoTheme(monaco: MonacoLike, theme: ThemeId) {
  const c = themeColors();
  monaco.editor.defineTheme(MONACO_THEME, {
    base: theme === 'light' ? 'vs' : 'vs-dark',
    inherit: true,
    rules: theme === 'synthwave' ? SYNTHWAVE_TOKENS : [],
    colors: {
      'editor.background': c.app,
      'editor.foreground': c.fg,
      'editor.lineHighlightBackground': c.raised,
      'editorLineNumber.foreground': c.subtle,
      'editorLineNumber.activeForeground': c.fg,
      'editorCursor.foreground': c.accent,
      'editor.selectionBackground': `${c.accent}55`,
      'editorWidget.background': c.panel,
      'editorWidget.border': c.line,
      'editorIndentGuide.background1': c.line,
    },
  });
  monaco.editor.setTheme(MONACO_THEME);
}

export function terminalTheme() {
  const c = themeColors();
  return {
    background: c.app,
    foreground: c.fg,
    cursor: c.accent,
    cursorAccent: c.app,
    selectionBackground: `${c.accent}55`,
  };
}
