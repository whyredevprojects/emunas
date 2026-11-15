/** Shared helpers for the data-build tests (not shipped). */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";
import { buildCorpusWithAggregates } from "@emunas/corpus/build/aggregate";

export const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO = resolve(APP, "../..");
/** The @emunas/corpus mini corpus (derived text only; read here, never written). */
export const MINI_DATA = join(REPO, "packages/corpus/test/fixtures/mini/data");
export const MINI_POLICY = join(REPO, "packages/corpus/test/fixtures/mini/site-policy");
export const REAL_DATA = join(REPO, "data");
export const REAL_POLICY = join(REPO, "site-policy");
export const GENERATED_AT = "2026-11-15T00:00:00.000Z";

const tmpDirs: string[] = [];
afterAll(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

export function tmp(prefix = "live-data-build-test-"): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

/** A writable copy of the mini data dir. */
export function miniCopy(): string {
  const d = join(tmp(), "data");
  cpSync(MINI_DATA, d, { recursive: true });
  return d;
}

/** corpus:build (with the W2.1 aggregates) into `outDir` (a fresh temp dir by default). */
export function buildCorpusTo(
  dataDir: string,
  policyDir: string,
  opts: { outDir?: string; suppressFile?: string; mediaOrigin?: string } = {},
): string {
  const outDir = opts.outDir ?? join(tmp(), ".corpus");
  const o: Parameters<typeof buildCorpusWithAggregates>[0] = { dataDir, outDir, policyDir, dataSha: null };
  if (opts.suppressFile !== undefined) o.suppressFile = opts.suppressFile;
  if (opts.mediaOrigin !== undefined) o.mediaOrigin = opts.mediaOrigin;
  buildCorpusWithAggregates(o);
  return outDir;
}

export function editJson<T>(path: string, f: (x: T) => void): void {
  const x = JSON.parse(readFileSync(path, "utf8")) as T;
  f(x);
  writeFileSync(path, JSON.stringify(x));
}

/** Every key of every object anywhere in `x`. */
export function allKeys(x: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(x)) for (const v of x) allKeys(v, out);
  else if (x && typeof x === "object") {
    for (const [k, v] of Object.entries(x)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}
