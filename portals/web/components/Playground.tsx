'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Editor, { type OnMount } from '@monaco-editor/react';
import { DRAG_TYPE, FileTree } from './FileTree';
import { OutputPanel, isFinished } from './OutputPanel';
import { MarkdownPanel } from './MarkdownPanel';
import { PreviewPanel } from './PreviewPanel';
import { ProjectTags } from './ProjectTags';
import { ForksDialog } from './ForksDialog';
import { CollaboratorsPanel } from './CollaboratorsPanel';
import { ServerPanel } from './ServerPanel';
import { CommentsDialog } from './CommentsDialog';
import { EditorSettingsDialog } from './EditorSettingsDialog';
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
import { errorMarkers, type ErrorMarker } from '@/lib/errorLocations';
import { splitArgs } from '@/lib/args';
import { useCollab } from '@/lib/useCollab';
import { useDevServer } from '@/lib/useDevServer';
import { serverFramework } from '@/lib/devserver';
import type { SharedState } from '@/lib/collab';
import {
  DEFAULT_EDITOR_SETTINGS,
  loadEditorSettings,
  saveEditorSettings,
  type EditorSettings,
} from '@/lib/editorSettings';
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
import { configureLanguages } from '@/lib/monacoSetup';
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
  setTags,
  createInvite,
  joinProject,
  removeCollaborator,
  stopInvites,
  type Collaborator,
  setVisibility,
  updateProject,
  type SavedProject,
  type Visibility,
} from '@/lib/projects';

// v2: everyone starts with the welcome project. Workspaces saved before it stay under the old key
// and can be brought back from the command palette.
const STORAGE_KEY = 'bytebox:workspace:v2';
const OLD_STORAGE_KEY = 'bytebox:workspace';
const AUTOSAVE_KEY = 'bytebox:autosave';
const HIDDEN_PANELS_KEY = 'bytebox:hidden-panels';

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
  args: string; // command-line arguments as typed
}

const STARTER_WORKSPACE: Workspace = {
  title: 'Welcome to Bytebox',
  project: STARTER_PROJECT,
  openTabs: [STARTER_FILE, 'README.md'],
  activePath: STARTER_FILE,
  stdin: 'Ada',
  args: '',
};

// Open the first runnable file, preferring main.* (Main.java for Java, App.jsx for React)
function workspaceFor(saved: SavedProject): Workspace {
  const paths = Object.keys(saved.project.files).sort();
  const first =
    paths.find((path) => /^(server\.js|Program\.cs)$|Application\.java$/.test(path)) ?? // server projects
    paths.find((path) => /^(main\.(py|js|ts|cpp|go|rs)|Main\.java)$/.test(path)) ??
    paths.find((path) => /(^|\/)App\.(jsx|tsx)$/.test(path)) ?? // React projects
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
    args: saved.args,
  };
}

type AsideTab = 'output' | 'tests' | 'preview' | 'people' | 'server';

// The part of a workspace that is shared in a live session
function toShared({ project, title, stdin, args }: Workspace): SharedState {
  return { files: project.files, folders: project.folders, title, stdin, args };
}

// The workspace after the shared project changed; tabs of files that are gone are closed
function withShared(workspace: Workspace, shared: SharedState): Workspace {
  const openTabs = workspace.openTabs.filter((path) => path in shared.files);
  const activePath =
    workspace.activePath && workspace.activePath in shared.files ? workspace.activePath : (openTabs[0] ?? null);
  return {
    ...workspace,
    project: { files: shared.files, folders: shared.folders },
    title: shared.title,
    stdin: shared.stdin,
    args: shared.args,
    openTabs,
    activePath,
  };
}

// What gets saved; used to detect unsaved changes
function snapshot({ title, project, stdin, args }: Workspace): string {
  return JSON.stringify({ title, project, stdin, args });
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
  // Token from an invite link (?invite=…): joins the project as a collaborator
  invite?: string;
}

