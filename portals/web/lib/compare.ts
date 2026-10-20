// How the files of two versions of a project differ

export type FileChange = 'added' | 'deleted' | 'changed' | 'same';

// Every path in either version, sorted, with what happened to it from `before` to `after`
export function compareFiles(
  before: Record<string, string>,
  after: Record<string, string>,
): { path: string; change: FileChange }[] {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return paths.map((path) => {
    if (!(path in before)) return { path, change: 'added' };
    if (!(path in after)) return { path, change: 'deleted' };
    return { path, change: before[path] === after[path] ? 'same' : 'changed' };
  });
}
