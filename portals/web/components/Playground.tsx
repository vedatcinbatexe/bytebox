'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Editor, { type OnMount } from '@monaco-editor/react';
import { FileTree } from './FileTree';
import { OutputPanel } from './OutputPanel';
import { TerminalPanel } from './TerminalPanel';
import { CommandsHelp } from './CommandsHelp';
import { LoginRequiredModal } from './LoginRequiredModal';
import { UserMenu } from './UserMenu';
import { useMe } from '@/lib/auth';
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
import { applyChanges, type TerminalChanges } from '@/lib/terminalSync';
import { createProject, fetchProject, updateProject, type SavedProject } from '@/lib/projects';

const STORAGE_KEY = 'bytebox:workspace';

const SECONDARY_BUTTON =
  'rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50';

const ERROR_MESSAGES: Record<string, string> = {
  RATE_LIMITED: 'Too many runs. Please wait a minute and try again.',
  FORBIDDEN: 'Only the owner can save this project. Fork it to make your own copy.',
  NETWORK_ERROR: 'Cannot reach the Bytebox API. Is the gateway running?',
};

interface Workspace {
  title: string;
  project: Project;
  openTabs: string[];
  activePath: string | null;
  stdin: string;
}

const STARTER_WORKSPACE: Workspace = {
  title: 'Untitled project',
  project: STARTER_PROJECT,
  openTabs: [STARTER_FILE],
  activePath: STARTER_FILE,
  stdin: 'Bytebox',
};

// Open the first runnable file, preferring main.*
function workspaceFor(saved: SavedProject): Workspace {
  const paths = Object.keys(saved.project.files).sort();
  const first =
    paths.find((path) => /^main\.(py|js|cpp)$/.test(path)) ??
    paths.find((path) => runLanguage(path)) ??
    paths[0] ??
    null;
  return {
    title: saved.title,
    project: saved.project,
    openTabs: first ? [first] : [],
    activePath: first,
    stdin: saved.stdin,
  };
}

// What gets saved; used to detect unsaved changes
function snapshot({ title, project, stdin }: Workspace): string {
  return JSON.stringify({ title, project, stdin });
}

function errorMessage(error: unknown): string {
  const { message, code } = error as { message: string; code?: string };
  return ERROR_MESSAGES[code ?? ''] ?? message;
}

function isUnauthenticated(error: unknown): boolean {
  return (error as { code?: string }).code === 'UNAUTHENTICATED';
}

interface Props {
  // Shared project to open; without it the local workspace (localStorage) is used
  slug?: string;
}

