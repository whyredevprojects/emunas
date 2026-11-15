import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";
import { buildCorpusWithAggregates as buildCorpus } from "@emunas/corpus/build/aggregate";
import { buildSearchOutputs, contentHash, readCorpusShiurim, writeSearchOutputs } from "@emunas/search-core/build";
import type { MomentRow } from "@emunas/search-core";
import { MiniflareD1Target } from "../src/local.ts";

export const SYNC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const API = resolve(SYNC, "..");
export const REPO = resolve(API, "../..");
export const MIGRATIONS = join(API, "migrations/search");
export const MINI_DATA = join(REPO, "packages/corpus/test/fixtures/mini/data");
export const MINI_POLICY = join(REPO, "packages/corpus/test/fixtures/mini/site-policy");
export const REAL_DATA = join(REPO, "data");
export const REAL_POLICY = join(REPO, "site-policy");

const tmpDirs: string[] = [];
afterAll(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

export function tmp(prefix = "emunas-sync-test-"): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

/** corpus:build + search:build of the mini corpus into a temp `.corpus/`. */
export function buildMiniCorpus(dataDir = MINI_DATA): string {
  const outDir = join(tmp(), ".corpus");
  buildCorpus({ dataDir, outDir, policyDir: MINI_POLICY, dataSha: null });
  writeSearchOutputs({ corpusDir: outDir, dataDir });
  return outDir;
}

let miniRows: MomentRow[] | null = null;
/** MomentRows of the mini corpus (built once per test file). */
export function miniMoments(): MomentRow[] {
  if (miniRows === null) {
    const corpus = buildMiniCorpus();
    miniRows = buildSearchOutputs(readCorpusShiurim(corpus)).moments;
  }
  return miniRows.map((r) => structuredClone(r));
}

/** A writable copy of the mini data. */
export function miniDataCopy(): string {
  const d = join(tmp(), "data");
  cpSync(MINI_DATA, d, { recursive: true });
  return d;
}

/** Re-hash a row after editing it (what search:build would produce). */
export function rehash(row: MomentRow): MomentRow {
  const { hash: _old, ...rest } = row;
  return { ...rest, hash: contentHash(rest) } as MomentRow;
}

export const migrationFiles = (): string[] =>
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(MIGRATIONS, f));

/** A fresh in-memory local D1 with the search migrations applied. */
export async function freshD1(): Promise<MiniflareD1Target> {
  const t = new MiniflareD1Target({ persistTo: null, databaseId: `test-${Math.random().toString(36).slice(2)}` });
  await t.applyMigrationFiles(migrationFiles());
  return t;
}

/** Counts per table. */
export async function tableCounts(t: MiniflareD1Target): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of ["moments", "moment_entities", "moment_text", "fts_words", "fts_tri"]) {
    const r = await t.all<{ n: number }>(`SELECT count(*) AS n FROM ${table}`);
    out[table] = r[0]?.n ?? -1;
  }
  return out;
}
