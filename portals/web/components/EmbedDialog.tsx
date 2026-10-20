'use client';

import { useEffect, useState } from 'react';

// Shows the <iframe> snippet to put a project on another website
export function EmbedDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const snippet = `<iframe src="${window.location.origin}/embed/${slug}" width="100%" height="420" style="border:0;border-radius:8px" title="Bytebox project"></iframe>`;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="embed-title"
        className="w-full max-w-lg rounded-lg border border-line bg-panel p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="embed-title" className="mb-1 text-lg font-semibold">
          &lt;/&gt; Embed this project
        </h2>
        <p className="mb-4 text-sm text-muted">
          Paste this into a blog post or web page. Visitors see the code (and HTML previews) and can open it in Bytebox to run it.
        </p>
        <textarea
          readOnly
          value={snippet}
          rows={4}
          onFocus={(event) => event.target.select()}
          aria-label="Embed code"
          className="w-full resize-none rounded border border-line-strong bg-app p-2 font-mono text-xs text-fg outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <a href={`/embed/${slug}`} target="_blank" rel="noopener noreferrer" className="rounded px-3 py-2 text-sm text-muted hover:bg-raised hover:text-fg">
            Preview ↗
          </a>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(snippet);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
            className="rounded bg-accent px-3 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
          >
            {copied ? 'Copied ✓' : 'Copy code'}
          </button>
        </div>
      </div>
    </div>
  );
}
