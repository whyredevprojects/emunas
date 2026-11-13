// Production batch driver for P4 + P4b (combined per-shiur Opus agents). The LLM work is done by Claude
// subagents launched by a Claude session (see docs/batch-runbook.md); this script only prepares inputs,
// tracks state in data/derived/manifest.json and validates outputs.
//
//   npm run batch:init [-- --reset]        create/refresh the manifest from ingest (--reset: all pending)
//   npm run batch:next -- <N>               pick the next N pending shiurim, prepare inputs, mark in_progress,
//                                           print agent groups and their filled-in prompts
//   npm run batch:finalize                  validate every in_progress shiur -> done | pending | failed
//   npm run batch:status                    overall counts
//   npm run batch:reset-stale [-- --hours 12]  in_progress older than 12 h -> pending
//   npm run batch:mark -- <shiurId> <status> [note]   manual status change (e.g. needs_review after an audit)
//   npm run batch:pick-audit                print one random done shiur that has no audit yet
//   npm run batch:usage -- run <group> <tokens> <toolUses> <durationMs> <result> [--batch id]
//   npm run batch:usage -- audit <shiurId> <tokens> <toolUses> <durationMs> <severity>
//                                           append one agent's usage to data/derived/usage.tsv
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomInt } from "node:crypto";
import type { Extraction, IngestOutput, Shiur, Writeup } from "../src/types.js";
import {
  AUDITS_DIR,
  loadManifest,
  MANIFEST_PATH,
  saveManifest,
  SHIURIM_DIR,
  STATUSES,
  USAGE_PATH,
  type Manifest,
  type ManifestEntry,
  type Status,
  type ValidatorSummary,
} from "./lib/manifest.js";
import { mmss } from "./lib/pilot.js";
import { ingestDurationSec, prepareShiur } from "./lib/prepare.js";
import { checkPromptHeaders, PROMPT_VERSIONS } from "./lib/versions.js";
import { validateFile } from "./validate.js";

const INGEST_PATH = "data/derived/ingest.json";
const RUN_PROMPT = "prompts/run-shiur.md";
const RUNBOOK = "docs/batch-runbook.md";
const MODEL = "opus";
const MAX_ATTEMPTS = 2;
const SHORT_SEC = 15 * 60;
const MAX_GROUP = 3;
const STALE_HOURS = 12;

const now = () => new Date().toISOString();
const loadIngest = () => JSON.parse(readFileSync(INGEST_PATH, "utf8")) as IngestOutput;

// ---------------- init ----------------

/** Proportional interleave of the two languages, each in ingest (catalog) order. Deterministic. */
function globalOrder(shiurim: Shiur[]): Shiur[] {
  const by = { yi: shiurim.filter((s) => s.lang === "yi"), en: shiurim.filter((s) => s.lang === "en") };
  const keyed = (["yi", "en"] as const).flatMap((lang) =>
    by[lang].map((s, i) => ({ s, key: (i + 0.5) / by[lang].length, tie: lang === "yi" ? 0 : 1 })),
  );
  keyed.sort((a, b) => a.key - b.key || a.tie - b.tie);
  return keyed.map((k) => k.s);
}

function freshEntry(s: Shiur, order: number, durationSec: number): ManifestEntry {
  return {
    shiurId: s.id,
    lang: s.lang,
    durationSec: Math.round(durationSec),
    order,
    status: "pending",
    attempts: 0,
    promptVersion: null,
    model: null,
    validator: null,
    batch: null,
    group: null,
    startedAt: null,
    updatedAt: now(),
    note: null,
  };
}

