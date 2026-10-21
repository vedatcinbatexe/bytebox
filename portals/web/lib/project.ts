// A project is a set of files keyed by path ("utils/greet.py") plus explicitly created folders.
// Folders that contain files are implied by the file paths.

export interface Project {
  files: Record<string, string>;
  folders: string[];
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children: TreeNode[];
}

// Same rules as the backend
export const MAX_FILES = 50;
const SAFE_PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;

const RUNNABLE: Record<string, string> = {
  '.py': 'python',
  '.js': 'javascript',
  '.ts': 'typescript',
  '.java': 'java',
  '.cpp': 'cpp',
  '.go': 'go',
  '.rs': 'rust',
};
const EDITOR_LANGUAGES: Record<string, string> = {
  ...RUNNABLE,
  '.cs': 'csharp', // server projects: ASP.NET Core, Spring Boot
  '.csproj': 'xml',
  '.xml': 'xml',
  '.properties': 'ini',
  '.h': 'cpp',
  '.hpp': 'cpp',
  '.json': 'json',
  '.md': 'markdown',
  '.html': 'html',
  '.css': 'css',
  '.ts': 'typescript',
};

function extension(path: string): string {
  const name = path.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
}

// Language id used to run the file, or null if it can't be run
export function runLanguage(path: string): string | null {
  return RUNNABLE[extension(path)] ?? null;
}

// Language id for syntax highlighting in the editor
export function editorLanguage(path: string): string {
  return EDITOR_LANGUAGES[extension(path)] ?? 'plaintext';
}


export function joinPath(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}

export function parentFolder(path: string): string {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}

function isInside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

function isFolder(project: Project, path: string): boolean {
  return allFolders(project).includes(path);
}

// Every folder: explicit ones plus the parents of every file
export function allFolders(project: Project): string[] {
  const folders = new Set(project.folders);
  for (const path of Object.keys(project.files)) {
    let folder = parentFolder(path);
    while (folder) {
      folders.add(folder);
      folder = parentFolder(folder);
    }
  }
  return [...folders].sort();
}

// Returns an error message, or null if the new path can be used
export function checkNewPath(project: Project, path: string): string | null {
  if (!path) return 'Please enter a name';
  if (path.length > 200 || !SAFE_PATH.test(path) || path.split('/').includes('..')) {
    return 'Use only letters, numbers, ".", "-", "_" and "/" for folders';
  }
  if (path in project.files || isFolder(project, path)) return `"${path}" already exists`;
  return null;
}

export function createFile(project: Project, path: string): Project {
  return { ...project, files: { ...project.files, [path]: '' } };
}

export function createFolder(project: Project, path: string): Project {
  return { ...project, folders: [...project.folders, path] };
}

export function updateFile(project: Project, path: string, content: string): Project {
  return { ...project, files: { ...project.files, [path]: content } };
}

// Renames a file, or a folder together with everything inside it
export function renamePath(project: Project, from: string, to: string): Project {
  const move = (path: string) => (isInside(path, from) ? to + path.slice(from.length) : path);
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(project.files)) {
    files[move(path)] = content;
  }
  return { files, folders: project.folders.map(move) };
}

// Deletes a file, or a folder together with everything inside it
export function deletePath(project: Project, target: string): Project {
  const files = Object.fromEntries(
    Object.entries(project.files).filter(([path]) => !isInside(path, target)),
  );
  return { files, folders: project.folders.filter((folder) => !isInside(folder, target)) };
}

export function buildTree(project: Project): TreeNode[] {
  const root: TreeNode = { name: '', path: '', type: 'folder', children: [] };
  const folderNodes = new Map<string, TreeNode>([['', root]]);

  for (const folder of allFolders(project)) {
    const node: TreeNode = { name: folder.split('/').pop()!, path: folder, type: 'folder', children: [] };
    folderNodes.set(folder, node);
    folderNodes.get(parentFolder(folder))?.children.push(node);
  }
  for (const path of Object.keys(project.files)) {
    const node: TreeNode = { name: path.split('/').pop()!, path, type: 'file', children: [] };
    folderNodes.get(parentFolder(path))?.children.push(node);
  }

  // Folders first, then files, both alphabetical
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
    nodes.forEach((node) => sort(node.children));
  };
  sort(root.children);
  return root.children;
}


// Where a file or folder ends up when dropped on a folder ('' = project root),
// or an error message if it can't go there
export function moveTarget(project: Project, from: string, toFolder: string): { to: string } | { error: string } {
  const name = from.split('/').pop()!;
  const to = joinPath(toFolder, name);
  if (to === from) return { error: '' }; // dropped where it already is: nothing to do
  if (toFolder === from || toFolder.startsWith(`${from}/`)) {
    return { error: 'A folder can’t be moved into itself' };
  }
  const problem = checkNewPath(project, to);
  return problem ? { error: problem } : { to };
}
