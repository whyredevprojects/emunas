// Production manifest: data/derived/manifest.json, one entry per in-scope shiur.
// Written by scripts/batch.ts only. One entry per line so git diffs stay small.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const SHIURIM_DIR = "data/derived/shiurim";
export const MANIFEST_PATH = "data/derived/manifest.json";
export const USAGE_PATH = "data/derived/usage.tsv";
export const AUDITS_DIR = "data/derived/audits";

export type Status = "pending" | "in_progress" | "done" | "failed" | "needs_review";
export const STATUSES: Status[] = ["pending", "in_progress", "done", "failed", "needs_review"];

export interface ValidatorSummary {
  extraction: { errors: number; warnings: number } | null; // null = file missing
  writeup: { errors: number; warnings: number } | null;
  /** First few errors (or the reason the shiur was not accepted). */
  firstErrors: string[];
  sections?: number;
  sources?: number;
  budget?: number;
  wordsEn?: number;
  wordsYi?: number;
}

export interface ManifestEntry {
  shiurId: string;
  lang: "yi" | "en";
  durationSec: number;
  /** Global processing order (languages interleaved proportionally); batch:next takes the lowest pending. */
  order: number;
  status: Status;
  /** Failed validation rounds so far (batch:finalize); 2 -> failed. */
  attempts: number;
  promptVersion: { p4: string | null; p4b: string | null } | null;
  model: string | null;
  validator: ValidatorSummary | null;
  /** batch id + agent group number of the latest batch:next that picked it. */
  batch: string | null;
  group: number | null;
  startedAt: string | null;
  updatedAt: string;
  note: string | null;
}

export interface Manifest {
  version: 1;
  updatedAt: string;
  entries: ManifestEntry[]; // sorted by order
}

export function loadManifest(path = MANIFEST_PATH): Manifest {
  if (!existsSync(path)) throw new Error(`${path} missing; run npm run batch:init`);
  const m = JSON.parse(readFileSync(path, "utf8")) as Manifest;
  m.entries.sort((a, b) => a.order - b.order);
  return m;
}

export function saveManifest(m: Manifest, path = MANIFEST_PATH): void {
  m.updatedAt = new Date().toISOString();
  m.entries.sort((a, b) => a.order - b.order);
  const lines = m.entries.map((e) => `  ${JSON.stringify(e)}`);
  writeFileSync(path, `{"version":${m.version},"updatedAt":${JSON.stringify(m.updatedAt)},"entries":[\n${lines.join(",\n")}\n]}\n`);
}
