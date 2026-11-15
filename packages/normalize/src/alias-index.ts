/**
 * Alias index builder shared by the lookup modules. Building never throws: an alias that points
 * at two different rows keeps the first and is recorded in `aliasConflicts()`, which a test
 * asserts is empty.
 */
export interface AliasConflict {
  table: string;
  alias: string;
  folded: string;
  keys: [string, string];
}

const conflicts: AliasConflict[] = [];

export function aliasConflicts(): readonly AliasConflict[] {
  return conflicts;
}

export function buildAliasIndex<T extends { key: string }>(
  table: string,
  rows: readonly T[],
  aliases: (row: T) => readonly string[],
  form: (s: string) => string,
): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) {
    for (const a of aliases(r)) {
      const f = form(a);
      if (f.length === 0) continue;
      const prev = m.get(f);
      if (prev !== undefined && prev.key !== r.key) {
        conflicts.push({ table, alias: a, folded: f, keys: [prev.key, r.key] });
        continue;
      }
      m.set(f, r);
    }
  }
  return m;
}
