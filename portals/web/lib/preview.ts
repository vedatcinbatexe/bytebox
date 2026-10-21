// Builds one self-contained HTML document from a project's files, for the live preview.
// Linked CSS and JS files from the project are inlined; console output is sent to the parent page.

import { buildModules, type Compile } from './modules';
import { parentFolder } from './project';

export const PREVIEW_MESSAGE = 'bytebox-preview';

// Resolve "style.css", "./css/app.css" or "../x.js" relative to the HTML file's folder
function resolvePath(fromFolder: string, href: string): string | null {
  if (/^([a-z]+:)?\/\//i.test(href) || href.startsWith('data:')) return null; // external URL
  const parts = (href.startsWith('/') ? href.slice(1) : fromFolder ? `${fromFolder}/${href}` : href).split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  return resolved.join('/');
}

// Sends console.log/info/warn/error and uncaught errors to the Bytebox page
const CONSOLE_BRIDGE = `<script>
(function () {
  function send(level, args) {
    var text = Array.prototype.map.call(args, function (value) {
      if (typeof value === 'string') return value;
      try { return JSON.stringify(value); } catch (e) { return String(value); }
    }).join(' ');
    parent.postMessage({ source: '${PREVIEW_MESSAGE}', level: level, text: text }, '*');
  }
  ['log', 'info', 'warn', 'error'].forEach(function (level) {
    var original = console[level];
    console[level] = function () { send(level, arguments); original.apply(console, arguments); };
  });
  window.addEventListener('error', function (event) { send('error', [event.message + ' (line ' + event.lineno + ')']); });
})();
</script>`;

// <script type="module" src="…"> pointing at a project file: run it as ES modules (React, …)
const MODULE_SCRIPT = /<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi;

// The project files that are module entry points of this page (they need the compiler)
export function moduleEntries(files: Record<string, string>, htmlPath: string): string[] {
  const folder = parentFolder(htmlPath);
  return [...(files[htmlPath] ?? '').matchAll(MODULE_SCRIPT)]
    .map((match) => resolvePath(folder, match[1]))
    .filter((path): path is string => path !== null && path in files);
}

export function buildPreviewDocument(files: Record<string, string>, htmlPath: string, compile?: Compile): string {
  const folder = parentFolder(htmlPath);
  let html = files[htmlPath] ?? '';

  // Module scripts: one import map for all of them, then load each entry
  const imports: Record<string, string> = {};
  const errors: string[] = [];
  if (compile) {
    html = html.replace(MODULE_SCRIPT, (tag, src: string) => {
      const path = resolvePath(folder, src);
      if (!path || !(path in files)) return tag;
      const build = buildModules(files, path, compile);
      Object.assign(imports, build.importMap.imports);
      errors.push(...build.errors);
      // With errors the app can't start anyway; the errors are shown instead
      if (build.errors.length > 0) return `<!-- ${path} not started: see the errors -->`;
      const entry = JSON.stringify(build.entry);
      return `<script type="module" data-file="${path}">import(${entry}).catch((error) => console.error('Could not start ${path}: ' + error.message));</script>`;
    });
  }

  // <link rel="stylesheet" href="style.css"> -> <style>…</style>
  html = html.replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (tag, href: string) => {
    const path = resolvePath(folder, href);
    if (!/rel=["']?stylesheet/i.test(tag) || !path || !(path in files)) return tag;
    return `<style data-file="${path}">\n${files[path]}\n</style>`;
  });

  // <script src="script.js"></script> -> <script>…</script>
  html = html.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, before: string, src: string, after: string) => {
    const path = resolvePath(folder, src);
    if (!path || !(path in files)) return tag;
    const code = files[path].replace(/<\/script/gi, '<\\/script'); // don't end the tag early
    const attributes = `${before}${after}`.replace(/\s+/g, ' ').trimEnd(); // keep e.g. type="module"
    return `<script${attributes} data-file="${path}">\n${code}\n</script>`;
  });

  // The console bridge must run before the page's own scripts, and the import map before any module
  let first = CONSOLE_BRIDGE;
  if (Object.keys(imports).length > 0) {
    first += `\n<script type="importmap">${JSON.stringify({ imports }).replace(/</g, '\\u003c')}</script>`;
  }
  if (errors.length > 0) {
    const list = JSON.stringify(errors).replace(/</g, '\\u003c');
    first += `\n<script>${list}.forEach(function (error) { console.error(error); });
window.addEventListener('DOMContentLoaded', function () {
  var box = document.createElement('pre');
  box.style.cssText = 'position:fixed;inset:auto 8px 8px 8px;margin:0;padding:10px;background:#7f1d1d;color:#fff;font:12px/1.5 monospace;white-space:pre-wrap;border-radius:6px;z-index:2147483647';
  box.textContent = '⚠ ' + ${list}.join('\\n⚠ ');
  document.body.appendChild(box);
});</script>`;
  }
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (head) => `${head}\n${first}`)
    : `${first}\n${html}`;
}

export function htmlFiles(files: Record<string, string>): string[] {
  return Object.keys(files)
    .filter((path) => path.toLowerCase().endsWith('.html'))
    .sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
}
