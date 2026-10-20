import { marked } from 'marked';

export interface MarkdownColors {
  background: string;
  text: string;
  muted: string;
  border: string;
  code: string;
  link: string;
}

// A complete HTML page for a Markdown file. It is shown in an iframe without scripts,
// and the CSP below also blocks scripts, so HTML inside the Markdown can't run code.
export function markdownDocument(markdown: string, colors: MarkdownColors): string {
  const body = marked.parse(markdown, { async: false, gfm: true });
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; style-src 'unsafe-inline'">
<base target="_blank">
<style>
  body { margin: 0; padding: 16px 20px; font: 15px/1.6 system-ui, sans-serif; background: ${colors.background}; color: ${colors.text}; }
  h1, h2 { border-bottom: 1px solid ${colors.border}; padding-bottom: 0.3em; }
  a { color: ${colors.link}; }
  code { font: 13px ui-monospace, monospace; background: ${colors.code}; padding: 0.15em 0.35em; border-radius: 4px; }
  pre { background: ${colors.code}; padding: 12px; border-radius: 6px; overflow: auto; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 0; padding-left: 1em; border-left: 4px solid ${colors.border}; color: ${colors.muted}; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid ${colors.border}; padding: 6px 12px; }
  img { max-width: 100%; }
  hr { border: 0; border-top: 1px solid ${colors.border}; }
</style>
</head>
<body>${body}</body>
</html>`;
}
