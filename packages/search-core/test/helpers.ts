import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";
import { buildCorpus } from "@emunas/corpus/build";

export const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO = resolve(PKG, "../..");
/** The @emunas/corpus mini corpus (derived text only; read here, never written). */
export const MINI_DATA = join(REPO, "packages/corpus/test/fixtures/mini/data");
export const MINI_POLICY = join(REPO, "packages/corpus/test/fixtures/mini/site-policy");
export const REAL_DATA = join(REPO, "data");
export const REAL_POLICY = join(REPO, "site-policy");

const tmpDirs: string[] = [];
afterAll(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

export function tmp(prefix = "search-core-test-"): string {
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

/** corpus:build into a fresh temp dir. */
export function buildCorpusTo(dataDir: string, policyDir: string, suppressFile?: string): string {
  const outDir = join(tmp(), ".corpus");
  const opts: Parameters<typeof buildCorpus>[0] = { dataDir, outDir, policyDir, dataSha: null };
  if (suppressFile !== undefined) opts.suppressFile = suppressFile;
  buildCorpus(opts);
  return outDir;
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

/** Every string anywhere in `x`, with its dotted path. */
export function allStrings(x: unknown, path = "", out: { path: string; value: string }[] = []): { path: string; value: string }[] {
  if (typeof x === "string") out.push({ path, value: x });
  else if (Array.isArray(x)) x.forEach((v, i) => allStrings(v, `${path}[${i}]`, out));
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) allStrings(v, path ? `${path}.${k}` : k, out);
  return out;
}
