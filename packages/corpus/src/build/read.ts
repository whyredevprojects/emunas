/**
 * The only way the build reads pipeline files (integration-plan §0, tech-live §3.1). Every path is
 * checked first against a deny list, then against an allow-list of regexes relative to the data
 * root; anything else throws. That includes the transcripts folder, the per-shiur ASR input file and
 * the audit folder, which no pattern below can match. (Transcripts are read only by
 * `src/transcript-gate.ts`.)
 *
 * Corpus layer (corpus-wave-plan §3.1): only the named public files under `derived/corpus/` are
 * allowed. The internal aggregation folder, every alias map, every ASR / heard-as / variant file,
 * the agents' working folders and the section search dump are denied before the allow-list is
 * consulted, so a later, wider allow pattern can never open them.
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

/**
 * Denied before the allow-list (corpus-wave-plan §3.1). Written with escaped slashes so the source
 * does not carry the internal folder's path as a literal.
 */
export const DATA_DENY_LIST: readonly RegExp[] = [
  // The internal aggregation inputs: alias maps, ASR variants, digests, links.
  /^derived\/corpus\/raw(?:\/|$)/,
  // Any alias map, ASR, heard-as or variant file anywhere under derived/corpus/.
  /^derived\/corpus\/.*(?:alias-map|asr|heard|variant)/i,
  // Alias maps and ASR variant dumps anywhere in the data root.
  /alias-map|asr-variant|heard-?as/i,
  // The agents' working folders (the public teaching-clusters.json is a file, not this folder).
  /^derived\/corpus\/topic-tags(?:\/|$)/,
  /^derived\/corpus\/teaching-clusters\//,
  // The section search dump (segment indices; the sites have their own time model).
  /^derived\/corpus\/search(?:\/|$)/,
];

/** Paths (relative to the data root, `/`-separated) the build may read. */
export const DATA_ALLOW_LIST: readonly RegExp[] = [
  /^derived\/ingest\.json$/,
  /^derived\/manifest\.json$/,
  new RegExp(`^derived/shiurim/${SHIUR_ID}/(meta|extraction|writeup)\\.json$`),
  /^catalog\/(pocket-guide-2012|uncatalogued-guide)\.json$/,
  /^derived\/corpus\/(index|topics|concepts|people|works|stories|teaching-clusters|redirects)\.json$/,
  new RegExp(`^derived/corpus/series/${SHIUR_ID}\\.json$`),
  new RegExp(`^derived/corpus/shiur-tags/${SHIUR_ID}\\.json$`),
];

/** Files in `site-policy/` the build may read. */
export const POLICY_ALLOW_LIST: readonly RegExp[] = [
  /^publish-policy\.json$/,
  /^verbatim-allow\.json$/,
  /^audio-transcoded\.json$/,
  /^audio-cleaned\.json$/,
  /^corpus-policy\.json$/,
];

export class ForbiddenPathError extends Error {
  readonly rel: string;
  readonly denied: boolean;
  constructor(rel: string, denied = false) {
    super(`corpus: refusing to read ${JSON.stringify(rel)}: ${denied ? "denied (internal corpus material)" : "not on the data allow-list"}`);
    this.name = "ForbiddenPathError";
    this.rel = rel;
    this.denied = denied;
  }
}

/** True when a data path is on the deny list (checked before any allow pattern). */
export function isDeniedDataPath(rel: string): boolean {
  return DATA_DENY_LIST.some((re) => re.test(rel));
}

/** True when the data reader would open this path (deny list first, then allow-list). */
export function isAllowedDataPath(rel: string): boolean {
  return !isDeniedDataPath(rel) && DATA_ALLOW_LIST.some((re) => re.test(rel));
}

function checkedPath(root: string, rel: string, allow: readonly RegExp[], deny: readonly RegExp[] = []): string {
  if (isAbsolute(rel) || rel.includes("\\") || rel.split("/").some((p) => p === ".." || p === "." || p === "")) {
    throw new ForbiddenPathError(rel);
  }
  if (deny.some((re) => re.test(rel))) throw new ForbiddenPathError(rel, true);
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
      return existsSync(checkedPath(root, rel, DATA_ALLOW_LIST, DATA_DENY_LIST));
    },
    readText(rel) {
      const abs = checkedPath(root, rel, DATA_ALLOW_LIST, DATA_DENY_LIST);
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
