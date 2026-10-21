import { pack } from 'tar-stream';
import type { ProjectFile } from './frameworks.js';

// Same project rules as the rest of Bytebox (and the terminal service)
export const MAX_FILES = 50;
export const MAX_PROJECT_BYTES = 256 * 1024;
const SAFE_PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;

// Returns an error message, or null if the files are fine
export function checkFiles(files: ProjectFile[]): string | null {
  if (!Array.isArray(files) || files.length === 0) return 'The project has no files';
  if (files.length > MAX_FILES) return `A project can have at most ${MAX_FILES} files`;
  const size = files.reduce((total, file) => total + Buffer.byteLength(file.content ?? ''), 0);
  if (size > MAX_PROJECT_BYTES) return 'The project is larger than 256 KB';
  const bad = files.find(
    (file) =>
      typeof file.content !== 'string' ||
      file.path.length > 200 ||
      !SAFE_PATH.test(file.path) ||
      file.path.split('/').includes('..'),
  );
  return bad ? `Invalid file path: ${bad.path}` : null;
}

// The project as a tar archive, plus `extra` files (owned by nobody, like the container user)
export async function packFiles(files: ProjectFile[]): Promise<Buffer> {
  const archive = pack();
  for (const file of files) archive.entry({ name: file.path, mode: 0o644, uid: 65534, gid: 65534 }, file.content);
  archive.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of archive) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
