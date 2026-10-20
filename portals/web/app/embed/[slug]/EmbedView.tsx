'use client';

import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { PreviewPanel } from '@/components/PreviewPanel';
import { editorLanguage } from '@/lib/project';
import { htmlFiles } from '@/lib/preview';
import { fetchProject, type SavedProject } from '@/lib/projects';
import { MONACO_THEME, applyMonacoTheme, useTheme } from '@/lib/theme';

// Compact, read-only view of a project for other websites (<iframe src="/embed/<slug>">).
// Running code needs a login, and login cookies aren't sent inside other sites' iframes,
// so code opens in Bytebox to run; HTML pages preview right here.
export function EmbedView({ slug }: { slug: string }) {
  const theme = useTheme();
  const [saved, setSaved] = useState<SavedProject | null | undefined>(undefined);
  const [active, setActive] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetchProject(slug)
      .then((project) => {
        setSaved(project);
        if (!project) return;
        const paths = Object.keys(project.project.files).sort();
        const first =
          paths.find((path) => /^(main\.(py|js|ts|cpp)|Main\.java|index\.html)$/.test(path)) ?? paths[0] ?? null;
        setActive(first);
        setShowPreview(htmlFiles(project.project.files).length > 0);
      })
      .catch(() => setSaved(null));
  }, [slug]);

  // Relative: inside the iframe it still points at Bytebox
  const openUrl = `/p/${slug}`;

  if (saved === undefined) return <div className="flex h-dvh items-center justify-center text-subtle">Loading…</div>;
  if (saved === null) {
    return <div className="flex h-dvh items-center justify-center text-sm text-muted">This project isn’t available.</div>;
  }

  const files = saved.project.files;
  const pages = htmlFiles(files);

  return (
    <div className="flex h-dvh flex-col bg-app text-fg">
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-panel px-3 py-2 text-sm">
        <span className="font-bold">📦</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{saved.title}</span>
        {saved.ownerLogin && <span className="hidden text-xs text-muted sm:inline">by @{saved.ownerLogin}</span>}
        {pages.length > 0 && (
          <button
            onClick={() => setShowPreview((value) => !value)}
            className="rounded border border-line-strong px-2 py-1 text-xs hover:bg-raised"
          >
            {showPreview ? '‹/› Code' : '👁 Preview'}
          </button>
        )}
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded bg-accent px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-accent-fg hover:bg-accent-hover"
        >
          Open &amp; run in Bytebox ↗
        </a>
      </header>

      {showPreview && pages.length > 0 ? (
        <PreviewPanel files={files} htmlPath={pages[0]} />
      ) : (
        <>
          <div className="flex shrink-0 overflow-x-auto border-b border-line bg-panel text-xs">
            {Object.keys(files)
              .sort()
              .map((path) => (
                <button
                  key={path}
                  onClick={() => setActive(path)}
                  className={`shrink-0 border-t-2 border-r border-r-line px-3 py-1.5 font-mono ${
                    path === active ? 'border-t-accent bg-app text-fg' : 'border-t-transparent text-muted hover:text-fg'
                  }`}
                >
                  {path}
                </button>
              ))}
          </div>
          <div className="min-h-0 flex-1">
            {active && (
              <Editor
                path={active}
                value={files[active]}
                language={editorLanguage(active)}
                beforeMount={(monaco) => applyMonacoTheme(monaco, theme)}
                theme={MONACO_THEME}
                options={{
                  readOnly: true,
                  domReadOnly: true,
                  fontSize: 13,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                }}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
