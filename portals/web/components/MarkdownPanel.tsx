'use client';

import { useEffect, useState } from 'react';
import { markdownDocument } from '@/lib/markdown';
import { useTheme } from '@/lib/theme';

interface Props {
  path: string;
  markdown: string;
}

// Theme colors from the CSS variables, so the preview matches the app
function themeColors() {
  const style = getComputedStyle(document.documentElement);
  const color = (name: string) => style.getPropertyValue(name).trim();
  return {
    background: color('--app'),
    text: color('--fg'),
    muted: color('--muted'),
    border: color('--line'),
    code: color('--raised'),
    link: color('--accent'),
  };
}

// Rendered preview of a Markdown file
export function MarkdownPanel({ path, markdown }: Props) {
  const theme = useTheme();
  const [page, setPage] = useState('');

  // Re-render shortly after typing stops, and when the theme changes
  useEffect(() => {
    const timer = setTimeout(() => setPage(markdownDocument(markdown, themeColors())), 200);
    return () => clearTimeout(timer);
  }, [markdown, theme]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-4 py-2 text-xs">
        <span className="truncate font-mono text-muted">{path}</span>
      </div>
      {/* No allow-scripts: HTML inside the Markdown can't run code. Links open in a new tab. */}
      <iframe
        title={`Preview of ${path}`}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        srcDoc={page}
        className="min-h-48 w-full flex-1 bg-app"
      />
    </section>
  );
}