function cmdInit(reset: boolean): void {
  const ingest = loadIngest();
  const inScope = ingest.shiurim.filter((s) => s.inScope);
  const ordered = globalOrder(inScope);
  const old = !reset && existsSync(MANIFEST_PATH) ? loadManifest() : null;
  const oldById = new Map(old?.entries.map((e) => [e.shiurId, e]) ?? []);
  const entries = ordered.map((s, order) => {
    const prev = oldById.get(s.id);
    const fresh = freshEntry(s, order, ingestDurationSec(s, ingest));
    return prev ? { ...prev, order, lang: s.lang, durationSec: fresh.durationSec } : fresh;
  });
  const dropped = [...oldById.keys()].filter((id) => !inScope.some((s) => s.id === id));
  saveManifest({ version: 1, updatedAt: now(), entries });
  console.log(`${MANIFEST_PATH}: ${entries.length} in-scope shiurim (${reset ? "reset to pending" : `${oldById.size} kept`})`);
  if (dropped.length) console.log(`  dropped (no longer in scope): ${dropped.join(", ")}`);
  printStatus(loadManifest());
}

// ---------------- next ----------------

function readTemplate(): string {
  const text = readFileSync(RUN_PROMPT, "utf8");
  const m = text.match(/<!-- AGENT PROMPT TEMPLATE START -->\s*```text\n([\s\S]*?)```\s*<!-- AGENT PROMPT TEMPLATE END -->/);
  if (!m?.[1]) throw new Error(`${RUN_PROMPT}: agent prompt template block not found`);
  const tpl = m[1].trimEnd();
  const runbook = existsSync(RUNBOOK) ? readFileSync(RUNBOOK, "utf8") : "";
  if (!runbook.includes(tpl)) console.error(`WARN ${RUNBOOK} does not contain the current agent prompt template from ${RUN_PROMPT}; update it.`);
  return tpl;
}

function fillTemplate(tpl: string, ids: string[]): string {
  return tpl
    .replaceAll("{{REPO}}", resolve("."))
    .replaceAll("{{COUNT}}", String(ids.length))
    .replaceAll("{{SHIUR_IDS}}", ids.map((id) => `\`${id}\``).join(", "));
}

interface Group {
  n: number;
  entries: ManifestEntry[];
}

/** Long shiurim alone; shiurim under 15 minutes grouped up to 3 per agent, same language, in pick order. */
function makeGroups(picked: ManifestEntry[]): Group[] {
  const groups: Group[] = [];
  const open: Partial<Record<"yi" | "en", Group>> = {};
  for (const e of picked) {
    if (e.durationSec >= SHORT_SEC) {
      groups.push({ n: groups.length + 1, entries: [e] });
      continue;
    }
    let g = open[e.lang];
    if (!g || g.entries.length >= MAX_GROUP) {
      g = { n: groups.length + 1, entries: [] };
      groups.push(g);
      open[e.lang] = g;
    }
    g.entries.push(e);
  }
  return groups;
}

function cmdNext(n: number, allowInProgress: boolean): void {
  if (!Number.isInteger(n) || n < 1) throw new Error("usage: npm run batch:next -- <N>");
  checkPromptHeaders();
  const tpl = readTemplate();
  const m = loadManifest();
  const inProgress = m.entries.filter((e) => e.status === "in_progress");
  if (inProgress.length && !allowInProgress) {
    console.error(
      `${inProgress.length} shiurim are already in_progress (${inProgress.slice(0, 5).map((e) => e.shiurId).join(", ")}${inProgress.length > 5 ? ", ..." : ""}).\n` +
        `Run npm run batch:finalize first (or batch:reset-stale if their agents are gone). Use --allow-in-progress to override.`,
    );
    process.exit(1);
  }
  const ingest = loadIngest();
  const byId = new Map(ingest.shiurim.map((s) => [s.id, s]));
  const picked = m.entries.filter((e) => e.status === "pending").slice(0, n);
  if (!picked.length) {
    console.log("No pending shiurim. Nothing to do.");
    return;
  }
  const batchId = now().replace(/[:.]/g, "").slice(0, 17) + "Z";
  const prepared: ManifestEntry[] = [];
  for (const e of picked) {
    const s = byId.get(e.shiurId);
    try {
      if (!s) throw new Error("not in ingest");
      prepareShiur(s, ingest, SHIURIM_DIR, (msg) => console.error(msg));
      prepared.push(e);
    } catch (err) {
      e.status = "failed";
      e.note = `prepare: ${(err as Error).message}`;
      e.updatedAt = now();
      console.error(`ERROR ${e.shiurId}: ${e.note} -> failed`);
    }
  }
  const groups = makeGroups(prepared);
  for (const g of groups) {
    for (const e of g.entries) {
      e.status = "in_progress";
      e.batch = batchId;
      e.group = g.n;
      e.startedAt = now();
      e.updatedAt = e.startedAt;
    }
  }
  saveManifest(m);

  const audio = prepared.reduce((a, e) => a + e.durationSec, 0);
  console.log(`BATCH ${batchId}: ${prepared.length} shiurim, ${groups.length} agent groups, ${(audio / 3600).toFixed(1)} h audio (marked in_progress)`);
  for (const g of groups) {
    console.log(`GROUP ${g.n}: ${g.entries.map((e) => `${e.shiurId} (${e.lang}, ${mmss(e.durationSec)}${e.attempts ? `, attempt ${e.attempts + 1}` : ""})`).join("  ")}`);
  }
  for (const g of groups) {
    console.log(`\n----- AGENT PROMPT, GROUP ${g.n} (model: ${MODEL}, description: "shiur ${g.entries.map((e) => e.shiurId).join(" ")}") -----`);
    console.log(fillTemplate(tpl, g.entries.map((e) => e.shiurId)));
    console.log(`----- END GROUP ${g.n} -----`);
  }
}

