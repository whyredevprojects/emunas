/**
 * The only way the build reads pipeline files (integration-plan §0, tech-live §3.1). Every path is
 * checked against an allow-list of regexes relative to the data root; anything else throws. That
 * includes the transcripts folder, the per-shiur ASR input file and the audit folder, which no
 * pattern below can match. (Transcripts are read only by `src/transcript-gate.ts`.)
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root (this file is packages/corpus/src/build/read.ts). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Data root: `EMUNAS_DATA_DIR`, else `<repo>/data`. */
export function defaultDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return env["EMUNAS_DATA_DIR"] ? resolve(env["EMUNAS_DATA_DIR"]) : resolve(REPO_ROOT, "data");
}

export function defaultPolicyDir(): string {
  return resolve(REPO_ROOT, "site-policy");
}

const SHIUR_ID = "[a-z0-9][a-z0-9-]*";

/** Paths (relative to the data root, `/`-separated) the build may read. */
export const DATA_ALLOW_LIST: readonly RegExp[] = [
  /^derived\/ingest\.json$/,
  /^derived\/manifest\.json$/,
  new RegExp(`^derived/shiurim/${SHIUR_ID}/(meta|extraction|writeup)\\.json$`),
  /^catalog\/(pocket-guide-2012|uncatalogued-guide)\.json$/,
];

/** Files in `site-policy/` the build may read. */
export const POLICY_ALLOW_LIST: readonly RegExp[] = [
  /^publish-policy\.json$/,
  /^verbatim-allow\.json$/,
  /^audio-transcoded\.json$/,
];

export class ForbiddenPathError extends Error {
  constructor(rel: string) {
    super(`corpus: refusing to read ${JSON.stringify(rel)}: not on the data allow-list`);
    this.name = "ForbiddenPathError";
  }
}

function checkedPath(root: string, rel: string, allow: readonly RegExp[]): string {
  if (isAbsolute(rel) || rel.includes("\\") || rel.split("/").some((p) => p === ".." || p === "." || p === "")) {
    throw new ForbiddenPathError(rel);
  }
  if (!allow.some((re) => re.test(rel))) throw new ForbiddenPathError(rel);
  const abs = resolve(root, rel);
  const back = relative(resolve(root), abs);
  if (back.startsWith("..") || isAbsolute(back) || back.split(sep).join("/") !== rel) throw new ForbiddenPathError(rel);
  return abs;
}

export interface DataReader {
  readonly root: string;
  /** Throws ForbiddenPathError for a path off the allow-list. */
  exists(rel: string): boolean;
  /** Raw text; null when the file does not exist. Throws ForbiddenPathError for a path off the allow-list. */
  readText(rel: string): string | null;
}

export function createDataReader(dataDir: string): DataReader {
  const root = resolve(dataDir);
  return {
    root,
    exists(rel) {
      return existsSync(checkedPath(root, rel, DATA_ALLOW_LIST));
    },
    readText(rel) {
      const abs = checkedPath(root, rel, DATA_ALLOW_LIST);
      if (!existsSync(abs)) return null;
      return readFileSync(abs, "utf8");
    },
  };
}

/** Read a site-policy file (null when missing). */
export function readPolicyText(policyDir: string, rel: string): string | null {
  const abs = checkedPath(resolve(policyDir), rel, POLICY_ALLOW_LIST);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, "utf8");
}
