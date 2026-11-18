/**
 * Pre-merge check that every recording the sites link has its AI-improved copy in the `emunas` R2
 * bucket at `fixed/sidon/<served key>` (docs/sites/cleaned-audio-ux.md, ops-runbook §11). The
 * corpus build assumes the copy exists for every playable recording unless its served key is in
 * `site-policy/audio-cleaned.json` `rejected`; this script is how that assumption is checked. It
 * is not part of the build and writes nothing.
 *
 *   npm run cleaned:verify --workspace=@emunas/audio
 *   npm run cleaned:verify --workspace=@emunas/audio -- --verify-duration   # also download + ffprobe
 *
 * Reports in-scope served keys with no improved copy (exit 1 unless rejected), empty objects
 * (exit 1) and stray objects under the prefix that match no recording (reported only). With
 * `--verify-duration`, each copy is downloaded and must be `audio/mpeg` (or have no type) and within
 * MAX_CLEANED_DRIFT_SEC of the original (exit 1 otherwise).
 *
 * R2 credentials come from the repo-root `.env`, loaded as in transcode-wma.ts; they are never
 * printed. Reads `data/derived/ingest.json` (read-only). Never reads keys under `transcripts/`.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GetObjectCommand, ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";
import type { IngestOutput } from "../../../src/types.ts";
import { CLEANED_PREFIX, cleanedKey } from "../src/cleaned.ts";
import { servedKey } from "../src/playable.ts";
import { INGEST_PATH, REPO_ROOT, loadEnv, probeAudio, readPolicy, s3FromEnv, type S3Like } from "./transcode-wma.ts";

export const CLEANED_POLICY_PATH = join(REPO_ROOT, "site-policy", "audio-cleaned.json");

/** Allowed difference between an improved copy and its original, in seconds. */
export const MAX_CLEANED_DRIFT_SEC = 0.5;

export interface ExpectedCopy {
  /** Served key of the original (what the sites link). */
  key: string;
  /** Original duration from the ingest, when known. */
  durationSec: number | null;
}

export interface ServedKeys {
  /** In-scope served keys, sorted, `duplicateOf` resolved to the canonical recording. */
  inScope: ExpectedCopy[];
  /** Served keys of every playable recording, in scope or not. */
  all: ReadonlySet<string>;
}

/** Served keys of the recordings the sites link (and of all recordings, to tell strays apart). */
export function servedKeysOf(
  ingest: Pick<IngestOutput, "shiurim" | "recordings">,
  transcoded: ReadonlySet<string>,
): ServedKeys {
  const byId = new Map(ingest.recordings.map((r) => [r.id, r]));
  const all = new Set<string>();
  for (const r of ingest.recordings) {
    const k = servedKey(r.audioKey, transcoded);
    if (k !== null) all.add(k);
  }
  const inScope = new Map<string, ExpectedCopy>();
  for (const s of ingest.shiurim) {
    if (!s.inScope) continue;
    for (const rid of s.recordingIds) {
      let rec = byId.get(rid);
      for (let i = 0; rec && rec.duplicateOf !== null && i < 16; i++) rec = byId.get(rec.duplicateOf);
      if (!rec || rec.duplicateOf !== null) continue;
      const key = servedKey(rec.audioKey, transcoded);
      if (key === null || inScope.has(key)) continue;
      const d = rec.durationSec;
      // A transcode has the WMA's duration in the ingest; that is the duration it was checked against.
      inScope.set(key, { key, durationSec: typeof d === "number" && d > 0 ? d : null });
    }
  }
  return { inScope: [...inScope.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)), all };
}

/** Served keys in `site-policy/audio-cleaned.json` `rejected`. Missing file → none. */
export function readRejected(path: string = CLEANED_POLICY_PATH): Set<string> {
  if (!existsSync(path)) return new Set();
  const j = JSON.parse(readFileSync(path, "utf8")) as { policyVersion?: unknown; rejected?: unknown };
  if (j.policyVersion !== 1 || !Array.isArray(j.rejected)) throw new Error(`${path}: not a policyVersion 1 file`);
  return new Set(j.rejected.map((e: { key?: unknown }) => String(e.key)));
}

export interface ListedObject {
  key: string;
  size: number;
}

/** Every object under `CLEANED_PREFIX` (paginated `ListObjectsV2`). */
export async function listCleaned(client: S3Like, bucket: string): Promise<ListedObject[]> {
  const out: ListedObject[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: CLEANED_PREFIX, ContinuationToken: token }),
    );
    for (const o of res.Contents ?? []) if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0 });
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

export interface CleanedReport {
  /** In-scope, not rejected, and no object: blocks the merge. */
  missing: string[];
  /** Rejected served keys with no object (fine). */
  rejectedMissing: string[];
  /** Rejected served keys whose object is present (fine; the sites do not link it). */
  rejectedPresent: string[];
  /** Objects of size 0 for an in-scope, not rejected key: blocks the merge. */
  empty: string[];
  /** Objects under the prefix that match the served key of no recording. */
  stray: string[];
  /** Objects for recordings that exist but are out of scope (count only). */
  outOfScope: number;
  /** In-scope, not rejected, present and non-empty: what `--verify-duration` checks. */
  present: ExpectedCopy[];
}