// ---------------- finalize ----------------

interface Verdict {
  ok: boolean;
  summary: ValidatorSummary;
  promptVersion: { p4: string | null; p4b: string | null };
  model: string | null;
}

function judge(shiurId: string): Verdict {
  const dir = join(SHIURIM_DIR, shiurId);
  const xFile = join(dir, "extraction.json");
  const wFile = join(dir, "writeup.json");
  const summary: ValidatorSummary = { extraction: null, writeup: null, firstErrors: [] };
  const pv = { p4: null as string | null, p4b: null as string | null };
  let model: string | null = null;
  const problems: string[] = [];

  if (existsSync(xFile)) {
    const r = validateFile(xFile);
    summary.extraction = { errors: r.errors.length, warnings: r.warnings.length };
    problems.push(...r.errors.map((e) => `extraction: ${e}`));
    if (r.kind === "extraction" && !r.errors.length) {
      const x = JSON.parse(readFileSync(xFile, "utf8")) as Extraction;
      pv.p4 = x.promptVersion ?? null;
      model = x.model;
      summary.sections = x.sections.length;
      summary.sources = x.sources.length;
      if (x.promptVersion !== PROMPT_VERSIONS.p4) problems.push(`extraction: promptVersion ${x.promptVersion ?? "missing"} != ${PROMPT_VERSIONS.p4}`);
      if (x.model !== MODEL) problems.push(`extraction: model "${x.model}" != "${MODEL}"`);
    }
  } else problems.push("extraction.json missing");

  if (existsSync(wFile)) {
    const r = validateFile(wFile);
    summary.writeup = { errors: r.errors.length, warnings: r.warnings.length };
    problems.push(...r.errors.map((e) => `writeup: ${e}`));
    if (r.kind === "writeup" && !r.errors.length) {
      const w = JSON.parse(readFileSync(wFile, "utf8")) as Writeup;
      pv.p4b = w.promptVersion ?? null;
      summary.budget = Number(r.stats.budget);
      summary.wordsEn = Number(r.stats.wordsEn);
      summary.wordsYi = Number(r.stats.wordsYi);
      if (w.promptVersion !== PROMPT_VERSIONS.p4b) problems.push(`writeup: promptVersion ${w.promptVersion ?? "missing"} != ${PROMPT_VERSIONS.p4b}`);
      if (w.model !== MODEL) problems.push(`writeup: model "${w.model}" != "${MODEL}"`);
      if (w.extractionVariant !== "extraction") problems.push(`writeup: extractionVariant "${w.extractionVariant}" != "extraction"`);
    }
  } else problems.push("writeup.json missing");

  summary.firstErrors = problems.slice(0, 3);
  return { ok: problems.length === 0, summary, promptVersion: pv, model };
}

