'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Editor, { type OnMount } from '@monaco-editor/react';
import { DRAG_TYPE, FileTree } from './FileTree';
import { OutputPanel, isFinished } from './OutputPanel';
import { MarkdownPanel } from './MarkdownPanel';
import { PreviewPanel } from './PreviewPanel';
import { TestsPanel } from './TestsPanel';
import { TESTS_FILE, parseTests, serializeTests } from '@/lib/tests';
import { SearchPanel } from './SearchPanel';
import { ResizeHandle } from './ResizeHandle';
import { StatusBar } from './StatusBar';
import { ShortcutsDialog } from './ShortcutsDialog';
import { CommandPalette, type Command } from './CommandPalette';
import { HistoryPanel } from './HistoryPanel';
import { EmbedDialog } from './EmbedDialog';
import { THEMES, setTheme } from '@/lib/theme';
import { DEFAULT_SIZES, clampSize, loadSizes, saveSizes, type PanelSizes } from '@/lib/layout';
import { htmlFiles } from '@/lib/preview';
import { downloadZip } from '@/lib/zip';
import { canFormat, formatCode } from '@/lib/format';
import { TerminalPanel } from './TerminalPanel';
import { CommandsHelp } from './CommandsHelp';
import { LoginRequiredModal } from './LoginRequiredModal';
import { UserMenu } from './UserMenu';
import { useMe } from '@/lib/auth';
import { ThemePicker } from './ThemePicker';
import { MONACO_THEME, applyMonacoTheme, useTheme } from '@/lib/theme';
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
  moveTarget,
  parentFolder,
  renamePath,
  runLanguage,
  updateFile,
  type Project,
} from '@/lib/project';
import { STARTER_FILE, STARTER_PROJECT } from '@/lib/templates';
import { load, save } from '@/lib/storage';
import { applyChanges, type TerminalChanges } from '@/lib/terminalSync';
import {
  VISIBILITY,
  createProject,
  fetchProject,
  setStar,
  setVisibility,
  updateProject,
  type SavedProject,
  type Visibility,
} from '@/lib/projects';

const STORAGE_KEY = 'bytebox:workspace';
const AUTOSAVE_KEY = 'bytebox:autosave';

const SECONDARY_BUTTON =
  'rounded border border-line-strong px-2.5 py-1.5 text-sm whitespace-nowrap text-fg hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50';

