'use client';

import { useEffect, useRef, useState } from 'react';
import { PREVIEW_MESSAGE, buildPreviewDocument } from '@/lib/preview';

interface LogLine {
  level: 'log' | 'info' | 'warn' | 'error';
  text: string;
}

interface Props {
  files: Record<string, string>;
  htmlPath: string;
}

// Live preview of an HTML file in a sandboxed iframe, with its console output underneath
export function PreviewPanel({ files, htmlPath }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [document, setDocument] = useState('');
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [reloads, setReloads] = useState(0);

  // Rebuild the page shortly after typing stops
  useEffect(() => {
    const timer = setTimeout(() => {
      setLogs([]);
      setDocument(buildPreviewDocument(files, htmlPath));
    }, 400);
    return () => clearTimeout(timer);
  }, [files, htmlPath, reloads]);

  // Console messages from the preview (only from our own iframe)
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.source !== PREVIEW_MESSAGE) return;
      setLogs((current) => [...current.slice(-199), { level: event.data.level, text: String(event.data.text) }]);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const levelClass = { log: 'text-fg', info: 'text-info', warn: 'text-warning', error: 'text-danger' };

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs">
        <span className="truncate font-mono text-muted">{htmlPath}</span>
        <button
          onClick={() => setReloads((count) => count + 1)}
          className="ml-auto rounded px-2 py-0.5 text-muted hover:bg-raised hover:text-fg"
          title="Reload the preview"
        >
          ⟳ Reload
        </button>
      </div>
      {/* allow-scripts without allow-same-origin: the page can't reach Bytebox cookies or the API */}
      <iframe
        ref={frameRef}
        title={`Preview of ${htmlPath}`}
        sandbox="allow-scripts allow-modals allow-forms"
        srcDoc={document}
        className="min-h-48 w-full flex-1 bg-white"
      />
      <div className="max-h-32 shrink-0 overflow-auto border-t border-line bg-app px-3 py-1.5 font-mono text-xs">
        {logs.length === 0 ? (
          <p className="text-subtle">Console output appears here.</p>
        ) : (
          logs.map((line, index) => (
            <p key={index} className={`whitespace-pre-wrap ${levelClass[line.level] ?? 'text-fg'}`}>
              {line.text}
            </p>
          ))
        )}
      </div>
    </section>
  );
}