function cmdFinalize(): void {
  checkPromptHeaders();
  const m = loadManifest();
  const todo = m.entries.filter((e) => e.status === "in_progress");
  if (!todo.length) {
    console.log("No in_progress shiurim.");
    printStatus(m);
    return;
  }
  const res = { done: [] as string[], pending: [] as string[], failed: [] as string[] };
  for (const e of todo) {
    const v = judge(e.shiurId);
    e.validator = v.summary;
    e.promptVersion = v.promptVersion;
    e.model = v.model;
    e.updatedAt = now();
    if (v.ok) {
      e.status = "done";
      e.note = null;
      res.done.push(e.shiurId);
    } else {
      e.attempts += 1;
      e.status = e.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      e.note = v.summary.firstErrors[0] ?? "failed validation";
      (e.status === "failed" ? res.failed : res.pending).push(e.shiurId);
    }
    const w = v.summary;
    console.log(
      `${e.status.padEnd(8)} ${e.shiurId}  ext ${w.extraction ? `${w.extraction.errors}E/${w.extraction.warnings}W` : "missing"}  ` +
        `wu ${w.writeup ? `${w.writeup.errors}E/${w.writeup.warnings}W` : "missing"}` +
        (w.wordsEn ? `  words en ${w.wordsEn} yi ${w.wordsYi} (budget ${w.budget})` : "") +
        (v.ok ? "" : `  | ${w.firstErrors[0] ?? ""}`),
    );
  }
  saveManifest(m);
  console.log(`\nFINALIZE: ${res.done.length} done, ${res.pending.length} back to pending, ${res.failed.length} failed (of ${todo.length})`);
  printStatus(m);
}

// ---------------- status / stale / mark ----------------

function printStatus(m: Manifest): void {
  const count = (pred: (e: ManifestEntry) => boolean) => m.entries.filter(pred).length;
  const hours = (pred: (e: ManifestEntry) => boolean) =>
    (m.entries.filter(pred).reduce((a, e) => a + e.durationSec, 0) / 3600).toFixed(1);
  console.log(`\nSTATUS (${m.entries.length} shiurim, ${hours(() => true)} h)`);
  for (const st of STATUSES) {
    const p = (e: ManifestEntry) => e.status === st;
    console.log(
      `  ${st.padEnd(12)} ${String(count(p)).padStart(4)}  (yi ${String(count((e) => p(e) && e.lang === "yi")).padStart(3)}, en ${String(count((e) => p(e) && e.lang === "en")).padStart(3)})  ${hours(p).padStart(6)} h`,
    );
  }
  const retried = count((e) => e.attempts > 0 && e.status !== "failed");
  if (retried) console.log(`  with failed attempts (not yet failed): ${retried}`);
  const failed = m.entries.filter((e) => e.status === "failed");
  if (failed.length) {
    console.log(`  failed:`);
    for (const e of failed.slice(0, 20)) console.log(`    ${e.shiurId}: ${e.note ?? ""}`);
    if (failed.length > 20) console.log(`    ... ${failed.length - 20} more`);
  }
}

function cmdResetStale(hours: number): void {
  const m = loadManifest();
  const cutoff = Date.now() - hours * 3600_000;
  const stale = m.entries.filter((e) => e.status === "in_progress" && Date.parse(e.startedAt ?? e.updatedAt) < cutoff);
  for (const e of stale) {
    e.status = "pending";
    e.note = `stale in_progress since ${e.startedAt ?? e.updatedAt}, reset`;
    e.updatedAt = now();
  }
  if (stale.length) saveManifest(m);
  console.log(`reset-stale: ${stale.length} in_progress older than ${hours} h -> pending${stale.length ? `: ${stale.map((e) => e.shiurId).join(", ")}` : ""}`);
}

