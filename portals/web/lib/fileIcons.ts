// File and folder icons from the Material Icon Theme (as in VS Code). The icons and the lookup
// table are copied into public/material-icons by scripts/copy-icons.mjs.

export interface IconLookup {
  file: string;
  folder: string;
  folderOpen: string;
  extensions: Record<string, string>; // "ts", "test.ts", … → svg file
  names: Record<string, string>; // "package.json", "dockerfile", …
  languages: Record<string, string>; // editor language ("python") → svg file
  folders: Record<string, string>;
  foldersOpen: Record<string, string>;
}

export const ICON_BASE = '/material-icons/';

// Exact file name, then the longest extension (app.test.ts → "test.ts", then "ts"), then the language
export function fileIcon(lookup: IconLookup, path: string, language?: string): string {
  const name = (path.split('/').pop() ?? '').toLowerCase();
  if (lookup.names[name]) return lookup.names[name];
  const parts = name.split('.');
  for (let start = 1; start < parts.length; start++) {
    const extension = parts.slice(start).join('.');
    if (lookup.extensions[extension]) return lookup.extensions[extension];
  }
  return (language && lookup.languages[language]) || lookup.file;
}

export function folderIcon(lookup: IconLookup, path: string, open: boolean): string {
  const name = (path.split('/').pop() ?? '').toLowerCase();
  return open ? lookup.foldersOpen[name] ?? lookup.folderOpen : lookup.folders[name] ?? lookup.folder;
}

// The lookup table is fetched once and shared
let loading: Promise<IconLookup | null> | null = null;
export function loadIconLookup(): Promise<IconLookup | null> {
  loading ??= fetch(`${ICON_BASE}lookup.json`)
    .then((response) => (response.ok ? (response.json() as Promise<IconLookup>) : null))
    .catch(() => null);
  return loading;
}
