// Plain-text search across all files of a project

export interface SearchMatch {
  line: number; // 1-based
  column: number; // 1-based
  text: string; // the whole line, trimmed to a sensible length
}

export interface FileMatches {
  path: string;
  matches: SearchMatch[];
}

export const MAX_MATCHES = 200;

export function searchProject(
  files: Record<string, string>,
  query: string,
  caseSensitive = false,
): { results: FileMatches[]; total: number; limited: boolean } {
  const results: FileMatches[] = [];
  let total = 0;
  if (!query) return { results, total, limited: false };
  const needle = caseSensitive ? query : query.toLowerCase();

  for (const path of Object.keys(files).sort()) {
    const matches: SearchMatch[] = [];
    files[path].split('\n').forEach((line, index) => {
      const haystack = caseSensitive ? line : line.toLowerCase();
      let from = 0;
      let found = haystack.indexOf(needle, from);
      while (found !== -1 && total < MAX_MATCHES) {
        matches.push({ line: index + 1, column: found + 1, text: line.slice(0, 300) });
        total += 1;
        from = found + needle.length;
        found = haystack.indexOf(needle, from);
      }
    });
    if (matches.length > 0) results.push({ path, matches });
    if (total >= MAX_MATCHES) return { results, total, limited: true };
  }
  return { results, total, limited: false };
}
