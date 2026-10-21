import * as Y from 'yjs';
import type { ProjectContent } from './projects.js';

// How a project lives in a shared Y.Doc (the web portal uses the same layout, see lib/collab.ts):
//   files   Y.Map<path, Y.Text>   the file contents, edited together character by character
//   folders Y.Map<path, true>     empty folders
//   meta    Y.Map                 title, stdin and args

export function seedDoc(doc: Y.Doc, project: ProjectContent): void {
  doc.transact(() => {
    const files = doc.getMap<Y.Text>('files');
    for (const file of project.files) files.set(file.path, new Y.Text(file.content));
    const folders = doc.getMap<boolean>('folders');
    for (const folder of project.folders) folders.set(folder, true);
    const meta = doc.getMap<string>('meta');
    meta.set('title', project.title);
    meta.set('stdin', project.stdin ?? '');
    meta.set('args', project.args ?? '');
  });
}

export function readDoc(doc: Y.Doc): ProjectContent {
  const meta = doc.getMap<string>('meta');
  return {
    title: meta.get('title') || 'Untitled project',
    files: [...doc.getMap<Y.Text>('files').entries()]
      .map(([path, text]) => ({ path, content: text.toString() }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    folders: [...doc.getMap<boolean>('folders').keys()].sort(),
    stdin: meta.get('stdin') ?? '',
    args: meta.get('args') ?? '',
  };
}