export function Playground({ slug, invite }: Props) {
  const router = useRouter();
  const { user, loading: userLoading } = useMe();
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [workspace, setWorkspaceState] = useState<Workspace>(STARTER_WORKSPACE);
  // The latest workspace, also between renders (remote edits arrive outside React)
  const workspaceRef = useRef<Workspace>(STARTER_WORKSPACE);
  const sendLocalChange = useRef<(previous: SharedState, next: SharedState) => void>(() => {});

  // Every change to the workspace goes through here, so a live session can send exactly what changed
  function setWorkspace(change: Workspace | ((current: Workspace) => Workspace)) {
    const previous = workspaceRef.current;
    const next = typeof change === 'function' ? change(previous) : change;
    workspaceRef.current = next;
    setWorkspaceState(next);
    sendLocalChange.current(toShared(previous), toShared(next));
  }
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  // The owner and invited collaborators can edit (together, live) and save
  const [canEdit, setCanEdit] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [editorReady, setEditorReady] = useState(false);
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
  const [tags, setTagsState] = useState<string[]>([]);
  const [forkInfo, setForkInfo] = useState<{ count: number; from: string | null; fromTitle: string | null }>({
    count: 0,
    from: null,
    fromTitle: null,
  });
  const [forksOpen, setForksOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [cursor, setCursor] = useState<{ line: number; column: number } | null>(null);
  const [asideTab, setAsideTab] = useState<AsideTab>('output');
  // Focus mode: hide the file explorer (⌘/Ctrl + B) and/or the output panel (⌘/Ctrl + J)
  const [hidden, setHidden] = useState({ explorer: false, aside: false });
  useEffect(() => {
    try {
      setHidden({ explorer: false, aside: false, ...JSON.parse(load(HIDDEN_PANELS_KEY) ?? '{}') });
    } catch {
      // keep both panels visible
    }
  }, []);

  function setPanelHidden(panel: 'explorer' | 'aside', hide: (current: boolean) => boolean) {
    setHidden((current) => {
      const next = { ...current, [panel]: hide(current[panel]) };
      save(HIDDEN_PANELS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function togglePanel(panel: 'explorer' | 'aside') {
    setPanelHidden(panel, (isHidden) => !isHidden);
  }

  function showAside(tab: AsideTab) {
    setAsideTab(tab);
    setPanelHidden('aside', () => false);
  }
  const togglePanelRef = useRef(togglePanel);
  togglePanelRef.current = togglePanel;
  const [searchOpen, setSearchOpen] = useState(false);
  const [sizes, setSizes] = useState<PanelSizes>(DEFAULT_SIZES);
  useEffect(() => setSizes(loadSizes()), []);
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(DEFAULT_EDITOR_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => setEditorSettings(loadEditorSettings()), []);

  function changeEditorSettings(next: EditorSettings) {
    setEditorSettings(next);
    saveEditorSettings(next);
  }

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
  // Red squiggles from the last failed run
  const [markers, setMarkers] = useState<ErrorMarker[]>([]);
  const closeSubscription = useRef<(() => void) | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const theme = useTheme();

  // Recolor the editor when the theme changes
  useEffect(() => {
    if (monacoRef.current) applyMonacoTheme(monacoRef.current, theme);
  }, [theme]);

  const { title, project, openTabs, activePath, stdin, args } = workspace;

  // Show the markers of the open file in the editor
  useEffect(() => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model) return;
    monaco.editor.setModelMarkers(
      model,
      'run',
      markers
        .filter((marker) => marker.path === activePath)
        .map((marker) => ({
          severity: monaco.MarkerSeverity.Error,
          message: marker.message,
          startLineNumber: marker.line,
          startColumn: marker.column,
          endLineNumber: marker.line,
          endColumn: model.getLineMaxColumn(Math.min(marker.line, model.getLineCount())),
        })),
    );
  }, [markers, activePath]);
  // ---------- Live collaboration ----------
  const collab = useCollab({
    slug,
    enabled: loaded && canEdit && Boolean(user),
    user,
    onRemote: (shared) => {
      const next = withShared(workspaceRef.current, shared);
      workspaceRef.current = next;
      setWorkspaceState(next);
    },
  });
  sendLocalChange.current = collab.localChange;

  // ---------- Server projects (Express, Spring Boot, ASP.NET Core) ----------
  const devServer = useDevServer();
  const serverName = serverFramework(project.files);

  function startServer() {
    if (!canChange()) return;
    showAside('server');
    const files = Object.entries(currentInput().project.files).map(([path, content]) => ({ path, content }));
    void devServer.start(files);
  }
  // In a live session the collab service saves for everyone
  const live = collab.status === 'live';
  useEffect(() => {
    if (live) setSavedSnapshot(snapshot(workspace));
  }, [live, workspace]);

  // Edit the open file together, with everyone's cursors
  useEffect(() => {
    if (!live || !editorReady || !activePath || !editorRef.current || !monacoRef.current) return;
    const unbind = collab.bind(monacoRef.current, editorRef.current, activePath);
    return () => unbind?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, editorReady, activePath, activePath ? activePath in project.files : false]);

  // Opened with an invite link: join (after logging in), then drop the token from the address
  useEffect(() => {
    if (!invite || !slug || !loaded || userLoading) return;
    if (canEdit) {
      router.replace(`/p/${slug}`);
      return;
    }
    if (!user) {
      setLoginPromptOpen(true);
      return;
    }
    joinProject(slug, invite)
      .then((joined) => {
        setCanEdit(joined.canEdit);
        setCollaborators(joined.collaborators);
        showNotice('You joined as a collaborator 🎉 Edits are shared live.');
        setAsideTab('people');
        router.replace(`/p/${slug}`);
      })
      .catch((joinError) => showNotice(errorMessage(joinError), true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite, slug, loaded, userLoading, user, canEdit]);

  async function newInvite() {
    if (!slug) return;
    try {
      setInviteToken(await createInvite(slug));
    } catch (inviteError) {
      showNotice(errorMessage(inviteError), true);
    }
  }

  async function turnOffInvites() {
    if (!slug) return;
    try {
      await stopInvites(slug);
      setInviteToken(null);
    } catch (inviteError) {
      showNotice(errorMessage(inviteError), true);
    }
  }

  async function removeMember(collaborator: Collaborator) {
    if (!slug) return;
    try {
      await removeCollaborator(slug, collaborator.userId);
      setCollaborators((current) => current.filter((other) => other.userId !== collaborator.userId));
      if (collaborator.userId === user?.id) {
        setCanEdit(false); // left the project
        showNotice('You left the project');
      }
    } catch (removeError) {
      showNotice(errorMessage(removeError), true);
    }
  }

  const hasUnsavedChanges = Boolean(slug) && loaded && !live && snapshot(workspace) !== savedSnapshot;

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
          setCanEdit(saved.canEdit);
          setCollaborators(saved.collaborators);
          setInviteToken(saved.inviteToken);
          setVisibilityState(saved.visibility);
          setOwnerLogin(saved.ownerLogin);
          setStars({ starCount: saved.starCount, starredByMe: saved.starredByMe });
          setTagsState(saved.tags);
          setForkInfo({ count: saved.forkCount, from: saved.forkedFrom, fromTitle: saved.forkedFromTitle });
          setCommentCount(saved.commentCount);
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
    if (!slug || !canEdit || !autosave || !hasUnsavedChanges || busy || autosaving) return;
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
  }, [workspace, slug, canEdit, autosave, hasUnsavedChanges, busy, autosaving]);

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
    return { title, project: { ...project, files }, stdin, args };
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

  async function changeTags(next: string[]) {
    if (!slug || !canChange()) return;
    const previous = tags;
    setTagsState(next);
    try {
      setTagsState(await setTags(slug, next));
    } catch (tagsError) {
      setTagsState(previous);
      showNotice(errorMessage(tagsError), true);
    }
  }

  // Local workspace only: throw away the files in this browser and start from the welcome project
  function resetWorkspace() {
    if (!window.confirm('Start over with the welcome project? The files in this workspace will be replaced.')) return;
    closeSubscription.current?.();
    setWorkspace(STARTER_WORKSPACE);
    setRun(null);
    setError(null);
    setMarkers([]);
    setRunning(false);
    setSelectedFolder('');
  }

  function restoreOldWorkspace() {
    if (!window.confirm('Open your earlier workspace? It replaces the files in this workspace.')) return;
    try {
      setWorkspace({ ...STARTER_WORKSPACE, ...(JSON.parse(load(OLD_STORAGE_KEY) ?? '{}') as Workspace) });
    } catch {
      showNotice('The earlier workspace could not be read', true);
    }
  }

  // Replace in files (from the search panel)
  function replaceFiles(changed: Record<string, string>, count: number) {
    if (!canChange()) return;
    setWorkspace((current) => ({
      ...current,
      project: { ...current.project, files: { ...current.project.files, ...changed } },
    }));
    const fileCount = Object.keys(changed).length;
    showNotice(`Replaced ${count} match${count === 1 ? '' : 'es'} in ${fileCount} file${fileCount === 1 ? '' : 's'}`);
  }

  // ---------- Keyboard: save and shortcuts list ----------

  function saveShortcut() {
    if (!canChange()) return;
    if (slug && live) showNotice('Live session: changes are saved automatically for everyone.');
    else if (slug && canEdit) void saveChanges();
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
      if ((event.metaKey || event.ctrlKey) && ['b', 'j'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        togglePanelRef.current(event.key.toLowerCase() === 'b' ? 'explorer' : 'aside');
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
      commands.push(action('preview', `Preview ${activePath}`, () => showAside('preview')));
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
        action('show-preview', 'Show preview', () => showAside('preview')),
        action('show-output', 'Show output', () => showAside('output')),
      );
    }
    commands.push(
      action('toggle-explorer', `${hidden.explorer ? 'Show' : 'Hide'} file explorer`, () => togglePanel('explorer'), '⌘B'),
      action('toggle-aside', `${hidden.aside ? 'Show' : 'Hide'} output panel`, () => togglePanel('aside'), '⌘J'),
    );
    if (!slug) commands.push(action('share', 'Share (save and get a link)', () => void share()));
    if (!slug) commands.push(action('reset', 'Reset the workspace to the welcome project', resetWorkspace));
    if (!slug && load(OLD_STORAGE_KEY)) {
      commands.push(action('restore-old', 'Open the workspace saved before the welcome project', restoreOldWorkspace));
    }
    if (slug && canEdit && !live) commands.push(action('save', 'Save', () => void saveChanges(), '⌘S'));
    if (slug && isOwner) commands.push(action('history', 'Version history', () => setHistoryOpen(true)));
    if (slug && canEdit) commands.push(action('collaborators', 'Collaborators', () => showAside('people')));
    if (serverName) {
      commands.push(action('server-start', `Start ${serverName} server (restart with the latest code)`, startServer));
      if (devServer.status === 'starting' || devServer.status === 'running') {
        commands.push(action('server-stop', 'Stop the server', () => devServer.stop()));
      }
    }
    if (slug) commands.push(action('fork', 'Fork (make your own copy)', () => void fork()));
    commands.push(
      action('shortcuts', 'Keyboard shortcuts', () => setShortcutsOpen(true), '?'),
      action('editor-settings', 'Editor settings (font size, word wrap…)', () => setSettingsOpen(true)),
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
    setPanelHidden('aside', () => false); // show the output
    if (!activePath || !runLanguage(activePath)) {
      setError('Open a .py, .js, .ts, .java, .cpp, .go or .rs file to run it.');
      return;
    }

    closeSubscription.current?.();
    setRunning(true);
    setError(null);
    setRun(null);
    setMarkers([]);

    // Read the open file from the editor itself: React state can lag a keystroke behind
    const latest = editorRef.current?.getValue() ?? project.files[activePath];
    const files = Object.entries({ ...project.files, [activePath]: latest }).map(
      ([path, content]) => ({ path, content }),
    );

    try {
      const created = await createRun(files, activePath, stdin, splitArgs(args));
      setRun(created);
      closeSubscription.current = watchRun(
        created.id,
        (updated) => {
          setRun(updated);
          if (isFinished(updated.status)) {
            closeSubscription.current?.();
            setRunning(false);
            if (updated.exitCode !== 0) setMarkers(errorMarkers(updated.stderr, Object.keys(project.files)));
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
    setEditorReady(true);
    applyMonacoTheme(monaco, theme);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
    // The editor is read-only when signed out; typing asks the visitor to log in
    editor.onDidAttemptReadOnlyEdit(() => canChangeRef.current());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => setSearchOpen(true));
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => void formatRef.current());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveShortcutRef.current());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => setPaletteOpen(true));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => togglePanelRef.current('explorer'));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ, () => togglePanelRef.current('aside'));
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
        <Link href="/playground" className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">
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
        <Link href="/" className="mr-1 text-lg font-bold whitespace-nowrap" title="Bytebox home">
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
        {slug && forkInfo.from && forkInfo.fromTitle && (
          <Link href={`/p/${forkInfo.from}`} className="max-w-48 truncate text-xs text-muted hover:text-accent hover:underline">
            ⑂ forked from {forkInfo.fromTitle}
          </Link>
        )}
        {slug && <ProjectTags tags={tags} onChange={isOwner ? changeTags : undefined} />}
        {live && collab.people.length > 1 && (
          <button
            onClick={() => showAside('people')}
            className="flex items-center -space-x-1.5"
            title={`Editing now: ${collab.people.map((person) => person.presence.user.login).join(', ')}`}
          >
            {collab.people.slice(0, 4).map((person) => (
              <span
                key={person.clientId}
                className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-panel text-[11px] font-bold text-white"
                style={{ backgroundColor: person.presence.user.color }}
              >
                {person.presence.user.login.slice(0, 1).toUpperCase()}
              </span>
            ))}
            {collab.people.length > 4 && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-panel bg-raised text-[10px] text-muted">
                +{collab.people.length - 4}
              </span>
            )}
          </button>
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
          {!slug && (
            <button onClick={resetWorkspace} className={SECONDARY_BUTTON} title="Start over with the welcome project">
              ↺ Reset
            </button>
          )}
          {slug && canEdit && live && (
            <span
              className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-success"
              title="Everyone's edits are shared live and saved automatically"
            >
              ● Live
            </span>
          )}
          {slug && canEdit && !live && (
            <button onClick={saveChanges} disabled={busy || !hasUnsavedChanges} className={SECONDARY_BUTTON}>
              {busy || autosaving ? 'Saving…' : hasUnsavedChanges ? '● Save' : '✓ Saved'}
            </button>
          )}
          {slug && canEdit && !live && (
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
              <span className="flex">
                <button
                  onClick={fork}
                  disabled={busy}
                  title="Make your own copy of this project"
                  className={`${SECONDARY_BUTTON} ${forkInfo.count > 0 ? 'rounded-r-none' : ''}`}
                >
                  ⑂ Fork
                </button>
                {forkInfo.count > 0 && (
                  <button
                    onClick={() => setForksOpen(true)}
                    title="See the forks of this project"
                    className={`${SECONDARY_BUTTON} -ml-px rounded-l-none tabular-nums`}
                  >
                    {forkInfo.count}
                  </button>
                )}
              </span>
              <button onClick={() => setCommentsOpen(true)} title="Comments on this project" className={SECONDARY_BUTTON}>
                💬 {commentCount}
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
          {serverName && !isHtmlOpen && !isMarkdownOpen ? (
            <button
              onClick={startServer}
              title={`Start this ${serverName} project and open it in the 🖥 Server tab`}
              className="rounded bg-accent px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap text-accent-fg hover:bg-accent-hover"
            >
              {devServer.status === 'starting' || devServer.status === 'running' ? '↻ Restart server' : '▶ Start server'}
            </button>
          ) : isHtmlOpen || isMarkdownOpen || (!canRun && previewPath !== undefined) ? (
            <button
              onClick={() => showAside('preview')}
              title={isMarkdownOpen ? 'Show this file rendered' : 'Show the live preview of this page'}
              className="max-w-[50vw] truncate rounded bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
            >
              {/* e.g. App.jsx in a React project: preview the page that uses it */}
              👁 Preview {isHtmlOpen || isMarkdownOpen ? activePath : previewPath}
            </button>
          ) : (
            <button
              onClick={() => {
                showAside('output');
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
      {user && slug && loaded && !canEdit && (
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
        {!hidden.explorer && (
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
            <SearchPanel
              files={project.files}
              onOpenMatch={openMatch}
              onReplace={user ? replaceFiles : undefined}
            />
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

        )}
        {!hidden.explorer && (
          <ResizeHandle
            direction="x"
            label="Resize the file explorer"
            onResize={(delta) => resize('explorer', delta)}
            onReset={() => resetSize('explorer')}
          />
        )}

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
                beforeMount={(monaco) => {
                  applyMonacoTheme(monaco, theme);
                  configureLanguages(monaco);
                }}
                theme={MONACO_THEME}
                options={{
                  fontSize: editorSettings.fontSize,
                  tabSize: editorSettings.tabSize,
                  wordWrap: editorSettings.wordWrap ? 'on' : 'off',
                  minimap: { enabled: editorSettings.minimap },
                  lineNumbers: editorSettings.lineNumbers ? 'on' : 'off',
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

        {!hidden.aside && (
          <ResizeHandle
            direction="x"
            label="Resize the output panel"
            onResize={(delta) => resize('aside', -delta)}
            onReset={() => resetSize('aside')}
          />
        )}

        {/* Stdin + output */}
        {!hidden.aside && (
        <aside
          className="flex min-h-80 shrink-0 flex-col bg-panel md:min-h-0 md:w-(--aside-w) md:max-w-[60vw]"
          style={{ '--aside-w': `${sizes.aside}px` } as React.CSSProperties}
        >
          <div role="tablist" className="flex shrink-0 overflow-x-auto border-b border-line text-sm">
            {(
              [
                'output',
                'tests',
                ...(hasPreview ? (['preview'] as const) : []),
                ...(serverName ? (['server'] as const) : []),
                ...(slug && canEdit ? (['people'] as const) : []),
              ] as AsideTab[]
            ).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={asideTab === tab}
                onClick={() => setAsideTab(tab)}
                className={`shrink-0 border-b-2 px-3 py-2 whitespace-nowrap ${
                  asideTab === tab ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'
                }`}
              >
                {tab === 'output'
                  ? 'Output'
                  : tab === 'tests'
                    ? '🧪 Tests'
                    : tab === 'preview'
                      ? '👁 Preview'
                      : tab === 'server'
                        ? `🖥 Server${devServer.status === 'running' ? ' ●' : ''}`
                        : `👥 Collaborators${collab.people.length > 1 ? ` · ${collab.people.length}` : ''}`}
              </button>
            ))}
          </div>
          {asideTab === 'server' && serverName ? (
            <ServerPanel
              framework={serverName}
              status={devServer.status}
              runningFramework={devServer.framework}
              previewUrl={devServer.previewUrl}
              log={devServer.log}
              onStart={startServer}
              onStop={devServer.stop}
            />
          ) : asideTab === 'people' && slug && canEdit ? (
            <CollaboratorsPanel
              slug={slug}
              status={collab.status}
              people={collab.people}
              ownerLogin={ownerLogin}
              collaborators={collaborators}
              isOwner={isOwner}
              myUserId={user?.id ?? null}
              inviteToken={inviteToken}
              onCreateInvite={newInvite}
              onStopInvites={turnOffInvites}
              onRemove={removeMember}
              onOpenFile={(path) => openFile(path)}
            />
          ) : asideTab === 'tests' ? (
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
                <label className="flex items-center gap-2 px-4 pt-2">
                  <span className="text-xs font-semibold tracking-wide whitespace-nowrap text-muted uppercase">Arguments</span>
                  <input
                    value={args}
                    onChange={(event) => update({ args: event.target.value })}
                    readOnly={!user}
                    onClick={() => canChange()}
                    spellCheck={false}
                    maxLength={1000}
                    placeholder={'e.g. --name "Ada Lovelace" 3'}
                    title="Command-line arguments (sys.argv, process.argv, args[] …). Quotes keep spaces together."
                    className="min-w-0 flex-1 rounded border border-line bg-transparent px-2 py-0.5 font-mono text-sm outline-none focus:border-line-strong"
                  />
                </label>
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
              <OutputPanel
                run={run}
                error={error}
                filePaths={Object.keys(project.files)}
                stdin={stdin}
                onOpenLocation={(location) => openMatch(location.path, location.line, location.column, 0)}
              />
            </>
          )}
        </aside>
        )}
      </main>

      <StatusBar
        language={activePath ? editorLanguage(activePath) : null}
        lines={activePath && activePath in project.files ? project.files[activePath].split('\n').length : 0}
        cursor={activePath ? cursor : null}
        run={run}
        saveState={
          !user ? 'guest' : !slug ? 'local' : !canEdit ? 'other' : live ? 'live' : hasUnsavedChanges ? 'unsaved' : 'saved'
        }
        onShowShortcuts={() => setShortcutsOpen(true)}
        onShowSettings={() => setSettingsOpen(true)}
        hidden={hidden}
        onTogglePanel={togglePanel}
      />
      {settingsOpen && (
        <EditorSettingsDialog
          settings={editorSettings}
          onChange={changeEditorSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {embedOpen && slug && <EmbedDialog slug={slug} onClose={() => setEmbedOpen(false)} />}
      {commentsOpen && slug && (
        <CommentsDialog
          slug={slug}
          signedIn={Boolean(user)}
          onLoginNeeded={() => {
            setCommentsOpen(false); // the login dialog would be hidden behind this one
            setLoginPromptOpen(true);
          }}
          onCountChange={setCommentCount}
          onClose={() => setCommentsOpen(false)}
        />
      )}
      {forksOpen && slug && (
        <ForksDialog slug={slug} forkCount={forkInfo.count} onClose={() => setForksOpen(false)} />
      )}
      {historyOpen && slug && (
        <HistoryPanel
          slug={slug}
          currentFiles={currentInput().project.files}
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
