// Keeps the file tree and the terminal's /workspace in sync, in both directions.
// SyncState is what we believe the terminal has right now.

import { allFolders, type Project } from './project';

export interface SyncState {
  files: Record<string, string>;
  folders: Set<string>; // explicit (possibly empty) folders
}

export interface ProjectFile {
  path: string;
  content: string;
}

export interface Scan {
  files: ProjectFile[];
  folders: string[];
  skipped: string[];
}

export interface TerminalChanges {
  updated: Record<string, string>;
  deleted: string[];
  addedFolders: string[];
  removedFolders: string[];
}

export function startState(project: Project): SyncState {
  return { files: { ...project.files }, folders: new Set(project.folders) };
}

// Editor -> terminal: what to delete and what to write. Updates the state.
export function outgoing(project: Project, state: SyncState) {
  const deletedFiles = Object.keys(state.files).filter((path) => !(path in project.files));
  const deletedFolders = [...state.folders].filter((folder) => !project.folders.includes(folder));
  const files = Object.entries(project.files)
    .filter(([path, content]) => state.files[path] !== content)
    .map(([path, content]) => ({ path, content }));
  const folders = project.folders.filter((folder) => !state.folders.has(folder));

  deletedFiles.forEach((path) => delete state.files[path]);
  deletedFolders.forEach((folder) => state.folders.delete(folder));
  files.forEach((file) => (state.files[file.path] = file.content));
  folders.forEach((folder) => state.folders.add(folder));

  return { deletes: [...deletedFiles, ...deletedFolders], files, folders };
}

// Terminal -> editor: changes to apply to the project. Updates the state.
// A file edited in the editor but not pushed yet keeps the editor's version.
export function incoming(project: Project, state: SyncState, scan: Scan): TerminalChanges | null {
  const notPushedYet = (path: string) => project.files[path] !== state.files[path];
  const inTerminal = new Map(scan.files.map((file) => [file.path, file.content]));
  const skipped = new Set(scan.skipped);
  const changes: TerminalChanges = { updated: {}, deleted: [], addedFolders: [], removedFolders: [] };

  for (const [path, content] of inTerminal) {
    if (notPushedYet(path)) continue;
    if (project.files[path] !== content) changes.updated[path] = content;
    state.files[path] = content;
  }
  for (const path of Object.keys(state.files)) {
    if (inTerminal.has(path) || skipped.has(path) || notPushedYet(path)) continue;
    changes.deleted.push(path);
    delete state.files[path];
  }

  // Folders: new ones from the terminal (not already implied by a file), and explicit ones that are gone
  const remainingFiles = { ...project.files, ...changes.updated };
  changes.deleted.forEach((path) => delete remainingFiles[path]);
  const known = new Set(allFolders({ files: remainingFiles, folders: project.folders }));
  for (const folder of scan.folders) {
    if (!known.has(folder)) {
      changes.addedFolders.push(folder);
      state.folders.add(folder);
    }
  }
  for (const folder of [...state.folders]) {
    if (!scan.folders.includes(folder)) {
      changes.removedFolders.push(folder);
      state.folders.delete(folder);
    }
  }

  const hasChanges =
    Object.keys(changes.updated).length > 0 ||
    changes.deleted.length > 0 ||
    changes.addedFolders.length > 0 ||
    changes.removedFolders.length > 0;
  return hasChanges ? changes : null;
}

export function applyChanges(project: Project, changes: TerminalChanges): Project {
  const files = { ...project.files, ...changes.updated };
  changes.deleted.forEach((path) => delete files[path]);
  const folders = [
    ...project.folders.filter((folder) => !changes.removedFolders.includes(folder)),
    ...changes.addedFolders,
  ];
  return { files, folders };
}
