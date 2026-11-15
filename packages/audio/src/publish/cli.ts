/**
 * audio-publish: copy in-scope, non-duplicate mp3s from the private bucket
 * `emunas` to `emunas-audio/<recordingId>.mp3` (integration-plan §3.2).
 *
 *   npm run audio:publish --workspace=@emunas/audio -- --dry-run
 *   npm run audio:publish --workspace=@emunas/audio -- [--concurrency 8] [--check-extraneous]
 *
 * Options:
 *   --ingest <path>       ingest.json (default: <repo>/data/derived/ingest.json)
 *   --dry-run             print the plan, touch nothing (no credentials needed)
 *   --json                print the plan (or result) as JSON instead of text
 *   --src-bucket <name>   default $R2_AUDIO_SRC_BUCKET or "emunas"
 *   --dst-bucket <name>   default $R2_AUDIO_DST_BUCKET or "emunas-audio"
 *   --concurrency <n>     parallel copies (1–32, default 8)
 *   --check-extraneous    after copying, list destination keys not in the plan (never deletes)
 *
 * Credentials (environment; run only from the protected `audio-publish` GitHub
 * environment or by a person): R2_AUDIO_SRC_{ENDPOINT,ACCESS_KEY_ID,SECRET_ACCESS_KEY}
 * and R2_AUDIO_DST_{ENDPOINT,ACCESS_KEY_ID,SECRET_ACCESS_KEY}; each falls back to
 * R2_{ENDPOINT,ACCESS_KEY_ID,SECRET_ACCESS_KEY}. The destination key must also be
 * able to read the source bucket (R2 CopyObject is executed by the destination).
 *
 * Source keys come only from ingest.json. There is no option to pass a key.
 */
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client } from "@aws-sdk/client-s3";
import { executePlan, type PublishClients } from "./execute.ts";
import { buildPublishPlan, DEFAULT_DST_BUCKET, DEFAULT_SRC_BUCKET, formatPlan, type IngestLike } from "./plan.ts";

export const REPO_ROOT = resolve(import.meta.dirname, "../../../..");
export const DEFAULT_INGEST = resolve(REPO_ROOT, "data/derived/ingest.json");

export interface CliArgs {
  ingest: string;
  dryRun: boolean;
  json: boolean;
  srcBucket: string;
  dstBucket: string;
  concurrency: number;
  checkExtraneous: boolean;
}

export type Env = Record<string, string | undefined>;

export function parseArgs(argv: readonly string[], env: Env = {}): CliArgs {
  const args: CliArgs = {
    ingest: DEFAULT_INGEST,
    dryRun: false,
    json: false,
    srcBucket: env.R2_AUDIO_SRC_BUCKET || DEFAULT_SRC_BUCKET,
    dstBucket: env.R2_AUDIO_DST_BUCKET || DEFAULT_DST_BUCKET,
    concurrency: 8,
    checkExtraneous: false,
  };
  const value = (i: number, flag: string): string => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new Error(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--check-extraneous":
        args.checkExtraneous = true;
        break;
      case "--ingest":
        args.ingest = resolve(value(i, a));
        i++;
        break;
      case "--src-bucket":
        args.srcBucket = value(i, a);
        i++;
        break;
      case "--dst-bucket":
        args.dstBucket = value(i, a);
        i++;
        break;
      case "--concurrency": {
        const n = Number(value(i, a));
        if (!Number.isInteger(n) || n < 1 || n > 32) throw new Error("--concurrency must be an integer 1–32");
        args.concurrency = n;
        i++;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${String(a)} (keys cannot be passed; they come from ingest.json)`);
    }
  }
  if (args.srcBucket === args.dstBucket) throw new Error("Source and destination buckets must differ");
  return args;
}

export function loadIngest(path: string): IngestLike {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (
    typeof raw !== "object" ||
    raw === null ||
    !Array.isArray((raw as { shiurim?: unknown }).shiurim) ||
    !Array.isArray((raw as { recordings?: unknown }).recordings)
  ) {
    throw new Error(`${path} does not look like ingest.json (needs shiurim[] and recordings[])`);
  }
  return raw as IngestLike;
}

function credentials(env: Env, side: "SRC" | "DST"): { endpoint: string; accessKeyId: string; secretAccessKey: string } {
  const pick = (name: string): string | undefined => env[`R2_AUDIO_${side}_${name}`] || env[`R2_${name}`];
  const endpoint = pick("ENDPOINT");
  const accessKeyId = pick("ACCESS_KEY_ID");
  const secretAccessKey = pick("SECRET_ACCESS_KEY");
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      `Missing R2 credentials for ${side === "SRC" ? "source" : "destination"}: set R2_AUDIO_${side}_ENDPOINT, ` +
        `R2_AUDIO_${side}_ACCESS_KEY_ID, R2_AUDIO_${side}_SECRET_ACCESS_KEY (or R2_*). Use --dry-run to only print the plan.`,
    );
  }
  return { endpoint, accessKeyId, secretAccessKey };
}

export function makeClients(env: Env): PublishClients {
  const mk = (side: "SRC" | "DST"): S3Client => {
    const c = credentials(env, side);
    return new S3Client({
      region: "auto",
      endpoint: c.endpoint,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    });
  };
  return { src: mk("SRC"), dst: mk("DST") };
}

export interface RunIo {
  out: (s: string) => void;
  err: (s: string) => void;
  env: Env;
  /** Injected in tests; defaults to real S3 clients from env. */
  clients?: (env: Env) => PublishClients;
}

/** Returns the process exit code. */
export async function run(argv: readonly string[], io: RunIo): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv, io.env);
  } catch (e) {
    io.err(e instanceof Error ? e.message : String(e));
    return 2;
  }
  const plan = buildPublishPlan(loadIngest(args.ingest), { srcBucket: args.srcBucket, dstBucket: args.dstBucket });

  if (args.dryRun) {
    io.out(args.json ? JSON.stringify(plan, null, 2) : formatPlan(plan));
    if (!args.json) io.out("\n(dry run: nothing copied)");
    return 0;
  }

  if (!args.json) io.out(formatPlan(plan));
  let clients: PublishClients;
  try {
    clients = (io.clients ?? makeClients)(io.env);
  } catch (e) {
    io.err(e instanceof Error ? e.message : String(e));
    return 2;
  }
  const result = await executePlan(plan, clients, {
    concurrency: args.concurrency,
    checkExtraneous: args.checkExtraneous,
    log: args.json ? () => {} : io.out,
  });
  if (args.json) {
    io.out(JSON.stringify({ counts: plan.counts, result }, null, 2));
  } else {
    io.out(
      `\ncopied ${result.copied}, skipped ${result.skipped} (already present), failed ${result.failed}, ` +
        `refused ${result.refused}` +
        (args.checkExtraneous ? `, extraneous in destination ${result.extraneous.length}` : ""),
    );
  }
  return result.failed > 0 ? 1 : 0;
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  run(process.argv.slice(2), {
    out: (s) => process.stdout.write(`${s}\n`),
    err: (s) => process.stderr.write(`${s}\n`),
    env: process.env,
  }).then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
      process.exitCode = 1;
    },
  );
}
