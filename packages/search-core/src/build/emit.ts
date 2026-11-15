/**
 * `.corpus/search/docs.ndjson` (one SearchDoc per in-scope shiur) and
 * `.corpus/search/moments.ndjson` (MomentRows), from `.corpus/` plus candidateTopics.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CorpusIndex, PublicShiur } from "@emunas/corpus/public";
import { createDataReader, loadShiurFiles } from "@emunas/corpus/build";
import { SEARCH_SCHEMA_VERSION, type MomentRow, type SearchDoc } from "../types.ts";
import { buildMomentRows, buildSearchDoc } from "./docs.ts";

/**
 * `candidateTopics` of every full shiur, read through @emunas/corpus's allow-listed data reader.
 * Only the string array leaves this function.
 */
export function loadCandidateTopics(dataDir: string, shiurim: readonly PublicShiur[]): Map<string, string[]> {
  const reader = createDataReader(dataDir);
  const out = new Map<string, string[]>();
  for (const s of shiurim) {
    if (s.status !== "full") continue;
    const topics = loadShiurFiles(reader, s.id).extraction?.candidateTopics;
    if (topics) out.set(s.id, topics.filter((t): t is string => typeof t === "string"));
  }
  return out;
}

/** Read the projected shiurim from `.corpus/` (order of index.json). */
export function readCorpusShiurim(corpusDir: string): PublicShiur[] {
  const indexPath = join(corpusDir, "index.json");
  if (!existsSync(indexPath)) throw new Error(`${indexPath} not found: run corpus:build first`);
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as CorpusIndex;
  return index.shiurim.map((r) => JSON.parse(readFileSync(join(corpusDir, "shiurim", `${r.id}.json`), "utf8")) as PublicShiur);
}

export interface SearchOutputs {
  docs: SearchDoc[];
  moments: MomentRow[];
}

/** Docs and rows for a set of shiurim, sorted by id. */
export function buildSearchOutputs(
  shiurim: readonly PublicShiur[],
  candidateTopics: ReadonlyMap<string, readonly string[]> = new Map(),
): SearchOutputs {
  const sorted = [...shiurim].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const docs = sorted.map((shiur) => buildSearchDoc({ shiur, candidateTopics: candidateTopics.get(shiur.id) ?? [] }));
  const moments = sorted.flatMap((s) => buildMomentRows(s));
  return { docs, moments };
}

export function toNdjson(rows: readonly object[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length > 0 ? "\n" : "");
}

function writeIfChanged(path: string, text: string): boolean {
  if (existsSync(path) && readFileSync(path, "utf8") === text) return false;
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
  return true;
}

export interface WriteSearchOptions {
  corpusDir: string;
  /** Data dir to read candidateTopics from; null leaves keywords empty. */
  dataDir: string | null;
}

export interface WriteSearchResult {
  docs: number;
  moments: number;
  keywordsFrom: number;
  /** Files whose content changed. */
  written: string[];
}

export function writeSearchOutputs(opts: WriteSearchOptions): WriteSearchResult {
  const shiurim = readCorpusShiurim(opts.corpusDir);
  const topics = opts.dataDir === null ? new Map<string, string[]>() : loadCandidateTopics(opts.dataDir, shiurim);
  const out = buildSearchOutputs(shiurim, topics);
  const dir = join(opts.corpusDir, "search");
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  const files: [string, string][] = [
    ["docs.ndjson", toNdjson(out.docs)],
    ["moments.ndjson", toNdjson(out.moments)],
    [
      "search.json",
      `${JSON.stringify({ schemaVersion: SEARCH_SCHEMA_VERSION, docs: out.docs.length, moments: out.moments.length }, null, 1)}\n`,
    ],
  ];
  for (const [name, text] of files) if (writeIfChanged(join(dir, name), text)) written.push(name);
  return { docs: out.docs.length, moments: out.moments.length, keywordsFrom: topics.size, written };
}
