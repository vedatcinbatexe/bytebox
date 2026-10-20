'use client';

import { useEffect, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { FileTree } from './FileTree';
import { OutputPanel } from './OutputPanel';
import { createRun, watchRun, type Run } from '@/lib/runs';
import {
  MAX_FILES,
  buildTree,
  checkNewPath,
  createFile,
  createFolder,
  deletePath,
  editorLanguage,
  joinPath,
  parentFolder,
  renamePath,
  runLanguage,
  updateFile,
  type Project,
} from '@/lib/project';
import { STARTER_FILE, STARTER_PROJECT } from '@/lib/templates';
import { load, save } from '@/lib/storage';

const STORAGE_KEY = 'bytebox:workspace';

const ERROR_MESSAGES: Record<string, string> = {
  RATE_LIMITED: 'Too many runs. Please wait a minute and try again.',
  NETWORK_ERROR: 'Cannot reach the Bytebox API. Is the gateway running?',
};

interface Workspace {
  project: Project;
  openTabs: string[];
  activePath: string | null;
  stdin: string;
}

const STARTER_WORKSPACE: Workspace = {
  project: STARTER_PROJECT,
  openTabs: [STARTER_FILE],
  activePath: STARTER_FILE,
  stdin: 'Bytebox',
};

export function Playground() {
  const [workspace, setWorkspace] = useState<Workspace>(STARTER_WORKSPACE);
  const [loaded, setLoaded] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const closeSubscription = useRef<(() => void) | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const { project, openTabs, activePath, stdin } = workspace;

  // Restore the last workspace, then autosave every change
  useEffect(() => {
    const saved = load(STORAGE_KEY);
    if (saved) {
      try {
        setWorkspace(JSON.parse(saved) as Workspace);
      } catch {
        // ignore a broken save and keep the starter project
      }
    }
    setLoaded(true);
    return () => closeSubscription.current?.();
  }, []);

  useEffect(() => {
    if (loaded) save(STORAGE_KEY, JSON.stringify(workspace));
  }, [workspace, loaded]);

  function update(changes: Partial<Workspace>) {
    setWorkspace((current) => ({ ...current, ...changes }));
  }

  // ---------- Files & folders ----------

  function openFile(path: string) {
    setSelectedFolder(parentFolder(path));
    update({
      activePath: path,
      openTabs: openTabs.includes(path) ? openTabs : [...openTabs, path],
    });
  }

  function closeTab(path: string) {
    const remaining = openTabs.filter((tab) => tab !== path);
    update({
      openTabs: remaining,
      activePath: activePath === path ? (remaining[remaining.length - 1] ?? null) : activePath,
    });
  }

  function askForNewPath(message: string, folder: string, initialName = ''): string | null {
    const name = window.prompt(message, initialName)?.trim();
    if (!name) return null;
    const path = joinPath(folder, name);
    const problem = checkNewPath(project, path);
    if (problem) {
      window.alert(problem);
      return null;
    }
    return path;
  }

  function newFile() {
    if (Object.keys(project.files).length >= MAX_FILES) {
      window.alert(`A project can have at most ${MAX_FILES} files.`);
      return;
    }
    const where = selectedFolder ? ` in ${selectedFolder}/` : '';
    const path = askForNewPath(`New file name${where} (e.g. helper.py)`, selectedFolder);
    if (!path) return;
    setWorkspace((current) => ({
      ...current,
      project: createFile(current.project, path),
      openTabs: [...current.openTabs, path],
      activePath: path,
    }));
  }

  function newFolder() {
    const where = selectedFolder ? ` in ${selectedFolder}/` : '';
    const path = askForNewPath(`New folder name${where}`, selectedFolder);
    if (!path) return;
    update({ project: createFolder(project, path) });
    setSelectedFolder(path);
  }

  function rename(path: string) {
    const newPath = askForNewPath('Rename to', parentFolder(path), path.split('/').pop());
    if (!newPath) return;
    const move = (tab: string) =>
      tab === path || tab.startsWith(`${path}/`) ? newPath + tab.slice(path.length) : tab;
    update({
      project: renamePath(project, path, newPath),
      openTabs: openTabs.map(move),
      activePath: activePath ? move(activePath) : null,
    });
  }

  function remove(path: string) {
    if (!window.confirm(`Delete "${path}"? This cannot be undone.`)) return;
    const isGone = (tab: string) => tab === path || tab.startsWith(`${path}/`);
    const remaining = openTabs.filter((tab) => !isGone(tab));
    update({
      project: deletePath(project, path),
      openTabs: remaining,
      activePath: activePath && isGone(activePath) ? (remaining[0] ?? null) : activePath,
    });
    if (isGone(selectedFolder)) setSelectedFolder('');
  }

  // ---------- Running ----------

  async function runActiveFile() {
    if (running) return;
    if (!activePath || !runLanguage(activePath)) {
      setError('Open a .py, .js or .cpp file to run it.');
      return;
    }

    closeSubscription.current?.();
    setRunning(true);
    setError(null);
    setRun(null);

    // Read the open file from the editor itself: React state can lag a keystroke behind
    const latest = editorRef.current?.getValue() ?? project.files[activePath];
    const files = Object.entries({ ...project.files, [activePath]: latest }).map(
      ([path, content]) => ({ path, content }),
    );

    try {
      const created = await createRun(files, activePath, stdin);
      setRun(created);
      closeSubscription.current = watchRun(
        created.id,
        (updated) => {
          setRun(updated);
          if (updated.status !== 'QUEUED') {
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
      const { message, code } = runError as { message: string; code?: string };
      setError(ERROR_MESSAGES[code ?? ''] ?? message);
      setRunning(false);
    }
  }

  // Monaco handles keys itself, so register the shortcut on the editor.
  // The ref always points at the latest runActiveFile.
  const runRef = useRef(runActiveFile);
  runRef.current = runActiveFile;
  const onEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
  };

  const canRun = activePath !== null && runLanguage(activePath) !== null;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <h1 className="mr-auto text-lg font-bold">📦 Bytebox</h1>
        <button
          onClick={runActiveFile}
          disabled={running || !canRun}
          title={canRun ? 'Run the open file (⌘/Ctrl + Enter)' : 'Open a .py, .js or .cpp file'}
          className="max-w-[60vw] truncate rounded bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? 'Running…' : `▶ Run ${canRun ? activePath : ''}`}
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* File explorer */}
        <nav className="flex max-h-48 flex-col border-b border-zinc-800 md:max-h-none md:w-56 md:border-r md:border-b-0">
          <div className="flex items-center gap-1 border-b border-zinc-800 px-3 py-2">
            <h2 className="mr-auto text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              Files
            </h2>
            <button
              onClick={newFile}
              title="New file"
              className="rounded px-1.5 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              + File
            </button>
            <button
              onClick={newFolder}
              title="New folder"
              className="rounded px-1.5 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              + Folder
            </button>
          </div>
          <div
            className="min-h-0 flex-1 overflow-auto"
            onClick={(event) => {
              // Clicking empty space selects the project root
              if (event.target === event.currentTarget) setSelectedFolder('');
            }}
          >
            <FileTree
              nodes={buildTree(project)}
              activePath={activePath}
              selectedFolder={selectedFolder}
              onOpenFile={openFile}
              onSelectFolder={setSelectedFolder}
              onRename={rename}
              onDelete={remove}
            />
          </div>
        </nav>

        {/* Tabs + editor */}
        <div className="flex min-h-[50vh] min-w-0 flex-1 flex-col border-zinc-800 md:min-h-0 md:border-r">
          <div className="flex shrink-0 overflow-x-auto border-b border-zinc-800 text-sm">
            {openTabs.map((tab) => (
              <div
                key={tab}
                className={`flex shrink-0 items-center gap-2 border-r border-zinc-800 px-3 py-1.5 ${
                  tab === activePath ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <button onClick={() => openFile(tab)} title={tab}>
                  {tab.split('/').pop()}
                </button>
                <button
                  onClick={() => closeTab(tab)}
                  title="Close"
                  className="text-zinc-500 hover:text-white"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {activePath && activePath in project.files ? (
            <Editor
              path={activePath}
              language={editorLanguage(activePath)}
              value={project.files[activePath]}
              onChange={(value) =>
                setWorkspace((current) => ({
                  ...current,
                  project: updateFile(current.project, activePath, value ?? ''),
                }))
              }
              onMount={onEditorMount}
              theme="vs-dark"
              options={{ fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false }}
            />
          ) : (
            <p className="p-6 text-sm text-zinc-500">Open a file from the explorer, or create one.</p>
          )}
        </div>

        {/* Stdin + output */}
        <aside className="flex min-h-0 flex-col md:w-[35%]">
          <section className="border-b border-zinc-800">
            <h2 className="px-4 pt-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              Input (stdin)
            </h2>
            <textarea
              value={stdin}
              onChange={(event) => update({ stdin: event.target.value })}
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
