// Copies the Material Icon Theme icons (the ones from VS Code) into public/material-icons and writes
// a small lookup file next to them. Runs before `next dev` and `next build`; the output isn't committed.
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const { generateManifest } = require('material-icon-theme');
const packageDir = dirname(require.resolve('material-icon-theme/package.json'));
const target = new URL('../public/material-icons/', import.meta.url).pathname;

mkdirSync(target, { recursive: true });
cpSync(join(packageDir, 'icons'), target, { recursive: true });

// Icon name → SVG file, and the names used for extensions, file names and folders (all lowercase)
const manifest = generateManifest();
const svg = (name) => manifest.iconDefinitions[name]?.iconPath.split('/').pop();
const pick = (map) => Object.fromEntries(Object.entries(map).map(([key, name]) => [key.toLowerCase(), svg(name)]).filter(([, file]) => file));

writeFileSync(
  join(target, 'lookup.json'),
  JSON.stringify({
    file: svg(manifest.file),
    folder: svg(manifest.folder),
    folderOpen: svg(manifest.folderExpanded),
    extensions: pick(manifest.fileExtensions),
    names: pick(manifest.fileNames),
    languages: pick(manifest.languageIds),
    folders: pick(manifest.folderNames),
    foldersOpen: pick(manifest.folderNamesExpanded),
  }),
);
console.log('Material icons copied to public/material-icons');
