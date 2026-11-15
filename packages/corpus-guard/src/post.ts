/**
 * Guard post-pass (integration-plan §4 step 5): scan built output for forbidden keys,
 * forbidden substrings, unapproved transcript files and verbatim transcript runs.
 * Any finding fails the deploy. Findings and reports carry file paths, ids, field paths,
 * key names, counts and run lengths, never transcript or shipped text.
 */
import { readFileSync, statSync } from "node:fs";
import { basename, extname, relative, sep } from "node:path";
import { walkFiles } from "./budgets.ts";
import { decodeJsEscapes, htmlProse } from "./extract.ts";
import { collectShiurItems, fieldOf } from "./items.ts";
import { findKeysInText, findSubstrings, isForbiddenKey } from "./rules.ts";
import type { VerbatimMatcher } from "./verbatim.ts";

export type Finding =
  | { kind: "key"; source: string; key: string; field?: string; count: number }
  | { kind: "substring"; source: string; substring: string; count: number }
  | { kind: "transcript-file"; source: string; recordingId: string }
  | { kind: "verbatim"; source: string; itemId?: string; shiurId?: string; field?: string; runLength: number }
  | { kind: "unreadable"; source: string; reason: string };

export interface VerbatimReportEntry {
  source: string;
  itemId?: string;
  shiurId?: string;
  field?: string;
  runLength: number;
  runs: number;
  allowed: boolean;
  failing: boolean;
}

export interface PostCounts {
  files: number;
  filesScanned: number;
  filesSkippedBinary: number;
  transcriptFilesAllowed: number;
  textUnits: number;
  unitsMappedToShiur: number;
  unitsCheckedAgainstCorpus: number;
  verbatimReported: number;
  findings: number;
}

export interface PostResult {
  version: 1;
  generatedBy: "@emunas/corpus-guard post";
  verbatimChecked: boolean;
  counts: PostCounts;
  findings: Finding[];
  verbatim: VerbatimReportEntry[];
}

export interface ScannerOptions {
  /** Verbatim matcher; without it only keys, substrings and transcript files are checked. */
  matcher?: VerbatimMatcher | null;
  /** Item ids a person accepted (verbatim-allow.json + publish-policy allowVerbatim). */
  allow?: ReadonlySet<string>;
  /** Recording ids whose `/transcript/<id>.json` may ship (eligibility + EMUNAS_TRANSCRIPT_VIEW=on). */
  eligibleTranscripts?: ReadonlySet<string>;
  /** Paths in findings are shown relative to this directory. */
  baseDir?: string;
}

