/**
 * Build-time data of the corpus-entry indexes (C2.1: שמות, מראי מקומות, ערכים): the corpus layer
 * (`.corpus/layer/`, through the C1.8 reader) plus what the catalog gives every citation.
 *
 * Reads, from `.corpus/` only:
 * - `index.json`: the catalog rows a citation prints (parsha or zman, number, year) and the
 *   catalog order;
 * - `shiurim/<id>.json`: chapter titles and times, for the glossary's "well illustrated in" lines;
 * - `works.json` (optional): the reference-order layout of a work page (Bereishis 8:7 → shiur →
 *   minute), filed by the corpus work id (`workId`). Without it a work page lists its shiurim.
 *
 * Every shiur shown is in the layer's visible set (`shiur/<id>.json` exists in the layer), so a
 * needs_review shiur, or one without notes, is never linked. Nothing here reads the pipeline's
 * data folder.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MentionRef, WorkEntry, WorksFile } from "@emunas/corpus/aggregate";
import type { CorpusIndex, IndexRow, PublicShiur } from "@emunas/corpus/public";
import { findLayerDir, loadQuietLayer, quietLayer, type QuietLayer } from "../corpus/layer.ts";
import { findCorpusDir, type ChapterRef } from "./corpus.ts";

export interface EntryData {
  readonly layer: QuietLayer;
  /** Catalog rows by shiur id. */
  readonly rows: ReadonlyMap<string, IndexRow>;
  /** Position of a shiur in catalog order. */
  readonly order: ReadonlyMap<string, number>;
  /** True for a shiur in the layer's visible set (the only shiurim these pages link). */
  visible(shiurId: string): boolean;
  /** Chapters of a visible shiur by `idx` (empty when unknown). */
  chapters(shiurId: string): ReadonlyMap<number, ChapterRef>;
  /** Aggregate works entries filed under a corpus work id (empty without `works.json`). */
  referencesOf(workId: string): readonly WorkEntry[];
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Keeps only the mentions in visible shiurim; an entry left with none is dropped. */
function visibleEntry(w: WorkEntry, visible: (id: string) => boolean): WorkEntry | null {
  const keep = (ms: readonly MentionRef[]) => ms.filter((m) => typeof m?.shiurId === "string" && visible(m.shiurId));
  const refs = (Array.isArray(w.refs) ? w.refs : []).map((r) => ({ ...r, mentions: keep(r.mentions ?? []) })).filter((r) => r.mentions.length > 0);
  const unlocated = keep(Array.isArray(w.unlocated) ? w.unlocated : []);
  if (refs.length === 0 && unlocated.length === 0) return null;
  return { ...w, refs, unlocated };
}

/** Loads the entry data of a corpus directory and its layer. */
export function loadEntryData(corpusDir: string | null, layer: QuietLayer): EntryData {
  const index = corpusDir === null ? null : readJson<CorpusIndex>(join(corpusDir, "index.json"));
  const list = Array.isArray(index?.shiurim) ? index.shiurim : [];
  const rows = new Map(list.filter((r) => typeof r?.id === "string").map((r) => [r.id, r]));
  const order = new Map([...rows.keys()].map((id, i) => [id, i]));
  const visibleCache = new Map<string, boolean>();
  const visible = (id: string): boolean => {
    let v = visibleCache.get(id);
    if (v === undefined) {
      v = rows.has(id) && layer.shiurRefs(id) !== null;
      visibleCache.set(id, v);
    }
    return v;
  };
  const chapterCache = new Map<string, ReadonlyMap<number, ChapterRef>>();
  const empty: ReadonlyMap<number, ChapterRef> = new Map();
  const works = corpusDir === null ? null : readJson<WorksFile>(join(corpusDir, "works.json"));
  const byWork = new Map<string, WorkEntry[]>();
  for (const w of Array.isArray(works?.works) ? works.works : []) {
    if (typeof w?.workId !== "string" || w.workId === "") continue;
    const kept = visibleEntry(w, visible);
    if (!kept) continue;
    const l = byWork.get(w.workId) ?? [];
    l.push(kept);
    byWork.set(w.workId, l);
  }
  return {
    layer,
    rows,
    order,
    visible,
    chapters(shiurId) {
      const hit = chapterCache.get(shiurId);
      if (hit) return hit;
      if (corpusDir === null || !SAFE_ID.test(shiurId) || !visible(shiurId)) return empty;
      const shiur = readJson<Pick<PublicShiur, "notes">>(join(corpusDir, "shiurim", `${shiurId}.json`));
      const chapters = Array.isArray(shiur?.notes?.chapters) ? shiur.notes.chapters : [];
      const map = new Map<number, ChapterRef>(chapters.map((c) => [c.idx, { idx: c.idx, t: c.t, title: c.title }]));
      chapterCache.set(shiurId, map);
      return map;
    },
    referencesOf: (workId) => byWork.get(workId) ?? [],
  };
}

/** Loads a corpus directory with its own layer (tests). */
export function loadEntryDataFrom(corpusDir: string): EntryData {
  return loadEntryData(corpusDir, loadQuietLayer(findLayerDir(corpusDir)));
}

let cached: { key: string; data: EntryData | null } | null = null;

/**
 * The entry data of this build, or null without a layer (the index routes then build nothing; the
 * layer reader has printed why). Memoised per corpus directory.
 */
export function entryData(): EntryData | null {
  const dir = findCorpusDir();
  const key = dir ?? "";
  if (cached && cached.key === key) return cached.data;
  const layer = quietLayer();
  cached = { key, data: layer.enabled ? loadEntryData(dir, layer) : null };
  return cached.data;
}
