// Re-queue shiurim whose transcripts changed since a git ref, so they get re-processed.
// Use after a new transcription run lands (transcripts:sync --refresh) and config/asr-policy.json is updated.
//
//   npx tsx scripts/reset-changed.ts <gitRef> [--dry-run]
//
// Compares data/transcripts/ between <gitRef> and the working tree. Every shiur that uses a changed
// transcript and is done / needs_review / failed goes back to pending (attempts 0), and its outputs
// (data/derived/shiurim/<id>/) and audit (data/derived/audits/<id>.json) are deleted.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import type { IngestOutput } from "../src/types.js";
import { AUDITS_DIR, loadManifest, saveManifest, SHIURIM_DIR } from "./lib/manifest.js";

const [ref, ...rest] = process.argv.slice(2);
const dry = rest.includes("--dry-run");
if (!ref) throw new Error("usage: npx tsx scripts/reset-changed.ts <gitRef> [--dry-run]");

const out = execFileSync("git", ["diff", "--name-only", ref, "--", "data/transcripts"], { encoding: "utf8" });
const changed = new Set(
  out
    .split("\n")
    .filter((l) => l.endsWith(".json"))
    .map((l) => l.slice(l.lastIndexOf("/") + 1, -5)),
);

const ingest = JSON.parse(readFileSync("data/derived/ingest.json", "utf8")) as IngestOutput;
const recs = new Map(ingest.shiurim.map((s) => [s.id, s.recordingIds]));
const m = loadManifest();
const now = new Date().toISOString();
const reset: string[] = [];
for (const e of m.entries) {
  if (e.status === "pending" || e.status === "in_progress") continue;
  if (!(recs.get(e.shiurId) ?? []).some((r) => changed.has(r))) continue;
  reset.push(e.shiurId);
  if (dry) continue;
  e.status = "pending";
  e.attempts = 0;
  e.note = `transcript changed since ${ref}`;
  e.updatedAt = now;
  rmSync(`${SHIURIM_DIR}/${e.shiurId}`, { recursive: true, force: true });
  const audit = `${AUDITS_DIR}/${e.shiurId}.json`;
  if (existsSync(audit)) rmSync(audit);
}
if (!dry) saveManifest(m);
console.log(
  `${changed.size} transcripts changed since ${ref}; ${reset.length} processed shiurim ${dry ? "would be" : "were"} reset to pending` +
    (reset.length ? `:\n  ${reset.join("\n  ")}` : ""),
);
