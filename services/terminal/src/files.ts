import { pack, extract } from 'tar-stream';
import type { ProjectFile } from './protocol.js';

// Same project rules as the rest of Bytebox
export const MAX_FILES = 50;
export const MAX_PROJECT_BYTES = 256 * 1024;
const MAX_PULLED_FILE_BYTES = 64 * 1024;
const SAFE_PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;

export function isSafePath(path: string): boolean {
  return path.length <= 200 && SAFE_PATH.test(path) && !path.split('/').includes('..');
}

// Returns an error message, or null if the files are fine
export function checkFiles(files: ProjectFile[]): string | null {
  if (!Array.isArray(files)) return 'Files must be a list';
  if (files.length > MAX_FILES) return `A project can have at most ${MAX_FILES} files`;
  const size = files.reduce((total, file) => total + Buffer.byteLength(file.content ?? ''), 0);
  if (size > MAX_PROJECT_BYTES) return 'The project is larger than 256 KB';
  const bad = files.find((file) => typeof file.content !== 'string' || !isSafePath(file.path));
  return bad ? `Invalid file path: ${bad.path}` : null;
}

export async function packFiles(files: ProjectFile[]): Promise<Buffer> {
  const archive = pack();
  for (const file of files) {
    archive.entry({ name: file.path, mode: 0o644, uid: 65534, gid: 65534 }, file.content);
  }
  archive.finalize();

  const chunks: Buffer[] = [];
  for await (const chunk of archive) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

// Reads text files from a tar archive. Binary, large or oddly named files are skipped.
export async function unpackFiles(archive: Buffer) {
  const files: ProjectFile[] = [];
  const folders: string[] = [];
  const skipped: string[] = [];
  let totalBytes = 0;

  const reader = extract();
  reader.end(archive);

  for await (const entry of reader) {
    const path = entry.header.name.replace(/^\.\//, '').replace(/\/$/, '');
    const chunks: Buffer[] = [];
    for await (const chunk of entry) chunks.push(chunk as Buffer);
    if (!path || path === '.') continue;

    if (entry.header.type === 'directory') {
      if (isSafePath(path)) folders.push(path);
      continue;
    }
    if (entry.header.type !== 'file') continue;

    const content = decodeText(Buffer.concat(chunks));
    const size = entry.header.size ?? 0;
    if (
      content === null ||
      !isSafePath(path) ||
      size > MAX_PULLED_FILE_BYTES ||
      totalBytes + size > MAX_PROJECT_BYTES ||
      files.length >= MAX_FILES
    ) {
      skipped.push(path);
      continue;
    }
    totalBytes += size;
    files.push({ path, content });
  }
  return { files, folders, skipped };
}

// UTF-8 text, or null for binary data (e.g. a compiled program)
function decodeText(data: Buffer): string | null {
  if (data.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return null;
  }
}
