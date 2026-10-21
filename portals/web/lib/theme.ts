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

// Code colors per theme. Monaco's language tokenizers name tokens like "keyword.cs" or "string.java",
// and a rule for "keyword" covers all of them.
interface Palette {
  keyword: string;
  control: string; // if, return, … where the tokenizer tells them apart
  string: string;
  escape: string;
  number: string;
  comment: string;
  type: string;
  annotation: string; // @GetMapping, decorators
  tag: string; // HTML/XML tags
  attribute: string;
  operator: string;
  delimiter: string;
  key: string; // JSON keys
  predefined: string; // built-in names
  regexp: string;
}

const PALETTES: Record<ThemeId, Palette> = {
  // One Dark
  dark: {
    keyword: 'c678dd', control: 'c678dd', string: '98c379', escape: '56b6c2', number: 'd19a66', comment: '7f848e',
    type: 'e5c07b', annotation: '61afef', tag: 'e06c75', attribute: 'd19a66', operator: '56b6c2',
    delimiter: 'abb2bf', key: 'e06c75', predefined: '61afef', regexp: '56b6c2',
  },
  // GitHub light
  light: {
    keyword: 'cf222e', control: 'cf222e', string: '0a3069', escape: '0550ae', number: '0550ae', comment: '6e7781',
    type: '953800', annotation: '8250df', tag: '116329', attribute: '0550ae', operator: 'cf222e',
    delimiter: '24292f', key: '0550ae', predefined: '8250df', regexp: '116329',
  },
  // Tokyo Night
  blue: {
    keyword: 'bb9af7', control: 'bb9af7', string: '9ece6a', escape: '89ddff', number: 'ff9e64', comment: '565f89',
    type: '2ac3de', annotation: 'e0af68', tag: 'f7768e', attribute: '7aa2f7', operator: '89ddff',
    delimiter: 'a9b1d6', key: '7aa2f7', predefined: '7dcfff', regexp: 'b4f9f8',
  },
  // Dracula
  purple: {
    keyword: 'ff79c6', control: 'ff79c6', string: 'f1fa8c', escape: 'ff79c6', number: 'bd93f9', comment: '6272a4',
    type: '8be9fd', annotation: '50fa7b', tag: 'ff79c6', attribute: '50fa7b', operator: 'ff79c6',
    delimiter: 'f8f8f2', key: '8be9fd', predefined: '50fa7b', regexp: 'f1fa8c',
  },
  // Synthwave '84
  synthwave: {
    keyword: 'fede5d', control: 'fede5d', string: 'ff8b39', escape: 'ff7edb', number: 'f97e72', comment: '848bbd',
    type: '36f9f6', annotation: '72f1b8', tag: '72f1b8', attribute: 'fede5d', operator: 'ff7edb',
    delimiter: 'ff7edb', key: '36f9f6', predefined: '36f9f6', regexp: 'ff8b39',
  },
};

function tokenRules(theme: ThemeId) {
  const p = PALETTES[theme];
  return [
    { token: 'keyword', foreground: p.keyword },
    { token: 'keyword.flow', foreground: p.control },
    { token: 'keyword.control', foreground: p.control },
    { token: 'storage', foreground: p.keyword },
    { token: 'string', foreground: p.string },
    { token: 'string.escape', foreground: p.escape },
    { token: 'string.key.json', foreground: p.key },
    { token: 'string.value.json', foreground: p.string },
    { token: 'number', foreground: p.number },
    { token: 'constant', foreground: p.number },
    { token: 'comment', foreground: p.comment, fontStyle: 'italic' },
    { token: 'type', foreground: p.type },
    { token: 'type.identifier', foreground: p.type },
    { token: 'annotation', foreground: p.annotation },
    { token: 'metatag', foreground: p.annotation },
    { token: 'tag', foreground: p.tag },
    { token: 'attribute.name', foreground: p.attribute },
    { token: 'attribute.value', foreground: p.string },
    { token: 'operator', foreground: p.operator },
    { token: 'delimiter', foreground: p.delimiter },
    { token: 'key', foreground: p.key },
    { token: 'predefined', foreground: p.predefined },
    { token: 'variable', foreground: p.tag },
    { token: 'regexp', foreground: p.regexp },
  ];
}

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
    rules: tokenRules(theme),
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
      'editorIndentGuide.activeBackground1': c.subtle,
      'editorBracketMatch.background': `${c.accent}33`,
      'editorBracketMatch.border': `${c.accent}99`,
      // Matching brackets get their own colors, nested levels in turn
      'editorBracketHighlight.foreground1': `#${PALETTES[theme].type}`,
      'editorBracketHighlight.foreground2': `#${PALETTES[theme].keyword}`,
      'editorBracketHighlight.foreground3': `#${PALETTES[theme].annotation}`,
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
