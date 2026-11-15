/**
 * Transcode the in-scope non-mp3 (`.WMA`) recordings to MP3 and upload each next to its original in
 * the `emunas` R2 bucket: same key, extension `.mp3`. The WMA is kept. After each successful upload
 * the original key is added to `site-policy/audio-transcoded.json`, which makes the corpus build
 * link the MP3 (see `servedKey` in src/playable.ts).
 *
 *   npm run transcode:wma --workspace=@emunas/audio -- --dry-run   # list the plan, touch nothing
 *   npm run transcode:wma --workspace=@emunas/audio                # do it
 *   ... -- --force                                                  # re-transcode over an existing .mp3
 *
 * R2 credentials come from the repo-root `.env` (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET default `emunas`), read the same way as the pipeline's sync-transcripts script. Needs
 * `ffmpeg` and `ffprobe` on PATH. Never reads or writes keys under `transcripts/`.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { IngestOutput } from "../../../src/types.ts";
import { mp3SiblingKey } from "../src/playable.ts";
import { refuseKey } from "../src/media.ts";

const run = promisify(execFile);

/** Repo root (this file is packages/audio/scripts/transcode-wma.ts). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const INGEST_PATH = join(REPO_ROOT, "data", "derived", "ingest.json");
export const POLICY_PATH = join(REPO_ROOT, "site-policy", "audio-transcoded.json");

/** Allowed difference between source and MP3 duration, in seconds. */
export const MAX_DURATION_DRIFT_SEC = 1;

/** The S3 client surface this script uses (a real S3Client, or a mock in tests). */
export type S3Like = Pick<S3Client, "send">;

export interface TranscodedPolicy {
  policyVersion: 1;
  /** Original (non-mp3) keys with an MP3 transcode next to them. */
  mp3Siblings: string[];
}

/** Repo-root `.env` as KEY=value lines (same parsing as the pipeline's sync-transcripts script). */
export function loadEnv(root: string = REPO_ROOT): Record<string, string> {
  const env: Record<string, string> = {};
  const p = join(root, ".env");
  if (!existsSync(p)) return env;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2];
  }
  return env;
}

export function s3FromEnv(env: Record<string, string>): S3Client {
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("Missing R2 credentials in .env (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)");
  }
  return new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
}

const isWma = (key: string) => key.toLowerCase().endsWith(".wma");

/** Throws unless `key` is a WMA key this script may read and write a sibling of. */
export function assertWmaKey(key: string): string {
  if (key.toLowerCase().startsWith("transcripts/") || refuseKey(key) !== null || !isWma(key)) {
    throw new Error(`Refusing key ${JSON.stringify(key)}: not a plain .wma audio key`);
  }
  const sibling = mp3SiblingKey(key);
  if (sibling === null) throw new Error(`No .mp3 sibling key for ${JSON.stringify(key)}`);
  return sibling;
}

/**
 * The distinct `.wma` keys (any case) behind in-scope recordings, `duplicateOf` resolved to the
 * canonical recording. Sorted.
 */
export function inScopeWmaKeys(ingest: Pick<IngestOutput, "shiurim" | "recordings">): string[] {
  const byId = new Map(ingest.recordings.map((r) => [r.id, r]));
  const keys = new Set<string>();
  for (const s of ingest.shiurim) {
    if (!s.inScope) continue;
    for (const rid of s.recordingIds) {
      let rec = byId.get(rid);
      for (let i = 0; rec && rec.duplicateOf !== null && i < 16; i++) rec = byId.get(rec.duplicateOf);
      if (rec && isWma(rec.audioKey) && refuseKey(rec.audioKey) === null) keys.add(rec.audioKey);
    }
  }
  return [...keys].sort();
}

export interface AudioProbe {
  durationSec: number;
  channels: number;
  sampleRate: number;
}

/** Duration, channel count and sample rate of the first audio stream (ffprobe). */
export async function probeAudio(file: string): Promise<AudioProbe> {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "a:0",
    "-show_entries", "stream=channels,sample_rate:format=duration",
    "-of", "json",
    file,
  ]);
  const j = JSON.parse(stdout) as { streams?: { channels?: number; sample_rate?: string }[]; format?: { duration?: string } };
  const st = j.streams?.[0];
  const durationSec = Number(j.format?.duration);
  const channels = Number(st?.channels);
  const sampleRate = Number(st?.sample_rate);
  if (!st || !Number.isFinite(durationSec) || !(channels > 0) || !(sampleRate > 0)) {
    throw new Error(`ffprobe: no usable audio stream in ${file}`);
  }
  return { durationSec, channels, sampleRate };
}

export interface TranscodeResult {
  source: AudioProbe;
  mp3: AudioProbe;
}

/**
 * `ffmpeg -i in -codec:a libmp3lame -q:a 4 out.mp3`, mono kept mono, sample rate kept; then checks
 * with ffprobe that the MP3's duration is within MAX_DURATION_DRIFT_SEC of the source. Throws otherwise.
 */
export async function transcodeToMp3(input: string, output: string): Promise<TranscodeResult> {
  const source = await probeAudio(input);
  const args = ["-hide_banner", "-v", "error", "-y", "-i", input, "-map", "0:a:0", "-vn", "-codec:a", "libmp3lame", "-q:a", "4"];
  if (source.channels === 1) args.push("-ac", "1");
  args.push("-ar", String(source.sampleRate), output);
  await run("ffmpeg", args);
  const mp3 = await probeAudio(output);
  if (Math.abs(mp3.durationSec - source.durationSec) > MAX_DURATION_DRIFT_SEC) {
    throw new Error(`Duration check failed: source ${source.durationSec}s, mp3 ${mp3.durationSec}s`);
  }
  if (source.channels === 1 && mp3.channels !== 1) throw new Error("Mono source produced a non-mono MP3");
  if (mp3.sampleRate !== source.sampleRate) {
    throw new Error(`Sample rate changed: ${source.sampleRate} → ${mp3.sampleRate}`);
  }
  return { source, mp3 };
}

