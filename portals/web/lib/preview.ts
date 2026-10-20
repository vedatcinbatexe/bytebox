// Builds one self-contained HTML document from a project's files, for the live preview.
// Linked CSS and JS files from the project are inlined; console output is sent to the parent page.

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

export function buildPreviewDocument(files: Record<string, string>, htmlPath: string): string {
  const folder = parentFolder(htmlPath);
  let html = files[htmlPath] ?? '';

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

  // The console bridge must run before the page's own scripts
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (head) => `${head}\n${CONSOLE_BRIDGE}`)
    : `${CONSOLE_BRIDGE}\n${html}`;
}

export function htmlFiles(files: Record<string, string>): string[] {
  return Object.keys(files)
    .filter((path) => path.toLowerCase().endsWith('.html'))
    .sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
}
