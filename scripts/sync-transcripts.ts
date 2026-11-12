// Mirror R2 transcripts into the repo as compact JSON keyed by recording id:
//   data/transcripts/<recordingId>.json
// Reads the local cache at out/transcripts/ (filled by ingest) and downloads anything missing.
// After this, nothing downstream needs R2 credentials.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { IngestOutput } from "../src/types.js";

export interface CompactTranscript {
  recordingId: string;
  key: string;
  duration: number;
  model: string;
  language: string | null;
  /** [start, end, text] */
  segments: [number, number, string][];
}

interface RawTranscript {
  key: string;
  duration: number;
  model: string;
  language?: string;
  segments: { start: number; end: number; text: string }[];
}

const ROOT = join(import.meta.dirname, "..");
const OUT_DIR = join(ROOT, "data/transcripts");
const CACHE_DIR = join(ROOT, "out/transcripts");

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const p = join(ROOT, ".env");
  if (!existsSync(p)) return env;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2];
  }
  return env;
}

let client: S3Client | null = null;
function s3(env: Record<string, string>): S3Client {
  if (client) return client;
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("Missing R2 credentials in .env; needed only for transcripts not yet cached");
  }
  client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  return client;
}

async function loadRaw(transcriptKey: string, env: Record<string, string>): Promise<RawTranscript> {
  const rel = transcriptKey.replace(/^transcripts\//, "") + ".json";
  const cachePath = join(CACHE_DIR, rel);
  if (!existsSync(cachePath)) {
    const res = await s3(env).send(
      new GetObjectCommand({ Bucket: env.R2_BUCKET ?? "emunas", Key: transcriptKey + ".json" }),
    );
    const body = await res.Body?.transformToString("utf8");
    if (!body) throw new Error(`Empty body for ${transcriptKey}`);
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, body);
  }
  return JSON.parse(readFileSync(cachePath, "utf8")) as RawTranscript;
}

async function main(): Promise<void> {
  const ingest = JSON.parse(readFileSync(join(ROOT, "data/derived/ingest.json"), "utf8")) as IngestOutput;
  const env = loadEnv();
  mkdirSync(OUT_DIR, { recursive: true });

  const wanted = ingest.recordings.filter(
    (r): r is typeof r & { transcriptKey: string } => r.transcriptKey !== null && r.duplicateOf === null,
  );
  const wantedIds = new Set(wanted.map((r) => r.id));
  let written = 0;
  let unchanged = 0;

  const queue = [...wanted];
  const worker = async (): Promise<void> => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const raw = await loadRaw(r.transcriptKey, env);
      const compact: CompactTranscript = {
        recordingId: r.id,
        key: raw.key,
        duration: raw.duration,
        model: raw.model,
        language: raw.language ?? null,
        segments: raw.segments.map((s) => [s.start, s.end, s.text]),
      };
      // One segment per line: compact but diff-friendly.
      const head = JSON.stringify({ ...compact, segments: undefined }).replace(/}$/, "");
      const segs = compact.segments.map((s) => JSON.stringify(s)).join(",\n");
      const text = `${head},"segments":[\n${segs}\n]}\n`;
      const path = join(OUT_DIR, `${r.id}.json`);
      if (existsSync(path) && readFileSync(path, "utf8") === text) unchanged++;
      else {
        writeFileSync(path, text);
        written++;
      }
    }
  };
  await Promise.all(Array.from({ length: 16 }, worker));

  let removed = 0;
  for (const f of readdirSync(OUT_DIR)) {
    if (f.endsWith(".json") && !wantedIds.has(f.slice(0, -5))) {
      unlinkSync(join(OUT_DIR, f));
      removed++;
    }
  }
  console.log(`transcripts: ${wanted.length} total, ${written} written, ${unchanged} unchanged, ${removed} removed`);
}

await main();
