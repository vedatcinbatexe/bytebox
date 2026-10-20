// Fuzzy matching for the command palette: the letters of the query must appear in order.
// Higher scores are better; null means no match.

export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;

  // A plain substring is the best kind of match, earlier is better
  const index = t.indexOf(q);
  if (index !== -1) return 1000 - index;

  let score = 0;
  let position = 0;
  let previous = -2;
  for (const char of q) {
    const found = t.indexOf(char, position);
    if (found === -1) return null;
    score += found === previous + 1 ? 10 : 1; // reward letters that follow each other
    if (found === 0 || ' /._-'.includes(t[found - 1])) score += 5; // and word starts
    previous = found;
    position = found + 1;
  }
  return score;
}

// Items that match, best first (stable for equal scores)
export function fuzzyFilter<T>(items: T[], query: string, text: (item: T) => string): T[] {
  return items
    .map((item, order) => ({ item, order, score: fuzzyScore(query, text(item)) }))
    .filter((entry) => entry.score !== null)
    .sort((a, b) => b.score! - a.score! || a.order - b.order)
    .map((entry) => entry.item);
}