function cmdMark(id: string | undefined, status: string | undefined, note: string | undefined): void {
  if (!id || !status || !STATUSES.includes(status as Status)) throw new Error(`usage: npm run batch:mark -- <shiurId> <${STATUSES.join("|")}> [note]`);
  const m = loadManifest();
  const e = m.entries.find((x) => x.shiurId === id);
  if (!e) throw new Error(`${id} not in manifest`);
  e.status = status as Status;
  if (status === "pending") e.attempts = 0;
  e.note = note ?? e.note;
  e.updatedAt = now();
  saveManifest(m);
  console.log(`${id} -> ${status}${note ? ` (${note})` : ""}`);
}

function cmdPickAudit(): void {
  const m = loadManifest();
  const audited = new Set(existsSync(AUDITS_DIR) ? readdirSync(AUDITS_DIR).map((f) => f.replace(/\.json$/, "")) : []);
  const pool = m.entries.filter((e) => e.status === "done" && !audited.has(e.shiurId));
  if (!pool.length) return void console.log("No unaudited done shiurim.");
  const e = pool[randomInt(pool.length)]!;
  console.log(e.shiurId);
}

const USAGE_HEADER = "date\tbatch\tpass\tgroup\tshiurIds\tmodel\ttokens\ttool_uses\tduration_ms\tresult";

function cmdUsage(pass: string | undefined, target: string | undefined, nums: string[], result: string, batchOpt: string | undefined): void {
  const [tokens, toolUses, durationMs] = nums.map(Number);
  if ((pass !== "run" && pass !== "audit") || !target || ![tokens, toolUses, durationMs].every((n) => Number.isFinite(n))) {
    throw new Error(
      "usage: npm run batch:usage -- run <group> <tokens> <toolUses> <durationMs> <result> [--batch id]\n" +
        "       npm run batch:usage -- audit <shiurId> <tokens> <toolUses> <durationMs> <severity>",
    );
  }
  const m = loadManifest();
  let batch = batchOpt ?? m.entries.reduce((a, e) => (e.batch && e.batch > a ? e.batch : a), "");
  let group = "";
  let ids: string[];
  if (pass === "run") {
    group = target;
    ids = m.entries.filter((e) => e.batch === batch && String(e.group) === group).map((e) => e.shiurId);
    if (!ids.length) throw new Error(`no shiurim in batch ${batch} group ${group}`);
  } else {
    ids = [target];
    batch = batchOpt ?? batch;
  }
  if (!existsSync(USAGE_PATH)) appendFileSync(USAGE_PATH, USAGE_HEADER + "\n");
  const row = [now(), batch, pass, group, ids.join(","), MODEL, tokens, toolUses, durationMs, result.replace(/\s+/g, " ") || "-"];
  appendFileSync(USAGE_PATH, row.join("\t") + "\n");
  console.log(`${USAGE_PATH}: ${row.join(" | ")}`);
}

// ---------------- main ----------------

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  const flag = (f: string) => rest.includes(f);
  const opt = (f: string) => {
    const i = rest.indexOf(f);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const positional = rest.filter((a, i) => !a.startsWith("--") && !(i > 0 && rest[i - 1] === "--hours"));
  switch (cmd) {
    case "init":
      return cmdInit(flag("--reset"));
    case "next":
      return cmdNext(Number(positional[0]), flag("--allow-in-progress"));
    case "finalize":
      return cmdFinalize();
    case "status":
      return printStatus(loadManifest());
    case "reset-stale":
      return cmdResetStale(Number(opt("--hours") ?? STALE_HOURS));
    case "mark":
      return cmdMark(positional[0], positional[1], positional.slice(2).join(" ") || undefined);
    case "pick-audit":
      return cmdPickAudit();
    case "usage": {
      const pos = rest.filter((a, i) => !a.startsWith("--") && !(i > 0 && rest[i - 1] === "--batch"));
      return cmdUsage(pos[0], pos[1], pos.slice(2, 5), pos.slice(5).join(" "), opt("--batch"));
    }
    default:
      console.error("usage: tsx scripts/batch.ts <init|next|finalize|status|reset-stale|mark|pick-audit|usage> ...");
      process.exit(2);
  }
}

try {
  main();
} catch (e) {
  console.error(`ERROR ${(e as Error).message}`);
  process.exit(1);
}
