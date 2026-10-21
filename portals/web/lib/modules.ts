// Runs frameworks like React in the live preview, without a server or a build step:
// project files become ES modules in an import map, and npm packages come from the esm.sh CDN.
//
//   <script type="module" src="/src/main.jsx">  →  every file it imports, compiled (JSX/TypeScript),
//   with imports between project files renamed to "@project/<path>" and stored as data: URLs.

export type Compile = (code: string, path: string) => string;

export interface ModuleBuild {
  importMap: { imports: Record<string, string> };
  entry: string; // e.g. "@project/src/main.jsx"
  errors: string[];
}

const SCRIPT = /\.(m?js|jsx|ts|tsx)$/i;
const EXTENSIONS = ['', '.jsx', '.tsx', '.js', '.ts', '.mjs', '/index.jsx', '/index.tsx', '/index.js', '/index.ts'];
const CDN = 'https://esm.sh';
// Used when a project has no package.json (or doesn't list the package)
const DEFAULT_VERSIONS: Record<string, string> = { react: '18.3.1', 'react-dom': '18.3.1' };

// import x from "a" · import "a" · export { x } from "a" · import("a")
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(?\s*)(["'])([^"'\n]+)\2/g;

export const projectSpecifier = (path: string) => `@project/${path}`;

// "./App" from "src/main.jsx" → "src/App.jsx" (trying the usual extensions)
function resolveFile(files: Record<string, string>, fromPath: string, specifier: string): string | null {
  const folder = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';
  const parts = (specifier.startsWith('/') ? specifier.slice(1) : `${folder}/${specifier}`).split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  const base = resolved.join('/');
  for (const extension of EXTENSIONS) if (`${base}${extension}` in files) return `${base}${extension}`;
  return null;
}

// "react-dom/client" → ["react-dom", "/client"], "@mui/material/Button" → ["@mui/material", "/Button"]
function splitPackage(specifier: string): [string, string] {
  const parts = specifier.split('/');
  const length = specifier.startsWith('@') ? 2 : 1;
  return [parts.slice(0, length).join('/'), parts.slice(length).join('/') ? `/${parts.slice(length).join('/')}` : ''];
}

// Versions from package.json ("^18.3.1" → "18.3.1"); anything unusual is left to esm.sh
function packageVersions(files: Record<string, string>): Record<string, string> {
  const versions = { ...DEFAULT_VERSIONS };
  try {
    const pkg = JSON.parse(files['package.json'] ?? '{}');
    for (const [name, range] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
      const version = String(range).replace(/^[\^~=v]+/, '');
      if (/^\d+(\.\d+){0,2}$/.test(version)) versions[name] = version;
    }
  } catch {
    // a broken package.json: use the defaults
  }
  return versions;
}

// One URL per package specifier. ?external leaves the project's other packages as bare imports
// (e.g. react-dom's import of "react"), so the import map gives everyone the same copy of React.
function packageUrl(specifier: string, versions: Record<string, string>): string {
  const [name, subpath] = splitPackage(specifier);
  const version = versions[name] ? `@${versions[name]}` : '';
  const external = Object.keys(versions).filter((other) => other !== name);
  return `${CDN}/${name}${version}${subpath}${external.length > 0 ? `?external=${external.join(',')}` : ''}`;
}

function dataUrl(code: string): string {
  // UTF-8 safe base64 (works in browsers and Node)
  const bytes = new TextEncoder().encode(code);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:text/javascript;base64,${btoa(binary)}`;
}

// The module for a non-script file that is imported, e.g. import './App.css'
function assetModule(path: string, content: string): string {
  if (path.toLowerCase().endsWith('.css')) {
    return `const style = document.createElement('style');
style.dataset.file = ${JSON.stringify(path)};
style.textContent = ${JSON.stringify(content)};
document.head.appendChild(style);
export default ${JSON.stringify(content)};`;
  }
  if (path.toLowerCase().endsWith('.json')) return `export default ${content.trim() || 'null'};`;
  return `export default ${JSON.stringify(content)};`; // e.g. .txt, .svg as text
}

export function buildModules(files: Record<string, string>, entryPath: string, compile: Compile): ModuleBuild {
  const versions = packageVersions(files);
  const imports: Record<string, string> = {};
  const errors: string[] = [];
  const done = new Set<string>();
  const queue = [entryPath];

  while (queue.length > 0) {
    const path = queue.shift()!;
    if (done.has(path)) continue;
    done.add(path);

    if (!SCRIPT.test(path)) {
      imports[projectSpecifier(path)] = dataUrl(assetModule(path, files[path]));
      continue;
    }

    let code: string;
    try {
      code = compile(files[path], path);
    } catch (error) {
      errors.push(`${path}: ${(error as Error).message}`);
      continue;
    }
    code = code.replace(SPECIFIER, (match, prefix: string, quote: string, specifier: string) => {
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        const target = resolveFile(files, path, specifier);
        if (!target) {
          errors.push(`${path}: can't find "${specifier}"`);
          return match;
        }
        queue.push(target);
        return `${prefix}${quote}${projectSpecifier(target)}${quote}`;
      }
      if (!/^(https?:|data:)/.test(specifier)) imports[specifier] ??= packageUrl(specifier, versions);
      return match;
    });
    imports[projectSpecifier(path)] = dataUrl(code);
  }

  // Packages imported by other packages (not by our code) still need an entry
  for (const name of Object.keys(versions)) imports[name] ??= packageUrl(name, versions);
  return { importMap: { imports }, entry: projectSpecifier(entryPath), errors };
}