/** Compares the listing with the expected keys. Pure. */
export function compareCleaned(
  expected: ServedKeys,
  listed: readonly ListedObject[],
  rejected: ReadonlySet<string>,
): CleanedReport {
  const bySource = new Map<string, ListedObject>();
  const stray: string[] = [];
  let outOfScope = 0;
  const inScopeKeys = new Set(expected.inScope.map((e) => e.key));
  for (const o of listed) {
    const source = o.key.slice(CLEANED_PREFIX.length);
    if (!o.key.startsWith(CLEANED_PREFIX) || !expected.all.has(source)) {
      stray.push(o.key);
      continue;
    }
    if (!inScopeKeys.has(source)) outOfScope++;
    bySource.set(source, o);
  }
  const r: CleanedReport = { missing: [], rejectedMissing: [], rejectedPresent: [], empty: [], stray: stray.sort(), outOfScope, present: [] };
  for (const e of expected.inScope) {
    const o = bySource.get(e.key);
    if (rejected.has(e.key)) (o ? r.rejectedPresent : r.rejectedMissing).push(e.key);
    else if (!o) r.missing.push(e.key);
    else if (o.size <= 0) r.empty.push(e.key);
    else r.present.push(e);
  }
  return r;
}

export type DurationCheck =
  | { key: string; ok: true; originalSec: number; cleanedSec: number }
  | { key: string; ok: false; problem: string };

async function download(client: S3Like, bucket: string, key: string, file: string): Promise<string | undefined> {
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes || bytes.byteLength === 0) throw new Error("empty body");
  await writeFile(file, bytes);
  return res.ContentType;
}

/**
 * Downloads the improved copy (and the original when the ingest has no duration), checks the type
 * and that the durations differ by at most MAX_CLEANED_DRIFT_SEC.
 */
export async function verifyDuration(
  client: S3Like,
  bucket: string,
  e: ExpectedCopy,
  tmpRoot: string = tmpdir(),
): Promise<DurationCheck> {
  const dir = mkdtempSync(join(tmpRoot, "verify-cleaned-"));
  try {
    const cleanedFile = join(dir, "cleaned.mp3");
    const type = await download(client, bucket, cleanedKey(e.key), cleanedFile);
    if (type && type !== "audio/mpeg") return { key: e.key, ok: false, problem: `content type ${type}` };
    const cleanedSec = (await probeAudio(cleanedFile)).durationSec;
    let originalSec = e.durationSec;
    if (originalSec === null) {
      const originalFile = join(dir, "original.mp3");
      await download(client, bucket, e.key, originalFile);
      originalSec = (await probeAudio(originalFile)).durationSec;
    }
    if (Math.abs(cleanedSec - originalSec) > MAX_CLEANED_DRIFT_SEC) {
      return { key: e.key, ok: false, problem: `duration ${cleanedSec.toFixed(2)}s vs original ${originalSec.toFixed(2)}s` };
    }
    return { key: e.key, ok: true, originalSec, cleanedSec };
  } catch (err) {
    return { key: e.key, ok: false, problem: err instanceof Error ? err.message : String(err) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main(argv: string[]): Promise<number> {
  const withDuration = argv.includes("--verify-duration");
  const unknown = argv.filter((a) => a !== "--verify-duration");
  if (unknown.length > 0) {
    console.error(`Unknown arguments: ${unknown.join(" ")} (use --verify-duration)`);
    return 2;
  }
  const ingest = JSON.parse(readFileSync(INGEST_PATH, "utf8")) as IngestOutput;
  const expected = servedKeysOf(ingest, new Set(readPolicy().mp3Siblings));
  const rejected = readRejected();
  const env = loadEnv();
  const bucket = env["R2_BUCKET"] ?? "emunas";
  const client: S3Client = s3FromEnv(env);
  const listed = await listCleaned(client, bucket);
  const r = compareCleaned(expected, listed, rejected);

  console.log(
    `${expected.inScope.length} in-scope recording(s), ${listed.length} object(s) under ${CLEANED_PREFIX} in bucket ${bucket}, ` +
      `${rejected.size} rejected`,
  );
  for (const k of r.missing) console.log(`MISSING  ${k}`);
  for (const k of r.empty) console.log(`EMPTY    ${k}`);
  for (const k of r.stray) console.log(`stray    ${k}`);
  for (const k of r.rejectedPresent) console.log(`rejected ${k} (object present, not linked)`);
  for (const k of r.rejectedMissing) console.log(`rejected ${k} (no object)`);
  let failed = r.missing.length + r.empty.length;
  if (withDuration) {
    for (const e of r.present) {
      const c = await verifyDuration(client, bucket, e);
      if (c.ok) console.log(`ok       ${c.key} (${c.cleanedSec.toFixed(2)}s vs ${c.originalSec.toFixed(2)}s)`);
      else {
        failed++;
        console.log(`BAD      ${c.key}: ${c.problem}`);
      }
    }
  }
  console.log(
    `present ${r.present.length}, missing ${r.missing.length}, empty ${r.empty.length}, stray ${r.stray.length}, ` +
      `out of scope ${r.outOfScope}${withDuration ? `, duration failures ${failed - r.missing.length - r.empty.length}` : ""}`,
  );
  return failed > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    },
  );
}
