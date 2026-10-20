'use client';

import { useEffect, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { OutputPanel } from './OutputPanel';
import { createRun, fetchLanguages, watchRun, type Language, type Run } from '@/lib/runs';
import { DEFAULT_LANGUAGES, TEMPLATES } from '@/lib/templates';
import { load, save } from '@/lib/storage';

const ERROR_MESSAGES: Record<string, string> = {
  RATE_LIMITED: 'Too many runs. Please wait a minute and try again.',
  NETWORK_ERROR: 'Cannot reach the Bytebox API. Is the gateway running?',
};

export function Playground() {
  const [languages, setLanguages] = useState<Language[]>(DEFAULT_LANGUAGES);
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState(TEMPLATES.python);
  const [stdin, setStdin] = useState('Bytebox');
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const closeSubscription = useRef<(() => void) | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  // Load languages from the API and restore the last session
  useEffect(() => {
    fetchLanguages().then(setLanguages).catch(() => {});
    const savedLanguage = load('bytebox:language') ?? 'python';
    setLanguage(savedLanguage);
    setCode(load(`bytebox:code:${savedLanguage}`) ?? TEMPLATES[savedLanguage] ?? '');
    setStdin(load('bytebox:stdin') ?? 'Bytebox');
    return () => closeSubscription.current?.();
  }, []);

  function changeLanguage(next: string) {
    setLanguage(next);
    setCode(load(`bytebox:code:${next}`) ?? TEMPLATES[next] ?? '');
    save('bytebox:language', next);
  }

  function changeCode(next: string) {
    setCode(next);
    save(`bytebox:code:${language}`, next);
  }

  function changeStdin(next: string) {
    setStdin(next);
    save('bytebox:stdin', next);
  }

  async function runCode() {
    if (running) return;
    closeSubscription.current?.();
    setRunning(true);
    setError(null);
    setRun(null);

    try {
      // Read from the editor itself: React state can lag a keystroke behind the shortcut
      const latestCode = editorRef.current?.getValue() ?? code;
      const created = await createRun(language, latestCode, stdin);
      setRun(created);
      closeSubscription.current = watchRun(
        created.id,
        (update) => {
          setRun(update);
          if (update.status !== 'QUEUED') {
            closeSubscription.current?.();
            setRunning(false);
          }
        },
        (subscriptionError) => {
          setError(subscriptionError.message);
          setRunning(false);
        },
      );
    } catch (runError) {
      const { message, code: errorCode } = runError as { message: string; code?: string };
      setError(ERROR_MESSAGES[errorCode ?? ''] ?? message);
      setRunning(false);
    }
  }

  // Monaco handles keys itself, so register the shortcut on the editor.
  // The ref always points at the latest runCode.
  const runRef = useRef(runCode);
  runRef.current = runCode;
  const onEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <h1 className="mr-auto text-lg font-bold">📦 Bytebox</h1>
        <select
          value={language}
          onChange={(event) => changeLanguage(event.target.value)}
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
          aria-label="Language"
        >
          {languages.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          onClick={runCode}
          disabled={running}
          className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? 'Running…' : '▶ Run'}
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="min-h-[50vh] flex-1 border-zinc-800 md:min-h-0 md:border-r">
          <Editor
            language={language}
            value={code}
            onChange={(value) => changeCode(value ?? '')}
            onMount={onEditorMount}
            theme="vs-dark"
            options={{ fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false }}
          />
        </div>

        <aside className="flex min-h-0 flex-col md:w-[40%]">
          <section className="border-b border-zinc-800">
            <h2 className="px-4 pt-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              Input (stdin)
            </h2>
            <textarea
              value={stdin}
              onChange={(event) => changeStdin(event.target.value)}
              rows={4}
              spellCheck={false}
              className="w-full resize-none bg-transparent px-4 py-2 font-mono text-sm outline-none"
              placeholder="Input for your program"
            />
          </section>
          <OutputPanel run={run} error={error} />
        </aside>
      </main>
    </div>
  );
}
