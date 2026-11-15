/**
 * `.corpus/search/docs.ndjson` (one SearchDoc per in-scope shiur), `.corpus/search/moments.ndjson`
 * (MomentRows) and `.corpus/search/entities.ndjson` (EntityDocs), from `.corpus/` and its corpus
 * layer (`.corpus/layer/`). With a data dir, the layer's synonyms are first checked against the
 * entities' display fields (read through @emunas/corpus's allow-listed reader), and the corpus
 * policy must keep `search.asrVariants` false.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CorpusIndex, PublicShiur } from "@emunas/corpus/public";
import { defaultPolicyDir } from "@emunas/corpus/build";
import type { SearchLayer } from "../layer-types.ts";
import { SEARCH_SCHEMA_VERSION, type EntityDoc, type MomentRow, type SearchDoc } from "../types.ts";
import { buildMomentRows, buildSearchDoc } from "./docs.ts";
import { buildEntityDocs } from "./entities.ts";
import { loadDisplaySets, readLayerFiles, readSearchLayer, verifyDisplaySynonyms, type LayerFiles } from "./layer.ts";

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
  entities: EntityDoc[];
}

/** The layer pieces for `buildSearchOutputs`. */
export interface SearchLayerInput {
  layer: SearchLayer;
  files: LayerFiles;
}

/** Read `.corpus/layer/` for these shiurim, or null when the layer is absent or off. */
export function readSearchLayerInput(corpusDir: string, shiurim: readonly PublicShiur[]): SearchLayerInput | null {
  const files = readLayerFiles(corpusDir);
  if (files === null) return null;
  return { files, layer: readSearchLayer(corpusDir, files, shiurim.filter((s) => s.status === "full").map((s) => s.id)) };
}

/** Docs, rows and entity docs for a set of shiurim, sorted by id. Without a layer: no keywords, no entity ids, no entity docs. */
export function buildSearchOutputs(shiurim: readonly PublicShiur[], layer: SearchLayerInput | null = null): SearchOutputs {
  const sorted = [...shiurim].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const docs = sorted.map((shiur) => buildSearchDoc({ shiur, layer: layer?.layer ?? null }));
  const moments = sorted.flatMap((s) => buildMomentRows(s, layer?.layer ?? null));
  const entities = layer ? buildEntityDocs(layer.files) : [];
  return { docs, moments, entities };
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
  /**
   * Data dir whose corpus entity files (allow-listed reader) give the display fields the layer's
   * synonyms are checked against before use. null skips that check (the guard post-pass still runs it).
   */
  dataDir: string | null;
  /** `site-policy/` (corpus-policy.json, D1 assert); default the repo's. Used with `dataDir`. */
  policyDir?: string;
}

export interface WriteSearchResult {
  docs: number;
  moments: number;
  entities: number;
  /** Docs with topic keywords. */
  keywordsFrom: number;
  /** Whether `.corpus/layer/` was used. */
  layer: boolean;
  /** Whether the synonyms were checked against the display fields. */
  synonymsChecked: boolean;
  /** Files whose content changed. */
  written: string[];
}

export function writeSearchOutputs(opts: WriteSearchOptions): WriteSearchResult {
  const shiurim = readCorpusShiurim(opts.corpusDir);
  const layer = readSearchLayerInput(opts.corpusDir, shiurim);
  let synonymsChecked = false;
  if (opts.dataDir !== null) {
    const display = loadDisplaySets(opts.dataDir, opts.policyDir ?? defaultPolicyDir());
    if (layer !== null && display !== null) {
      verifyDisplaySynonyms(layer.files.synonyms.synonyms, display);
      synonymsChecked = true;
    }
  }
  const out = buildSearchOutputs(shiurim, layer);
  const dir = join(opts.corpusDir, "search");
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  const files: [string, string][] = [
    ["docs.ndjson", toNdjson(out.docs)],
    ["moments.ndjson", toNdjson(out.moments)],
    ["entities.ndjson", toNdjson(out.entities)],
    [
      "search.json",
      `${JSON.stringify(
        { schemaVersion: SEARCH_SCHEMA_VERSION, layer: layer !== null, docs: out.docs.length, moments: out.moments.length, entities: out.entities.length },
        null,
        1,
      )}\n`,
    ],
  ];
  for (const [name, text] of files) if (writeIfChanged(join(dir, name), text)) written.push(name);
  return {
    docs: out.docs.length,
    moments: out.moments.length,
    entities: out.entities.length,
    keywordsFrom: out.docs.filter((d) => d.keywords.length > 0).length,
    layer: layer !== null,
    synonymsChecked,
    written,
  };
}