const ERROR_MESSAGES: Record<string, string> = {
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

// Open the first runnable file, preferring main.* (Main.java for Java)
function workspaceFor(saved: SavedProject): Workspace {
  const paths = Object.keys(saved.project.files).sort();
  const first =
    paths.find((path) => /^(main\.(py|js|ts|cpp|go|rs)|Main\.java)$/.test(path)) ??
    paths.find((path) => path === 'index.html') ??
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
  const [autosave, setAutosave] = useState(true);
  const [autosaving, setAutosaving] = useState(false);
  useEffect(() => setAutosave(load(AUTOSAVE_KEY) !== 'off'), []);
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [visibility, setVisibilityState] = useState<Visibility>('UNLISTED');
  const [ownerLogin, setOwnerLogin] = useState<string | null>(null);
  const [stars, setStars] = useState({ starCount: 0, starredByMe: false });
  const [cursor, setCursor] = useState<{ line: number; column: number } | null>(null);
  const [asideTab, setAsideTab] = useState<'output' | 'tests' | 'preview'>('output');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sizes, setSizes] = useState<PanelSizes>(DEFAULT_SIZES);
  useEffect(() => setSizes(loadSizes()), []);

  function resize(panel: keyof PanelSizes, delta: number) {
    setSizes((current) => {
      const next = { ...current, [panel]: clampSize(panel, current[panel] + delta) };
      saveSizes(next);
      return next;
    });
  }

  function resetSize(panel: keyof PanelSizes) {
    setSizes((current) => {
      const next = { ...current, [panel]: DEFAULT_SIZES[panel] };
      saveSizes(next);
      return next;
    });
  }
  // A search result to select once its file is open in the editor
  const pendingReveal = useRef<{ path: string; line: number; column: number; length: number } | null>(null);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const closeSubscription = useRef<(() => void) | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const theme = useTheme();

  // Recolor the editor when the theme changes
  useEffect(() => {
    if (monacoRef.current) applyMonacoTheme(monacoRef.current, theme);
  }, [theme]);

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
          setVisibilityState(saved.visibility);
          setOwnerLogin(saved.ownerLogin);
          setStars({ starCount: saved.starCount, starredByMe: saved.starredByMe });
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

  // Autosave your own project 2 seconds after the last change
  useEffect(() => {
    if (!slug || !isOwner || !autosave || !hasUnsavedChanges || busy || autosaving) return;
    const timer = setTimeout(async () => {
      setAutosaving(true);
      try {
        const input = currentInput();
        await updateProject(slug, input, true);
        setSavedSnapshot(snapshot({ ...workspace, ...input }));
      } catch (saveError) {
        setAutosave(false); // don't keep failing; the user can save by hand
        showNotice(`Autosave is off: ${errorMessage(saveError)}`, true);
      } finally {
        setAutosaving(false);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [workspace, slug, isOwner, autosave, hasUnsavedChanges, busy, autosaving]);

  function toggleAutosave(on: boolean) {
    setAutosave(on);
    save(AUTOSAVE_KEY, on ? 'on' : 'off');
  }

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

  // ---------- Keyboard: save and shortcuts list ----------

  function saveShortcut() {
    if (!canChange()) return;
    if (slug && isOwner) void saveChanges();
    else if (slug) showNotice('This is someone else’s project. Fork it to save your own copy.');
    else showNotice('Your workspace is saved in this browser. Use Share to get a link.');
  }
  const saveShortcutRef = useRef(saveShortcut);
  saveShortcutRef.current = saveShortcut;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault(); // not the browser's "Save page"
        saveShortcutRef.current();
        return;
      }
      const target = event.target as HTMLElement;
      const typing = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      // "?" (some keyboards report it as Shift + "/")
      const questionMark = event.key === '?' || (event.key === '/' && event.shiftKey);
      if (questionMark && !typing) setShortcutsOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------- Command palette ----------

  function paletteCommands(): Command[] {
    const action = (id: string, label: string, run: () => void, hint?: string): Command => ({
      id,
      label,
      group: 'Action',
      run,
      hint,
    });
    const commands: Command[] = Object.keys(project.files)
      .sort()
      .map((path) => ({ id: `file:${path}`, label: path, group: 'File' as const, run: () => openFile(path) }));

    if (isHtmlOpen || isMarkdownOpen) {
      commands.push(action('preview', `Preview ${activePath}`, () => setAsideTab('preview')));
    }
    else if (canRun) commands.push(action('run', `Run ${activePath}`, () => void runActiveFile(), '⌘↵'));
    if (activePath && canFormat(activePath)) {
      commands.push(action('format', `Format ${activePath}`, () => void formatActiveFile(), '⇧⌥F'));
    }
    commands.push(
      action('search', 'Find in files', () => setSearchOpen(true), '⌘⇧F'),
      action('terminal', terminalOpen ? 'Hide terminal' : 'Open terminal', () =>
        terminalOpen ? setTerminalOpen(false) : canChange() && setTerminalOpen(true),
      ),
      action('new-file', 'New file', newFile),
      action('new-folder', 'New folder', newFolder),
      action('zip', 'Download as .zip', () => downloadZip(currentInput().project, title)),
    );
    if (pages.length > 0) {
      commands.push(
        action('show-preview', 'Show preview', () => setAsideTab('preview')),
        action('show-output', 'Show output', () => setAsideTab('output')),
      );
    }
    if (!slug) commands.push(action('share', 'Share (save and get a link)', () => void share()));
    if (slug && isOwner) {
      commands.push(
        action('save', 'Save', () => void saveChanges(), '⌘S'),
        action('history', 'Version history', () => setHistoryOpen(true)),
      );
    }
    if (slug) commands.push(action('fork', 'Fork (make your own copy)', () => void fork()));
    commands.push(
      action('shortcuts', 'Keyboard shortcuts', () => setShortcutsOpen(true), '?'),
      action('commands-help', 'Terminal commands help', () => setHelpOpen(true)),
      ...THEMES.map((theme) => ({
        id: `theme:${theme.id}`,
        label: `${theme.name} theme`,
        group: 'Theme' as const,
        run: () => setTheme(theme.id),
      })),
      { id: 'go:projects', label: 'My projects', group: 'Go to', run: () => router.push('/projects') },
      { id: 'go:runs', label: 'Run history', group: 'Go to', run: () => router.push('/runs') },
      { id: 'go:explore', label: 'Explore public projects', group: 'Go to', run: () => router.push('/explore') },
    );
    return commands;
  }

  // ---------- Formatting ----------

  async function formatActiveFile() {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || !activePath || !canFormat(activePath) || !canChange()) return;
    try {
      const formatted = await formatCode(activePath, model.getValue());
      if (formatted === model.getValue()) return showNotice('Already formatted');
      // One edit for the whole file, so a single undo brings the old version back
      editor.pushUndoStop();
      editor.executeEdits('format', [{ range: model.getFullModelRange(), text: formatted }]);
      editor.pushUndoStop();
      showNotice('Formatted');
    } catch (formatError) {
      showNotice((formatError as Error).message, true);
    }
  }
  const formatRef = useRef(formatActiveFile);
  formatRef.current = formatActiveFile;

  // ---------- Find in files ----------

  function revealPending() {
    const target = pendingReveal.current;
    const editor = editorRef.current;
    if (!target || !editor || target.path !== activePathRef.current) return;
    pendingReveal.current = null;
    // Wait a moment for the editor to switch to the file
    setTimeout(() => {
      editor.revealLineInCenter(target.line);
      editor.setSelection({
        startLineNumber: target.line,
        startColumn: target.column,
        endLineNumber: target.line,
        endColumn: target.column + target.length,
      });
      editor.focus();
    }, 60);
  }

  function openMatch(path: string, line: number, column: number, length: number) {
    pendingReveal.current = { path, line, column, length };
    if (path === activePath) revealPending();
    else openFile(path);
  }

  const activePathRef = useRef(activePath);
  activePathRef.current = activePath;
  useEffect(revealPending, [activePath]);

  // ⌘/Ctrl + Shift + F opens the search
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  // Rename or move a file/folder; open tabs follow it
  function movePath(path: string, newPath: string) {
    const move = (tab: string) =>
      tab === path || tab.startsWith(`${path}/`) ? newPath + tab.slice(path.length) : tab;
    update({
      project: renamePath(project, path, newPath),
      openTabs: openTabs.map(move),
      activePath: activePath ? move(activePath) : null,
    });
  }

  function rename(path: string) {
    if (!canChange()) return;
    const newPath = askForNewPath('Rename to', parentFolder(path), path.split('/').pop());
    if (newPath) movePath(path, newPath);
  }

  // Drag & drop in the file tree ('' = project root)
  function moveInto(from: string, toFolder: string) {
    if (!canChange()) return;
    const target = moveTarget(project, from, toFolder);
    if ('error' in target) {
      if (target.error) showNotice(target.error, true);
      return;
    }
    movePath(from, target.to);
    showNotice(`Moved to ${toFolder || 'the project root'}`);
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
      setError('Open a .py, .js, .ts, .java, .cpp, .go or .rs file to run it.');
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
          if (isFinished(updated.status)) {
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
    monacoRef.current = monaco;
    applyMonacoTheme(monaco, theme);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
    // The editor is read-only when signed out; typing asks the visitor to log in
    editor.onDidAttemptReadOnlyEdit(() => canChangeRef.current());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => setSearchOpen(true));
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => void formatRef.current());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveShortcutRef.current());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => setPaletteOpen(true));
    editor.onDidChangeCursorPosition((event) =>
      setCursor({ line: event.position.lineNumber, column: event.position.column }),
    );
  };

  const canRun = activePath !== null && runLanguage(activePath) !== null;
  // HTML files are shown in the live preview instead of being run on the server
  const pages = htmlFiles(project.files);
  const isHtmlOpen = activePath?.toLowerCase().endsWith('.html') ?? false;
  const previewPath = isHtmlOpen ? activePath! : pages[0];
  // Markdown files get a rendered preview too
  const isMarkdownOpen = activePath?.toLowerCase().endsWith('.md') ?? false;
  const hasPreview = isMarkdownOpen || previewPath !== undefined;
  const showPreview = asideTab === 'preview' && hasPreview;

  if (notFound) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold">Project not found</h1>
        <p className="text-muted">This link doesn&apos;t point to a Bytebox project.</p>
        <Link href="/" className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">
          Go to your workspace
        </Link>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex h-dvh items-center justify-center text-subtle">
        {notice?.isError ? notice.text : 'Loading project…'}
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <Link href="/" className="mr-1 text-lg font-bold whitespace-nowrap" title="Your local workspace">
          📦 Bytebox
        </Link>
        <Link href="/explore" className="hidden text-sm text-muted hover:text-fg sm:inline" title="Public projects">
          Explore
        </Link>
        <input
          value={title}
          onChange={(event) => update({ title: event.target.value })}
          readOnly={!user}
          onClick={() => canChange()}
          maxLength={100}
          aria-label="Project title"
          className="min-w-32 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm text-fg outline-none hover:border-line focus:border-line-strong"
        />
        {slug && !isOwner && ownerLogin && (
          <Link href={`/u/${encodeURIComponent(ownerLogin)}`} className="text-xs text-muted hover:text-accent hover:underline">
            by @{ownerLogin}
          </Link>
        )}
        {notice && (
          <span className={`text-xs ${notice.isError ? 'text-danger' : 'text-success'}`}>{notice.text}</span>
        )}

        {/* Project: share / save / copy link / fork / download */}
        <div className="flex flex-wrap items-center gap-2">
          {slug && (
            <button
              onClick={async () => {
                if (!canChange()) return;
                try {
                  setStars(await setStar(slug, !stars.starredByMe));
                } catch (starError) {
                  showNotice((starError as Error).message, true);
                }
              }}
              aria-pressed={stars.starredByMe}
              title={stars.starredByMe ? 'Remove your star' : 'Star this project'}
              className={`${SECONDARY_BUTTON} ${stars.starredByMe ? 'border-warning text-warning' : ''}`}
            >
              {stars.starredByMe ? '★ Starred' : '☆ Star'} <span className="text-muted">{stars.starCount}</span>
            </button>
          )}
          <button
            onClick={() => downloadZip(currentInput().project, title)}
            className={SECONDARY_BUTTON}
            title="Download all files as a .zip"
          >
            ⤓ .zip
          </button>
          {!slug && (
            <button onClick={share} disabled={busy} className={SECONDARY_BUTTON} title="Save and get a link">
              {busy ? 'Sharing…' : '↗ Share'}
            </button>
          )}
          {slug && isOwner && (
            <button onClick={saveChanges} disabled={busy || !hasUnsavedChanges} className={SECONDARY_BUTTON}>
              {busy || autosaving ? 'Saving…' : hasUnsavedChanges ? '● Save' : '✓ Saved'}
            </button>
          )}
          {slug && isOwner && (
            <label className="flex items-center gap-1 text-xs whitespace-nowrap text-muted" title="Save 2 seconds after you stop typing">
              <input type="checkbox" checked={autosave} onChange={(event) => toggleAutosave(event.target.checked)} />
              Autosave
            </label>
          )}
          {slug && isOwner && (
            <button onClick={() => setHistoryOpen(true)} className={SECONDARY_BUTTON} title="Earlier versions of this project">
              🕘 History
            </button>
          )}
          {slug && isOwner && (
            <select
              value={visibility}
              onChange={async (event) => {
                const next = event.target.value as Visibility;
                try {
                  await setVisibility(slug, next);
                  setVisibilityState(next);
                  showNotice(`${VISIBILITY[next].label}: ${VISIBILITY[next].help.toLowerCase()}`);
                } catch (visibilityError) {
                  showNotice((visibilityError as Error).message, true);
                }
              }}
              aria-label="Who can see this project"
              title={VISIBILITY[visibility].help}
              className="rounded border border-line-strong bg-panel px-2 py-1.5 text-sm text-fg hover:bg-raised"
            >
              {(Object.keys(VISIBILITY) as Visibility[]).map((option) => (
                <option key={option} value={option}>
                  {VISIBILITY[option].icon} {VISIBILITY[option].label}
                </option>
              ))}
            </select>
          )}
          {slug && (
            <>
              <button
                onClick={async () =>
                  showNotice((await copyLink(window.location.href)) ? 'Link copied' : 'Copy the URL from the address bar')
                }
                className={SECONDARY_BUTTON}
              >
                ⧉ Copy link
              </button>
              <button onClick={fork} disabled={busy} title="Make your own copy of this project" className={SECONDARY_BUTTON}>
                ⑂ Fork
              </button>
              {visibility !== 'PRIVATE' && (
                <button onClick={() => setEmbedOpen(true)} title="Put this project on another website" className={SECONDARY_BUTTON}>
                  &lt;/&gt; Embed
                </button>
              )}
            </>
          )}
        </div>
        <span className="hidden h-6 w-px bg-line md:block" aria-hidden="true" />

        {/* Tools */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => (terminalOpen ? setTerminalOpen(false) : canChange() && setTerminalOpen(true))}
            className={`${SECONDARY_BUTTON} ${terminalOpen ? 'bg-raised' : ''}`}
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
          {isHtmlOpen || isMarkdownOpen ? (
            <button
              onClick={() => setAsideTab('preview')}
              title={isHtmlOpen ? 'Show the live preview of this page' : 'Show this file rendered'}
              className="max-w-[50vw] truncate rounded bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
            >
              👁 Preview {activePath}
            </button>
          ) : (
            <button
              onClick={() => {
                setAsideTab('output');
                void runActiveFile();
              }}
              disabled={running || !canRun}
              title={canRun ? 'Run the open file (⌘/Ctrl + Enter)' : 'Open a .py, .js, .ts, .java, .cpp, .go, .rs or .html file'}
              className="max-w-[50vw] truncate rounded bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? 'Running…' : `▶ Run ${canRun ? activePath : ''}`}
            </button>
          )}
        </div>
        <span className="hidden h-6 w-px bg-line md:block" aria-hidden="true" />

        {/* Theme and profile */}
        <div className="flex flex-wrap items-center gap-2">
          <ThemePicker />
          <UserMenu user={user} loading={userLoading} />
        </div>
      </header>

      {!userLoading && !user && (
        <p className="border-b border-line bg-warning/10 px-4 py-1.5 text-xs text-warning">
          You&apos;re browsing as a guest.{' '}
          <button onClick={() => setLoginPromptOpen(true)} className="underline">
            Log in or sign up
          </button>{' '}
          to run code, edit files and use the terminal.
        </p>
      )}
      {user && slug && !isOwner && (
        <p className="border-b border-line bg-info/10 px-4 py-1.5 text-xs text-info">
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
        <nav
          className="flex max-h-48 shrink-0 flex-col border-b border-line bg-panel md:max-h-none md:w-(--explorer-w) md:border-b-0"
          style={{ '--explorer-w': `${sizes.explorer}px` } as React.CSSProperties}
        >
          <div className="flex items-center gap-1 border-b border-line px-3 py-2">
            <h2 className="mr-auto text-xs font-semibold tracking-wide text-muted uppercase">
              {searchOpen ? 'Search' : 'Files'}
            </h2>
            <button
              onClick={() => setSearchOpen((open) => !open)}
              aria-pressed={searchOpen}
              title="Find in files (⌘/Ctrl + Shift + F)"
              className={`rounded px-1.5 py-0.5 text-xs hover:bg-raised ${searchOpen ? 'bg-raised text-accent' : 'text-fg'}`}
            >
              🔍
            </button>
            <button
              onClick={newFile}
              title="New file"
              className="rounded px-1.5 py-0.5 text-xs text-fg hover:bg-raised"
            >
              + File
            </button>
            <button
              onClick={newFolder}
              title="New folder"
              className="rounded px-1.5 py-0.5 text-xs text-fg hover:bg-raised"
            >
              + Folder
            </button>
          </div>
          {searchOpen ? (
            <SearchPanel files={project.files} onOpenMatch={openMatch} />
          ) : (
            <div
              className="min-h-0 flex-1 overflow-auto"
              onClick={(event) => {
                // Clicking empty space selects the project root
                if (event.target === event.currentTarget) setSelectedFolder('');
              }}
              // Dropping on empty space moves to the project root
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes(DRAG_TYPE)) event.preventDefault();
              }}
              onDrop={(event) => {
                const from = event.dataTransfer.getData(DRAG_TYPE);
                if (from) {
                  event.preventDefault();
                  moveInto(from, '');
                }
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
                onMove={moveInto}
              />
            </div>
          )}
        </nav>

        <ResizeHandle
          direction="x"
          label="Resize the file explorer"
          onResize={(delta) => resize('explorer', delta)}
          onReset={() => resetSize('explorer')}
        />

        {/* Tabs + editor */}
        <div className="flex min-w-0 shrink-0 flex-col md:min-h-0 md:flex-1 md:shrink">
          <div className="flex shrink-0 border-b border-line bg-panel text-sm">
            <div className="flex min-w-0 flex-1 overflow-x-auto">
              {openTabs.map((tab) => (
                <div
                  key={tab}
                  className={`flex shrink-0 items-center gap-2 border-t-2 border-r border-r-line px-3 py-1.5 ${
                    tab === activePath ? 'border-t-accent bg-app text-fg' : 'border-t-transparent text-muted hover:text-fg'
                  }`}
                >
                  <button onClick={() => openFile(tab)} title={tab}>
                    {tab.split('/').pop()}
                  </button>
                  <button
                    onClick={() => closeTab(tab)}
                    title="Close"
                    className="text-subtle hover:text-fg"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={formatActiveFile}
              disabled={!activePath || !canFormat(activePath)}
              title={
                activePath && canFormat(activePath)
                  ? 'Format this file with Prettier (Shift + Alt + F)'
                  : 'Formatting works for JavaScript, TypeScript, JSON, CSS, HTML and Markdown'
              }
              className="shrink-0 border-l border-line px-3 text-xs text-muted hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
            >
              ✨ Format
            </button>
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
                beforeMount={(monaco) => applyMonacoTheme(monaco, theme)}
                theme={MONACO_THEME}
                options={{
                  fontSize: 14,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  readOnly: !user,
                  readOnlyMessage: { value: 'Log in to edit' },
                }}
              />
            ) : (
              <p className="p-6 text-sm text-subtle">Open a file from the explorer, or create one.</p>
            )}
          </div>
          {terminalOpen && (
            <>
              <ResizeHandle
                direction="y"
                label="Resize the terminal"
                onResize={(delta) => resize('terminal', -delta)}
                onReset={() => resetSize('terminal')}
              />
              <TerminalPanel
                project={project}
                onTerminalChanges={applyTerminalChanges}
                onClose={() => setTerminalOpen(false)}
                height={sizes.terminal}
              />
            </>
          )}
        </div>

        <ResizeHandle
          direction="x"
          label="Resize the output panel"
          onResize={(delta) => resize('aside', -delta)}
          onReset={() => resetSize('aside')}
        />

        {/* Stdin + output */}
        <aside
          className="flex min-h-80 shrink-0 flex-col bg-panel md:min-h-0 md:w-(--aside-w) md:max-w-[60vw]"
          style={{ '--aside-w': `${sizes.aside}px` } as React.CSSProperties}
        >
          <div role="tablist" className="flex shrink-0 border-b border-line text-sm">
            {(hasPreview ? (['output', 'tests', 'preview'] as const) : (['output', 'tests'] as const)).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={asideTab === tab}
                onClick={() => setAsideTab(tab)}
                className={`border-b-2 px-4 py-2 ${
                  asideTab === tab ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'
                }`}
              >
                {tab === 'output' ? 'Output' : tab === 'tests' ? '🧪 Tests' : '👁 Preview'}
              </button>
            ))}
          </div>
          {asideTab === 'tests' ? (
            <TestsPanel
              tests={parseTests(project.files)}
              onChange={(tests) =>
                setWorkspace((current) => ({
                  ...current,
                  project: updateFile(current.project, TESTS_FILE, serializeTests(tests)),
                }))
              }
              entryFile={canRun ? activePath : null}
              getFiles={() => Object.entries(currentInput().project.files).map(([path, content]) => ({ path, content }))}
              canChange={canChange}
              readOnly={!user}
            />
          ) : showPreview && isMarkdownOpen ? (
            <MarkdownPanel path={activePath!} markdown={project.files[activePath!] ?? ''} />
          ) : showPreview ? (
            <PreviewPanel files={project.files} htmlPath={previewPath!} />
          ) : (
            <>
              <section className="border-b border-line">
                <h2 className="px-4 pt-2 text-xs font-semibold tracking-wide text-muted uppercase">
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
            </>
          )}
        </aside>
      </main>

      <StatusBar
        language={activePath ? editorLanguage(activePath) : null}
        lines={activePath && activePath in project.files ? project.files[activePath].split('\n').length : 0}
        cursor={activePath ? cursor : null}
        run={run}
        saveState={
          !user ? 'guest' : !slug ? 'local' : !isOwner ? 'other' : hasUnsavedChanges ? 'unsaved' : 'saved'
        }
        onShowShortcuts={() => setShortcutsOpen(true)}
      />
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {embedOpen && slug && <EmbedDialog slug={slug} onClose={() => setEmbedOpen(false)} />}
      {historyOpen && slug && (
        <HistoryPanel
          slug={slug}
          onClose={() => setHistoryOpen(false)}
          onRestored={(saved) => {
            const restored = workspaceFor(saved);
            setWorkspace(restored);
            setSavedSnapshot(snapshot(restored));
            showNotice('Version restored');
          }}
        />
      )}
      {paletteOpen && <CommandPalette commands={paletteCommands()} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