const JSON_EXT = new Set([".json", ".map", ".webmanifest"]);
const NDJSON_EXT = new Set([".ndjson", ".jsonl"]);
const HTML_EXT = new Set([".html", ".htm"]);
const JS_EXT = new Set([".js", ".mjs", ".cjs"]);
const OTHER_TEXT_EXT = new Set([".txt", ".xml", ".svg", ".md", ".css", ".toml", ".csv", ".tsv", ".yaml", ".yml", ""]);
/** Text extensions whose prose is worth a verbatim scan (CSS is not). */
const PROSE_TEXT_EXT = new Set([".txt", ".xml", ".svg", ".md", ".csv", ".tsv", ".yaml", ".yml", ""]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `.../transcript/<recordingId>.json` → recordingId. */
export function transcriptFileId(path: string): string | null {
  const parts = path.split(/[\\/]/);
  const file = parts.at(-1) ?? "";
  if (parts.at(-2) !== "transcript" || !file.endsWith(".json")) return null;
  return file.slice(0, -".json".length);
}

export class LeakScanner {
  readonly findings: Finding[] = [];
  readonly verbatim: VerbatimReportEntry[] = [];
  readonly counts: PostCounts = {
    files: 0,
    filesScanned: 0,
    filesSkippedBinary: 0,
    transcriptFilesAllowed: 0,
    textUnits: 0,
    unitsMappedToShiur: 0,
    unitsCheckedAgainstCorpus: 0,
    verbatimReported: 0,
    findings: 0,
  };
  private readonly matcher: VerbatimMatcher | null;
  private readonly allow: ReadonlySet<string>;
  private readonly eligible: ReadonlySet<string>;
  private readonly baseDir: string;

  constructor(opts: ScannerOptions = {}) {
    this.matcher = opts.matcher ?? null;
    this.allow = opts.allow ?? new Set();
    this.eligible = opts.eligibleTranscripts ?? new Set();
    this.baseDir = opts.baseDir ?? process.cwd();
  }

  private add(f: Finding): void {
    this.findings.push(f);
    this.counts.findings++;
  }

  /** Known shiur id named by `value` (`<sid>` or `<sid>~<moment>`), else null. */
  private shiurOf(value: unknown): string | null {
    if (typeof value !== "string" || !this.matcher) return null;
    const sid = value.split("~")[0] ?? "";
    return this.matcher.knowsShiur(sid) ? sid : null;
  }

  /** Shiur named by a path segment (`dist/en/shiur/<id>/index.html`, `shiurim/<id>.json`). */
  shiurFromPath(path: string): string | null {
    if (!this.matcher) return null;
    const parts = path.split(/[\\/]/);
    for (let i = parts.length - 1; i >= 0; i--) {
      const seg = parts[i]!;
      const stem = seg.replace(/\.[a-z0-9]+$/i, "");
      for (const cand of [seg, stem]) if (this.matcher.knowsShiur(cand)) return cand;
    }
    return null;
  }

  // ---- verbatim -------------------------------------------------------------

  private checkUnit(text: string, source: string, ctx: { shiurId: string | null; itemId?: string; field?: string }): void {
    if (!this.matcher) return;
    this.counts.textUnits++;
    // Cheap pre-filter: fewer letters than the report threshold can't contain a run.
    if (text.length < this.matcher.thresholds.report) return;
    if (ctx.shiurId !== null) this.counts.unitsMappedToShiur++;
    else this.counts.unitsCheckedAgainstCorpus++;
    const r = this.matcher.scan(text, ctx.shiurId);
    if (r.maxRun < this.matcher.thresholds.report) return;
    const allowedById = ctx.itemId !== undefined && this.allow.has(ctx.itemId);
    const failing = !allowedById && r.maxUnallowedRun >= this.matcher.thresholds.suppress;
    const entry: VerbatimReportEntry = {
      source,
      runLength: r.maxRun,
      runs: r.runs,
      allowed: r.maxRun >= this.matcher.thresholds.suppress && !failing,
      failing,
    };
    if (ctx.itemId !== undefined) entry.itemId = ctx.itemId;
    if (ctx.shiurId !== null) entry.shiurId = ctx.shiurId;
    if (ctx.field !== undefined) entry.field = ctx.field;
    this.verbatim.push(entry);
    this.counts.verbatimReported++;
    if (failing) {
      const f: Finding = { kind: "verbatim", source, runLength: r.maxUnallowedRun };
      if (ctx.itemId !== undefined) f.itemId = ctx.itemId;
      if (ctx.shiurId !== null) f.shiurId = ctx.shiurId;
      if (ctx.field !== undefined) f.field = ctx.field;
      this.add(f);
    }
  }

  // ---- structured values -----------------------------------------------------

  /**
   * Scan a parsed JSON value (a file, an NDJSON line, a Pagefind record, Vectorize metadata).
   * Keys are checked structurally; strings are checked for substrings and verbatim runs,
   * mapped to a shiur by the nearest enclosing `shiurId`/`id`, else by `pathHint`.
   */
  scanValue(value: unknown, source: string, pathHint: string | null = null): void {
    const keyCounts = new Map<string, { count: number; field: string }>();
    const subCounts = new Map<string, number>();
    const fallbackShiur = pathHint;

    // A whole PublicShiur: use the shared item-id scheme so allow-listed ids line up with the pre-pass.
    if (isRecord(value) && Array.isArray(value.recordings) && this.shiurOf(value.id) === value.id) {
      const units = collectShiurItems(value, { skipTopLevel: [] });
      if (units) {
        for (const item of units.items) {
          for (const [s, n] of findSubstrings(item.text)) subCounts.set(s, (subCounts.get(s) ?? 0) + n);
          this.checkUnit(item.text, source, { shiurId: units.shiurId, itemId: item.id, field: item.field });
        }
        this.walkKeys(value, [], keyCounts);
        this.flush(source, keyCounts, subCounts);
        return;
      }
    }

    const walk = (node: unknown, path: (string | number)[], shiur: string | null, itemId: string | undefined): void => {
      if (typeof node === "string") {
        for (const [s, n] of findSubstrings(node)) subCounts.set(s, (subCounts.get(s) ?? 0) + n);
        const ctx: { shiurId: string | null; itemId?: string; field?: string } = { shiurId: shiur, field: fieldOf(path) };
        if (itemId !== undefined) ctx.itemId = itemId;
        this.checkUnit(node, source, ctx);
        return;
      }
      if (Array.isArray(node)) {
        node.forEach((c, i) => walk(c, [...path, i], shiur, itemId));
        return;
      }
      if (!isRecord(node)) return;
      let s = shiur;
      let id = itemId;
      const named = this.shiurOf(node.shiurId) ?? this.shiurOf(node.id);
      if (named) s = named;
      if (typeof node.id === "string" && node.id.includes("~")) id = node.id;
      for (const [k, c] of Object.entries(node)) {
        if (isForbiddenKey(k)) {
          const prev = keyCounts.get(k);
          keyCounts.set(k, { count: (prev?.count ?? 0) + 1, field: prev?.field ?? fieldOf([...path, k]) });
        }
        walk(c, [...path, k], s, id);
      }
    };
    walk(value, [], fallbackShiur, undefined);
    this.flush(source, keyCounts, subCounts);
  }

  private walkKeys(node: unknown, path: (string | number)[], acc: Map<string, { count: number; field: string }>): void {
    if (Array.isArray(node)) node.forEach((c, i) => this.walkKeys(c, [...path, i], acc));
    else if (isRecord(node)) {
      for (const [k, c] of Object.entries(node)) {
        if (isForbiddenKey(k)) {
          const prev = acc.get(k);
          acc.set(k, { count: (prev?.count ?? 0) + 1, field: prev?.field ?? fieldOf([...path, k]) });
        }
        this.walkKeys(c, [...path, k], acc);
      }
    }
  }

  private flush(source: string, keys: Map<string, { count: number; field: string }>, subs: Map<string, number>): void {
    for (const [key, { count, field }] of keys) this.add({ kind: "key", source, key, field, count });
    for (const [substring, count] of subs) this.add({ kind: "substring", source, substring, count });
  }

  /** Scan free text (HTML text, a JS bundle): keys by pattern, substrings, one verbatim unit. */
  scanText(raw: string, source: string, prose: string | null, pathHint: string | null): void {
    const decoded = decodeJsEscapes(raw);
    const keys = new Map<string, number>();
    for (const variant of decoded === raw ? [raw] : [raw, decoded]) {
      for (const [k, n] of findKeysInText(variant)) keys.set(k, Math.max(keys.get(k) ?? 0, n));
    }
    const subs = new Map<string, number>();
    for (const variant of decoded === raw ? [raw] : [raw, decoded]) {
      for (const [s, n] of findSubstrings(variant)) subs.set(s, Math.max(subs.get(s) ?? 0, n));
    }
    if (prose !== null) {
      // HTML-entity-encoded payloads (island props) only show their keys once decoded.
      for (const [k, n] of findKeysInText(prose)) keys.set(k, Math.max(keys.get(k) ?? 0, n));
      for (const [s, n] of findSubstrings(prose)) subs.set(s, Math.max(subs.get(s) ?? 0, n));
    }
    for (const [key, count] of keys) this.add({ kind: "key", source, key, count });
    for (const [substring, count] of subs) this.add({ kind: "substring", source, substring, count });
    if (prose !== null) this.checkUnit(prose, source, { shiurId: pathHint });
  }

  // ---- files -----------------------------------------------------------------

  scanFile(file: string): void {
    this.counts.files++;
    const source = relative(this.baseDir, file).split(sep).join("/") || basename(file);
    const tid = transcriptFileId(file);
    if (tid !== null) {
      if (this.eligible.has(tid)) {
        this.counts.transcriptFilesAllowed++;
        return;
      }
      this.add({ kind: "transcript-file", source, recordingId: tid });
      return;
    }
    const ext = extname(file).toLowerCase();
    const isText =
      JSON_EXT.has(ext) || NDJSON_EXT.has(ext) || HTML_EXT.has(ext) || JS_EXT.has(ext) || OTHER_TEXT_EXT.has(ext);
    let raw: string;
    try {
      if (!isText) {
        // Unknown extension: scan only if it decodes as text (no NUL bytes).
        const buf = readFileSync(file);
        if (buf.includes(0)) {
          this.counts.filesSkippedBinary++;
          return;
        }
        raw = buf.toString("utf8");
      } else {
        raw = readFileSync(file, "utf8");
      }
    } catch (e) {
      this.add({ kind: "unreadable", source, reason: e instanceof Error ? e.name : "error" });
      return;
    }
    this.counts.filesScanned++;
    const hint = this.shiurFromPath(file);

    if (JSON_EXT.has(ext)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        this.scanText(raw, source, decodeJsEscapes(raw), hint);
        return;
      }
      this.scanValue(parsed, source, hint);
      return;
    }
    if (NDJSON_EXT.has(ext)) {
      raw.split("\n").forEach((line, i) => {
        if (line.trim() === "") return;
        const lineSource = `${source}:${i + 1}`;
        try {
          this.scanValue(JSON.parse(line), lineSource, hint);
        } catch {
          this.scanText(line, lineSource, decodeJsEscapes(line), hint);
        }
      });
      return;
    }
    if (HTML_EXT.has(ext)) {
      this.scanText(raw, source, htmlProse(raw), hint);
      return;
    }
    if (JS_EXT.has(ext)) {
      this.scanText(raw, source, decodeJsEscapes(raw), hint);
      return;
    }
    this.scanText(raw, source, PROSE_TEXT_EXT.has(ext) || !isText ? raw : null, hint);
  }

  /** Scan files and directories (recursively). */
  scanPaths(paths: readonly string[]): void {
    for (const p of paths) {
      const st = statSync(p);
      if (st.isDirectory()) for (const f of walkFiles(p)) this.scanFile(f);
      else this.scanFile(p);
    }
  }

  result(): PostResult {
    return {
      version: 1,
      generatedBy: "@emunas/corpus-guard post",
      verbatimChecked: this.matcher !== null,
      counts: { ...this.counts },
      findings: [...this.findings],
      verbatim: [...this.verbatim],
    };
  }
}
