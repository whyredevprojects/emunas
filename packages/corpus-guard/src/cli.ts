#!/usr/bin/env node
/**
 * guard pre     --corpus .corpus --transcripts data/transcripts --out .corpus/suppress.json
 *               [--site-policy site-policy] [--report-at 12] [--suppress-at 20]
 * guard post    --scan <dirs/files...> [--corpus .corpus] [--transcripts data/transcripts]
 *               [--corpus-data data/derived/corpus | --no-aliases]
 *               [--site-policy site-policy] [--report <file>] [--report-at 12] [--suppress-at 20]
 * guard budgets <roots...> [--max-files 18000] [--max-file-bytes 26214400]
 *
 * Relative paths resolve against the directory npm was started from (INIT_CWD), so
 * `npm run guard --workspace=@emunas/corpus-guard -- pre --corpus .corpus ...` works from the repo root.
 * Output names ids, fields, files and numbers only.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CORPUS_DATA_DIR } from "./aliases.ts";
import { checkBudgets, formatBytes } from "./budgets.ts";
import { createLeakScanner } from "./index.ts";
import { readVerbatimAllow } from "./policy.ts";
import type { Finding } from "./post.ts";
import { runPrePass } from "./pre.ts";
import { DEFAULT_TRANSCRIPTS_DIR } from "./transcripts.ts";
import { DEFAULT_THRESHOLDS, type Thresholds } from "./verbatim.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CWD = process.env.INIT_CWD ?? process.cwd();

export interface ParsedArgs {
  command: string;
  flags: Map<string, string[]>;
  positional: string[];
}

const MULTI = new Set(["scan"]);
const BOOLEAN = new Set(["no-verbatim", "no-aliases", "help"]);

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command = "help", ...rest] = argv;
  const flags = new Map<string, string[]>();
  const positional: string[] = [];
  let current: string | null = null;
  for (const a of rest) {
    if (a.startsWith("--")) {
      const [name, inline] = a.slice(2).split("=", 2) as [string, string | undefined];
      if (!flags.has(name)) flags.set(name, []);
      if (inline !== undefined) {
        flags.get(name)!.push(inline);
        current = null;
      } else {
        current = BOOLEAN.has(name) ? null : name;
      }
      continue;
    }
    if (current !== null) {
      flags.get(current)!.push(a);
      if (!MULTI.has(current)) current = null;
    } else {
      positional.push(a);
    }
  }
  return { command, flags, positional };
}

function one(args: ParsedArgs, name: string): string | undefined {
  return args.flags.get(name)?.[0];
}

function path(p: string): string {
  return isAbsolute(p) ? p : resolve(CWD, p);
}

function intFlag(args: ParsedArgs, name: string, fallback: number): number {
  const v = one(args, name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--${name} must be a positive integer`);
  return n;
}

function thresholds(args: ParsedArgs): Thresholds {
  return {
    report: intFlag(args, "report-at", DEFAULT_THRESHOLDS.report),
    suppress: intFlag(args, "suppress-at", DEFAULT_THRESHOLDS.suppress),
  };
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function describe(f: Finding): string {
  switch (f.kind) {
    case "key":
      return `forbidden key "${f.key}" ×${f.count}${f.field ? ` at ${f.field}` : ""} in ${f.source}`;
    case "substring":
      return `forbidden substring "${f.substring}" ×${f.count} in ${f.source}`;
    case "transcript-file":
      return `transcript file not accepted for recording ${f.recordingId} (${f.reason}): ${f.source}`;
    case "verbatim":
      return `verbatim run of ${f.runLength} tokens in ${f.source}${f.itemId ? ` item ${f.itemId}` : ""}${f.field ? ` field ${f.field}` : ""}`;
    case "meta-comment":
      return `remark on the audio or transcript "${f.term}" ×${f.count}${f.field ? ` at ${f.field}` : ""} in ${f.source}: ${f.context}`;
    case "unreadable":
      return `unreadable file ${f.source} (${f.reason})`;
    case "alias":
      return `alias ${f.rule === "asr-variant" ? "is an ASR variant" : f.rule === "unknown-entity" ? "names an unknown entity" : "is not a display field"} ×${f.count}${f.entity ? ` of ${f.entity}` : ""} at ${f.field} in ${f.source}`;
  }
}

function pre(args: ParsedArgs, log: (s: string) => void): number {
  const corpus = path(one(args, "corpus") ?? ".corpus");
  const transcripts = one(args, "transcripts") ? path(one(args, "transcripts")!) : resolve(REPO_ROOT, DEFAULT_TRANSCRIPTS_DIR);
  const out = path(one(args, "out") ?? `${corpus}/suppress.json`);
  const siteDir = one(args, "site-policy") ? path(one(args, "site-policy")!) : resolve(REPO_ROOT, "site-policy");
  if (!existsSync(transcripts)) throw new Error(`transcripts folder not found: ${transcripts}`);
  const t0 = performance.now();
  const result = runPrePass(corpus, { transcriptsDir: transcripts, allow: readVerbatimAllow(siteDir), thresholds: thresholds(args) });
  const secs = (performance.now() - t0) / 1000;
  writeJson(out, result);
  const c = result.counts;
  log(`guard pre: ${c.shiurim} shiurim (${c.shiurimScanned} with transcripts, ${c.shiurimWithoutTranscript} without), ${c.items} text items, ${c.tokensScanned} tokens`);
  log(`guard pre: corpus layer ${c.corpusUnits} text units (${c.corpusUnitsScanned} compared with ${c.corpusComparisons} member transcripts, ${c.corpusUnitsUnchecked} without a member transcript), reported ${c.corpusReported}, at or above the suppress threshold ${c.corpusSuppressed}, unreadable layer files ${c.corpusUnreadableFiles}`);
  log(`guard pre: reported (≥${result.thresholds.report}) ${c.reported}, suppressed (≥${result.thresholds.suppress}) ${c.suppressed}, allow-listed ${c.allowed}, missing recordings ${c.recordingsMissing}, unreadable files ${c.unreadableFiles}`);
  for (const s of result.suppress) log(`  suppress ${s.id} (${s.runLength} tokens; ${s.fields.join(", ")})`);
  log(`guard pre: wrote ${out} in ${secs.toFixed(1)} s`);
  return 0;
}

function post(args: ParsedArgs, log: (s: string) => void): number {
  const scan = [...(args.flags.get("scan") ?? []), ...args.positional].map(path);
  if (scan.length === 0) throw new Error("post: nothing to scan (use --scan <dirs/files...>)");
  const siteDir = one(args, "site-policy") ? path(one(args, "site-policy")!) : resolve(REPO_ROOT, "site-policy");
  const noVerbatim = args.flags.has("no-verbatim");
  const transcriptsFlag = one(args, "transcripts");
  const transcripts = noVerbatim ? null : transcriptsFlag ? path(transcriptsFlag) : resolve(REPO_ROOT, DEFAULT_TRANSCRIPTS_DIR);
  if (transcripts && !existsSync(transcripts)) throw new Error(`transcripts folder not found: ${transcripts} (or pass --no-verbatim)`);
  const corpusFlag = one(args, "corpus");
  const corpus = corpusFlag ? path(corpusFlag) : null;
  const dataFlag = one(args, "corpus-data");
  if (dataFlag && args.flags.has("no-aliases")) throw new Error("post: --corpus-data and --no-aliases exclude each other");
  const defaultData = resolve(REPO_ROOT, DEFAULT_CORPUS_DATA_DIR);
  // An explicit folder must exist (AliasRules.read throws); the default is used when present.
  const corpusData = args.flags.has("no-aliases") ? null : dataFlag ? path(dataFlag) : existsSync(defaultData) ? defaultData : null;
  const t0 = performance.now();
  const scanner = createLeakScanner({
    corpusDir: corpus,
    corpusDataDir: corpusData,
    transcriptsDir: transcripts,
    siteDir,
    env: process.env,
    thresholds: thresholds(args),
    baseDir: CWD,
  });
  for (const p of scan) if (!existsSync(p)) throw new Error(`post: not found: ${p}`);
  scanner.scanPaths(scan);
  const result = scanner.result();
  const secs = (performance.now() - t0) / 1000;
  const report = one(args, "report");
  if (report) writeJson(path(report), result);
  const c = result.counts;
  log(`guard post: ${c.files} files (${c.filesScanned} scanned, ${c.filesSkippedBinary} binary skipped, ${c.transcriptFilesAllowed} eligible transcript files), ${c.textUnits} text units`);
  if (result.verbatimChecked) {
    log(`guard post: verbatim units mapped to a shiur ${c.unitsMappedToShiur}, checked against all transcripts ${c.unitsCheckedAgainstCorpus}, reported ${c.verbatimReported}`);
  } else {
    log("guard post: verbatim scan DISABLED (--no-verbatim)");
  }
  log(`guard post: corpus-layer text units compared with their member shiurim ${c.corpusUnits}`);
  log(`guard post: published strings checked for remarks on the audio or transcript ${c.metaCommentUnits} (allow-listed hits ${c.metaCommentAllowed})`);
  if (result.aliasesChecked) log(`guard post: alias terms checked (raw ban + display fields) ${c.aliasTermsChecked}; story names checked ${c.storyNamesChecked}; other names checked ${c.namesChecked}`);
  else log(`guard post: alias checks DISABLED (${args.flags.has("no-aliases") ? "--no-aliases" : `no corpus data at ${defaultData}`})`);
  for (const f of result.findings) log(`  FAIL ${describe(f)}`);
  log(`guard post: ${result.findings.length} finding(s) in ${secs.toFixed(1)} s${report ? `; report ${report}` : ""}`);
  return result.findings.length > 0 ? 1 : 0;
}

function budgets(args: ParsedArgs, log: (s: string) => void): number {
  const roots = [...args.positional, ...(args.flags.get("scan") ?? [])].map(path);
  if (roots.length === 0) throw new Error("budgets: give at least one deploy root");
  const limits = { maxFiles: intFlag(args, "max-files", 18_000), maxFileBytes: intFlag(args, "max-file-bytes", 25 * 1024 * 1024) };
  let failed = 0;
  for (const root of roots) {
    const r = checkBudgets(root, limits);
    log(`guard budgets: ${root}: ${r.files} files, ${formatBytes(r.totalBytes)}, largest ${r.largest ? `${r.largest.file} ${formatBytes(r.largest.bytes)}` : "-"}`);
    for (const f of r.findings) {
      failed++;
      log(
        f.kind === "file-count"
          ? `  FAIL ${f.files} files > ${f.limit}`
          : `  FAIL ${f.file} is ${formatBytes(f.bytes)} > ${formatBytes(f.limit)}`,
      );
    }
  }
  return failed > 0 ? 1 : 0;
}

const USAGE = `usage:
  guard pre --corpus .corpus --transcripts <dir> --out .corpus/suppress.json [--site-policy dir]
  guard post --scan <dirs/files...> [--corpus .corpus] [--transcripts <dir> | --no-verbatim]
             [--corpus-data <dir> | --no-aliases] [--report file]
  guard budgets <roots...> [--max-files n] [--max-file-bytes n]`;

export function main(argv: readonly string[], log: (s: string) => void = console.log): number {
  const args = parseArgs(argv);
  try {
    switch (args.command) {
      case "pre":
        return pre(args, log);
      case "post":
        return post(args, log);
      case "budgets":
        return budgets(args, log);
      default:
        log(USAGE);
        return args.command === "help" || args.command === "--help" ? 0 : 2;
    }
  } catch (e) {
    log(`guard ${args.command}: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
