// Download a workspace as a .zip, or create one from a .zip (all in the browser)

import { strToU8, unzipSync, zipSync } from 'fflate';
import { MAX_FILES, type Project } from './project';

const MAX_PROJECT_BYTES = 256 * 1024;
const SAFE_PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;
const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|node_modules|\.git)(\/|$)/;

export function projectToZip(project: Project): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const folder of project.folders) entries[`${folder}/`] = new Uint8Array();
  for (const [path, content] of Object.entries(project.files)) entries[path] = strToU8(content);
  return zipSync(entries, { level: 6 });
}

export function downloadZip(project: Project, title: string) {
  const name = (title.trim() || 'workspace').replace(/[^A-Za-z0-9_. -]+/g, '').trim() || 'workspace';
  const blob = new Blob([projectToZip(project) as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.zip`;
  link.click();
  URL.revokeObjectURL(url);
}

export interface ImportedZip {
  project: Project;
  skipped: string[]; // files left out, with the reason
}

// Text files only, safe paths, within the project limits
export function projectFromZip(bytes: Uint8Array): ImportedZip {
  const entries = Object.entries(unzipSync(bytes)).filter(([path]) => !JUNK.test(path));

  // GitHub-style zips put everything inside one folder ("repo-main/…"): drop it
  const roots = new Set(entries.map(([path]) => path.split('/')[0]));
  const strip = roots.size === 1 && entries.every(([path]) => path.includes('/')) ? `${[...roots][0]}/` : '';

  const files: Record<string, string> = {};
  const folders: string[] = [];
  const skipped: string[] = [];
  let size = 0;

  for (const [rawPath, data] of entries) {
    const path = rawPath.slice(strip.length).replace(/\/$/, '');
    if (!path) continue;
    if (rawPath.endsWith('/')) {
      if (SAFE_PATH.test(path)) folders.push(path);
      continue;
    }
    const text = decodeText(data);
    if (!SAFE_PATH.test(path) || path.split('/').includes('..')) skipped.push(`${path} (unsupported name)`);
    else if (text === null) skipped.push(`${path} (not a text file)`);
    else if (Object.keys(files).length >= MAX_FILES) skipped.push(`${path} (more than ${MAX_FILES} files)`);
    else if (size + data.length > MAX_PROJECT_BYTES) skipped.push(`${path} (project would exceed 256 KB)`);
    else {
      files[path] = text;
      size += data.length;
    }
  }
  // Keep only folders that would otherwise be lost (empty ones)
  const emptyFolders = folders.filter((folder) => !Object.keys(files).some((path) => path.startsWith(`${folder}/`)));
  return { project: { files, folders: emptyFolders }, skipped };
}

function decodeText(data: Uint8Array): string | null {
  if (data.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return null;
  }
}