export function Playground({ slug }: Props) {
  const router = useRouter();
  const { user, loading: userLoading } = useMe();
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>(STARTER_WORKSPACE);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const closeSubscription = useRef<(() => void) | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const { title, project, openTabs, activePath, stdin } = workspace;
  const hasUnsavedChanges = Boolean(slug) && loaded && snapshot(workspace) !== savedSnapshot;

  // Shared project: load it from the API. Local workspace: restore it from localStorage.
  useEffect(() => {
    if (slug) {
      fetchProject(slug)
        .then((saved) => {
          if (!saved) {
            setNotFound(true);
            return;
          }
          const opened = workspaceFor(saved);
          setWorkspace(opened);
          setSavedSnapshot(snapshot(opened));
          setIsOwner(saved.ownedByMe);
          setLoaded(true);
        })
        .catch((loadError) => showNotice(errorMessage(loadError), true));
    } else {
      const saved = load(STORAGE_KEY);
      if (saved) {
        try {
          setWorkspace({ ...STARTER_WORKSPACE, ...(JSON.parse(saved) as Workspace) });
        } catch {
          // ignore a broken save and keep the starter project
        }
      }
      setLoaded(true);
    }
    return () => closeSubscription.current?.();
  }, [slug]);

  // Autosave the local workspace (only signed-in users can change it)
  useEffect(() => {
    if (loaded && !slug && user) save(STORAGE_KEY, JSON.stringify(workspace));
  }, [workspace, loaded, slug, user]);

  // Warn before leaving a shared project with unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  // Running code and changing anything needs a signed-in user; otherwise ask them to log in
  function canChange(): boolean {
    if (user) return true;
    if (!userLoading) setLoginPromptOpen(true);
    return false;
  }

  function showNotice(text: string, isError = false) {
    setNotice({ text, isError });
    if (!isError) setTimeout(() => setNotice(null), 3000);
  }

  // ---------- Saving & sharing ----------

  // The latest content, including keystrokes React state may not have yet
  function currentInput() {
    const files = { ...project.files };
    if (activePath && editorRef.current) files[activePath] = editorRef.current.getValue();
    return { title, project: { ...project, files }, stdin };
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }

  // Local workspace -> new shared project
  async function share() {
    if (!canChange()) return;
    setBusy(true);
    try {
      const created = await createProject(currentInput());
      const url = `${window.location.origin}/p/${created.slug}`;
      await copyLink(url);
      router.push(`/p/${created.slug}`);
    } catch (shareError) {
      if (isUnauthenticated(shareError)) setLoginPromptOpen(true);
      else showNotice(errorMessage(shareError), true);
      setBusy(false);
    }
  }

  async function saveChanges() {
    if (!slug || !canChange()) return;
    setBusy(true);
    try {
      const input = currentInput();
      await updateProject(slug, input);
      setSavedSnapshot(snapshot({ ...workspace, ...input }));
      showNotice('Saved');
    } catch (saveError) {
      if (isUnauthenticated(saveError)) setLoginPromptOpen(true);
      else showNotice(errorMessage(saveError), true);
    } finally {
      setBusy(false);
    }
  }

  async function fork() {
    if (!slug || !canChange()) return;
    setBusy(true);
    try {
      const created = await createProject({ ...currentInput(), title: `${title} (fork)` }, slug);
      router.push(`/p/${created.slug}`);
    } catch (forkError) {
      if (isUnauthenticated(forkError)) setLoginPromptOpen(true);
      else showNotice(errorMessage(forkError), true);
      setBusy(false);
    }
  }

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
    if (!canChange()) return;
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
    if (!canChange()) return;
    const where = selectedFolder ? ` in ${selectedFolder}/` : '';
    const path = askForNewPath(`New folder name${where}`, selectedFolder);
    if (!path) return;
    update({ project: createFolder(project, path) });
    setSelectedFolder(path);
  }

  function rename(path: string) {
    if (!canChange()) return;
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
    if (!canChange()) return;
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

  // ---------- Terminal ----------

  // Files created, edited, moved or deleted in the terminal
  function applyTerminalChanges(changes: TerminalChanges) {
    setWorkspace((current) => {
      const isGone = (tab: string) => changes.deleted.includes(tab);
      const openTabs = current.openTabs.filter((tab) => !isGone(tab));
      const activePath =
        current.activePath && isGone(current.activePath) ? (openTabs[0] ?? null) : current.activePath;
      return { ...current, project: applyChanges(current.project, changes), openTabs, activePath };
    });
  }

  // ---------- Running ----------

  async function runActiveFile() {
    if (running || !canChange()) return;
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
      if (isUnauthenticated(runError)) setLoginPromptOpen(true);
      else setError(errorMessage(runError));
      setRunning(false);
    }
  }

  // Monaco handles keys itself, so register the shortcut on the editor.
  // The ref always points at the latest runActiveFile.
  const runRef = useRef(runActiveFile);
  runRef.current = runActiveFile;
  const canChangeRef = useRef(canChange);
  canChangeRef.current = canChange;
  const onEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
    // The editor is read-only when signed out; typing asks the visitor to log in
    editor.onDidAttemptReadOnlyEdit(() => canChangeRef.current());
  };

  const canRun = activePath !== null && runLanguage(activePath) !== null;

  if (notFound) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold">Project not found</h1>
        <p className="text-zinc-400">This link doesn&apos;t point to a Bytebox project.</p>
        <Link href="/" className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
          Go to your workspace
        </Link>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex h-dvh items-center justify-center text-zinc-500">
        {notice?.isError ? notice.text : 'Loading project…'}
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <Link href="/" className="text-lg font-bold" title="Your local workspace">
          📦 Bytebox
        </Link>
        <input
          value={title}
          onChange={(event) => update({ title: event.target.value })}
          readOnly={!user}
          onClick={() => canChange()}
          maxLength={100}
          aria-label="Project title"
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm text-zinc-200 outline-none hover:border-zinc-800 focus:border-zinc-700"
        />
        {notice && (
          <span className={`text-xs ${notice.isError ? 'text-red-300' : 'text-emerald-300'}`}>
            {notice.text}
          </span>
        )}
        {!slug && (
          <button onClick={share} disabled={busy} className={SECONDARY_BUTTON}>
            {busy ? 'Sharing…' : 'Share'}
          </button>
        )}
        {slug && isOwner && (
          <button
            onClick={saveChanges}
            disabled={busy || !hasUnsavedChanges}
            className={SECONDARY_BUTTON}
          >
            {busy ? 'Saving…' : hasUnsavedChanges ? 'Save' : 'Saved'}
          </button>
        )}
        {slug && (
          <>
            <button
              onClick={async () =>
                showNotice((await copyLink(window.location.href)) ? 'Link copied' : 'Copy the URL from the address bar')
              }
              className={SECONDARY_BUTTON}
            >
              Copy link
            </button>
            <button
              onClick={fork}
              disabled={busy}
              title="Make your own copy of this project"
              className={SECONDARY_BUTTON}
            >
              Fork
            </button>
          </>
        )}
        <button
          onClick={() => (terminalOpen ? setTerminalOpen(false) : canChange() && setTerminalOpen(true))}
          className={SECONDARY_BUTTON}
          title="Open a shell with your project files"
        >
          {terminalOpen ? 'Hide terminal' : '>_ Terminal'}
        </button>
        <button
          onClick={() => setHelpOpen(true)}
          className={SECONDARY_BUTTON}
          title="Which commands can I use in the terminal?"
        >
          ? Commands
        </button>
        <button
          onClick={runActiveFile}
          disabled={running || !canRun}
          title={canRun ? 'Run the open file (⌘/Ctrl + Enter)' : 'Open a .py, .js or .cpp file'}
          className="max-w-[60vw] truncate rounded bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? 'Running…' : `▶ Run ${canRun ? activePath : ''}`}
        </button>
        <UserMenu user={user} loading={userLoading} />
      </header>

      {!userLoading && !user && (
        <p className="border-b border-zinc-800 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-200">
          You&apos;re browsing as a guest.{' '}
          <button onClick={() => setLoginPromptOpen(true)} className="underline">
            Log in or sign up
          </button>{' '}
          to run code, edit files and use the terminal.
        </p>
      )}
      {user && slug && !isOwner && (
        <p className="border-b border-zinc-800 bg-sky-500/10 px-4 py-1.5 text-xs text-sky-200">
          You&apos;re viewing someone else&apos;s project. You can edit and run it, but to save changes,{' '}
          <button onClick={fork} className="underline">
            fork it
          </button>{' '}
          into your own copy.
        </p>
      )}

      {helpOpen && <CommandsHelp onClose={() => setHelpOpen(false)} />}
      {loginPromptOpen && <LoginRequiredModal onClose={() => setLoginPromptOpen(false)} />}

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        {/* File explorer */}
        <nav className="flex max-h-48 shrink-0 flex-col border-b border-zinc-800 md:max-h-none md:w-56 md:border-r md:border-b-0">
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
        <div className="flex min-w-0 shrink-0 flex-col border-zinc-800 md:min-h-0 md:flex-1 md:shrink md:border-r">
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
          <div className="h-[50vh] md:h-auto md:min-h-0 md:flex-1">
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
                options={{
                  fontSize: 14,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  readOnly: !user,
                  readOnlyMessage: { value: 'Log in to edit' },
                }}
              />
            ) : (
              <p className="p-6 text-sm text-zinc-500">Open a file from the explorer, or create one.</p>
            )}
          </div>
          {terminalOpen && (
            <TerminalPanel
              project={project}
              onTerminalChanges={applyTerminalChanges}
              onClose={() => setTerminalOpen(false)}
            />
          )}
        </div>

        {/* Stdin + output */}
        <aside className="flex min-h-80 shrink-0 flex-col md:min-h-0 md:w-[35%] md:shrink">
          <section className="border-b border-zinc-800">
            <h2 className="px-4 pt-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              Input (stdin)
            </h2>
            <textarea
              value={stdin}
              onChange={(event) => update({ stdin: event.target.value })}
              readOnly={!user}
              onClick={() => canChange()}
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