async function objectExists(client: S3Like, bucket: string, key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === "NotFound" || err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) return false;
    throw e;
  }
}

export type TranscodeOutcome =
  | { key: string; mp3Key: string; status: "exists" }
  | { key: string; mp3Key: string; status: "planned" }
  | { key: string; mp3Key: string; status: "uploaded"; result: TranscodeResult; bytes: number };

export interface TranscodeOneOptions {
  bucket: string;
  dryRun?: boolean;
  /** Re-transcode and overwrite an existing `.mp3` sibling. */
  force?: boolean;
  /** Parent for the per-key temp dir (default: the OS temp dir). */
  tmpRoot?: string;
}

/** Download one WMA, transcode, verify and upload the `.mp3` sibling (unless it exists or dry-run). */
export async function transcodeOne(client: S3Like, key: string, opts: TranscodeOneOptions): Promise<TranscodeOutcome> {
  const mp3Key = assertWmaKey(key);
  if (!opts.force && (await objectExists(client, opts.bucket, mp3Key))) return { key, mp3Key, status: "exists" };
  if (opts.dryRun) return { key, mp3Key, status: "planned" };

  const dir = mkdtempSync(join(opts.tmpRoot ?? tmpdir(), "transcode-wma-"));
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: opts.bucket, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes || bytes.byteLength === 0) throw new Error(`Empty body for ${key}`);
    const input = join(dir, "in.wma");
    const output = join(dir, "out.mp3");
    await writeFile(input, bytes);
    const result = await transcodeToMp3(input, output);
    const body = await readFile(output);
    await client.send(
      new PutObjectCommand({
        Bucket: opts.bucket,
        Key: mp3Key,
        Body: body,
        ContentType: "audio/mpeg",
        ContentLength: body.byteLength,
      }),
    );
    return { key, mp3Key, status: "uploaded", result, bytes: body.byteLength };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function readPolicy(path: string = POLICY_PATH): TranscodedPolicy {
  if (!existsSync(path)) return { policyVersion: 1, mp3Siblings: [] };
  const j = JSON.parse(readFileSync(path, "utf8")) as Partial<TranscodedPolicy>;
  if (j.policyVersion !== 1 || !Array.isArray(j.mp3Siblings)) throw new Error(`${path}: not a policyVersion 1 file`);
  return { policyVersion: 1, mp3Siblings: [...j.mp3Siblings] };
}

/** Adds `key` to `mp3Siblings` (sorted, no duplicates). */
export function recordTranscoded(key: string, path: string = POLICY_PATH): void {
  assertWmaKey(key);
  const p = readPolicy(path);
  const list = [...new Set([...p.mp3Siblings, key])].sort();
  writeFileSync(path, `${JSON.stringify({ policyVersion: 1, mp3Siblings: list }, null, 2)}\n`);
}

async function main(argv: string[]): Promise<number> {
  const dryRun = argv.includes("--dry-run");
  const force = argv.includes("--force");
  const unknown = argv.filter((a) => a !== "--dry-run" && a !== "--force");
  if (unknown.length > 0) {
    console.error(`Unknown arguments: ${unknown.join(" ")} (use --dry-run, --force)`);
    return 2;
  }
  const ingest = JSON.parse(readFileSync(INGEST_PATH, "utf8")) as IngestOutput;
  const keys = inScopeWmaKeys(ingest);
  const env = loadEnv();
  const bucket = env["R2_BUCKET"] ?? "emunas";
  const listed = new Set(readPolicy().mp3Siblings);
  console.log(`${keys.length} in-scope .wma recording(s), bucket ${bucket}${dryRun ? " (dry run)" : ""}`);
  let client: S3Client;
  try {
    client = s3FromEnv(env);
  } catch (e) {
    if (!dryRun) throw e;
    // A dry run without credentials still lists the plan; it just cannot check what exists.
    console.log("(no R2 credentials: existing .mp3 siblings not checked)");
    for (const key of keys) console.log(`plan    ${key}\n     -> ${assertWmaKey(key)}`);
    return 0;
  }
  let failed = 0;
  for (const key of keys) {
    try {
      const o = await transcodeOne(client, key, { bucket, dryRun, force });
      if (o.status === "exists") {
        console.log(`skip    ${o.mp3Key} (exists${listed.has(key) ? "" : "; NOT listed in site-policy/audio-transcoded.json"})`);
      } else if (o.status === "planned") {
        console.log(`plan    ${key}\n     -> ${o.mp3Key}`);
      } else {
        recordTranscoded(key);
        const { source, mp3 } = o.result;
        console.log(
          `upload  ${o.mp3Key} (${(o.bytes / 1e6).toFixed(1)} MB, ${mp3.durationSec.toFixed(1)}s vs ${source.durationSec.toFixed(1)}s, ` +
            `${mp3.channels}ch ${mp3.sampleRate} Hz); recorded`,
        );
      }
    } catch (e) {
      failed++;
      console.error(`FAILED  ${key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return failed > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(e);
      process.exit(1);
    },
  );
}
