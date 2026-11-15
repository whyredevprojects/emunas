/**
 * Filter clauses over `moments m`. List values are bound as one JSON array each and read with
 * json_each(), so a query never comes near D1's bound-parameter limit. Column names are fixed
 * strings here; values are always bound.
 */
import type { SearchFilters } from "./params.ts";

export interface SqlFragment {
  sql: string;
  params: unknown[];
}

const IN_LIST = (column: string) => `${column} IN (SELECT value FROM json_each(?))`;

export function filterClause(f: SearchFilters): SqlFragment {
  const parts: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, ...values: unknown[]) => {
    parts.push(sql);
    params.push(...values);
  };
  if (f.audio.length > 0) add(IN_LIST("m.audio_lang"), JSON.stringify(f.audio));
  if (f.kind.length > 0) add(IN_LIST("m.kind"), JSON.stringify(f.kind));
  if (f.category.length > 0) add(IN_LIST("m.category"), JSON.stringify(f.category));
  if (f.occasion.length > 0) add(IN_LIST("m.occasion"), JSON.stringify(f.occasion));
  if (f.series.length > 0) add(IN_LIST("m.series"), JSON.stringify(f.series));
  if (f.yearFrom !== null) add("m.year >= ?", f.yearFrom);
  if (f.yearTo !== null) add("m.year <= ?", f.yearTo);
  for (const [type, values] of [
    ["work", f.work],
    ["person", f.person],
    ["concept", f.concept],
  ] as const) {
    if (values.length === 0) continue;
    add(
      `EXISTS (SELECT 1 FROM moment_entities e WHERE e.moment_id = m.id AND e.type = ? AND ${IN_LIST("e.entity_id")})`,
      type,
      JSON.stringify(values),
    );
  }
  return { sql: parts.length === 0 ? "1" : parts.join(" AND "), params };
}

/** Vectorize metadata filter for the declared indexes (audio_lang, kind, category, year). */
export function vectorFilter(f: SearchFilters): VectorizeVectorMetadataFilter {
  const filter: VectorizeVectorMetadataFilter = {};
  const inList = (values: readonly string[]) =>
    values.length === 1 ? { $eq: values[0] as string } : { $in: [...values] };
  if (f.audio.length > 0) filter["audio_lang"] = inList(f.audio);
  if (f.kind.length > 0) filter["kind"] = inList(f.kind);
  if (f.category.length > 0) filter["category"] = inList(f.category);
  if (f.yearFrom !== null || f.yearTo !== null) {
    const range: { $gte?: number; $lte?: number } = {};
    if (f.yearFrom !== null) range.$gte = f.yearFrom;
    if (f.yearTo !== null) range.$lte = f.yearTo;
    filter["year"] = range;
  }
  return filter;
}
