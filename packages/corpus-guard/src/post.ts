/**
 * Guard post-pass (integration-plan §4 step 5): scan built output for forbidden keys,
 * forbidden substrings, unapproved transcript files, verbatim transcript runs and (corpus-wave-plan
 * §3.4) aliases that are ASR variants or not display fields of their entity.
 * Any finding fails the deploy. Findings and reports carry file paths, ids, field paths,
 * key names, counts and run lengths, never transcript or shipped text.
 *
 * Remarks on the audio or the transcript (meta-comment.ts) fail in built pages and published data;
 * those findings carry the listed term and a short folded excerpt of the published text around it.
 *
 * Corpus-layer text (`.corpus/layer/` stories, threads, topics, concepts, series) is compared with
 * the transcripts of its member shiurim, under its `corpus:` item id; those comparisons run when the
 * result is taken, grouped by shiur, so each shiur's index is built once.
 */
import { readFileSync, statSync } from "node:fs";
import { basename, extname, relative, sep } from "node:path";
import { walkFiles } from "./budgets.ts";
import { decodeHtmlEntities, decodeJsEscapes, htmlProse, htmlToText } from "./extract.ts";
import { collectShiurItems, fieldOf } from "./items.ts";
import {
  ALIAS_KEYS,
  aliasTerms,
  entityKindOfFile,
  isEntityKind,
  isShiurNamesFile,
  isStoryNamesFile,
  markedPersonNames,
  markedStoryNames,
  PAGEFIND_LABEL_KEYS,
  PAGEFIND_NAME_KEYS,
  PERSON_ATTR,
  STORY_PERSON_ATTR,
  type AliasRule,
  type AliasRules,
  type EntityKind,
} from "./aliases.ts";
import { layerFileOf, layerFileUnits, pathKey, type CorpusUnit } from "./layer.ts";
import { findKeysInText, findSubstrings, isForbiddenKey } from "./rules.ts";
import { NO_RUN, mergeScans, type ScanResult, type VerbatimMatcher } from "./verbatim.ts";
import { findMetaComments, isMetaCommentAllowed, type CompiledAllow } from "./meta-comment.ts";
import { NO_TRANSCRIPTS, checkTranscriptFile, type TranscriptEligibility, type TranscriptRejection } from "./eligible.ts";

export type Finding =
  | { kind: "key"; source: string; key: string; field?: string; count: number }
  | { kind: "substring"; source: string; substring: string; count: number }
  | { kind: "transcript-file"; source: string; recordingId: string; reason: TranscriptRejection | "unreadable" }
  | { kind: "verbatim"; source: string; itemId?: string; shiurId?: string; field?: string; runLength: number }
  /** An alias-bearing string that is an ASR variant or not a display field of its entity (`entity` = `kind:id`). */
  | { kind: "alias"; source: string; rule: AliasRule; entity?: string; field: string; count: number }
  /** Published text remarking on the audio or the transcript (`term` as listed in meta-comment.ts). */
  | { kind: "meta-comment"; source: string; term: string; field?: string; context: string; count: number }
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
  /** Corpus-layer text units compared with their member shiurim. */
  corpusUnits: number;
  /** Strings in alias-bearing positions checked against the display fields and ASR variants. */
  aliasTermsChecked: number;
  /** Person names on stories (story files and `data-story-person` on pages) checked against every entity's display names. */
  storyNamesChecked: number;
  /**
   * Other name fields (F.1): names in shiur files, search docs, Pagefind records and entity rows'
   * `labels`, and `data-person` names on pages, checked against the corpus entities' display names.
   */
  namesChecked: number;
  /** Published strings (data values, page text) checked for remarks on the audio or the transcript. */
  metaCommentUnits: number;
  /** Hits of a listed term passed by `site-policy/meta-comment-allow.json`. */
  metaCommentAllowed: number;
  findings: number;
}

export interface PostResult {
  version: 1;
  generatedBy: "@emunas/corpus-guard post";
  verbatimChecked: boolean;
  /** Whether the raw ban and the alias-key assertion ran (they need the corpus data folder). */
  aliasesChecked: boolean;
  counts: PostCounts;
  findings: Finding[];
  verbatim: VerbatimReportEntry[];
}

export interface ScannerOptions {
  /** Verbatim matcher; without it only keys, substrings and transcript files are checked. */
  matcher?: VerbatimMatcher | null;
  /** Item ids a person accepted (verbatim-allow.json + publish-policy allowVerbatim). */
  allow?: ReadonlySet<string>;
  /** Which `/transcript/<id>.json` files may ship (eligible.ts; default: none). */
  transcripts?: TranscriptEligibility;
  /** Paths in findings are shown relative to this directory. */
  baseDir?: string;
  /** Display-field sets and ASR variants; without them the alias checks are off. */
  aliases?: AliasRules | null;
  /** Extra alias-bearing JSON keys (e.g. a minified quick-index field) on top of ALIAS_KEYS. */
  aliasKeys?: readonly string[];
  /** Reviewed exceptions for the audio/transcript remark check (`site-policy/meta-comment-allow.json`). */
  metaCommentAllow?: readonly CompiledAllow[];
}

/** Context for scanning one parsed value. */
export interface ValueContext {
  /** File inside `.corpus/layer/` this value is (enables the corpus item ids and member attribution). */
  layerFile?: string | null;
  /** Entity kind of the records of this file (`layer/people.json` → person). */
  fileKind?: EntityKind | null;
  /** Entity the alias-bearing fields of this value belong to when the value itself does not say (Pagefind entity records). */
  entity?: { kind: EntityKind; id: string } | null;
  /**
   * A story file (`isStoryNamesFile`): `people[].name` is checked too, and every entity-less name
   * (there and in `names`) must be some corpus entity's display name (`AliasRules.checkName`).
   */
  storyNames?: boolean;
  /** A shiur file (`isShiurNamesFile`): every person and concept name in it is checked (F.1). */
  shiurNames?: boolean;
  /** A Pagefind record: its name-bearing meta/filter keys are checked (F.1). */
  pagefind?: boolean;
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
    corpusUnits: 0,
    aliasTermsChecked: 0,
    storyNamesChecked: 0,
    namesChecked: 0,
    metaCommentUnits: 0,
    metaCommentAllowed: 0,
    findings: 0,
  };
  private readonly matcher: VerbatimMatcher | null;
  private readonly aliases: AliasRules | null;
  private readonly aliasKeys: ReadonlySet<string>;
  /** Corpus-layer units waiting for the grouped member scan. */
  private pending: { unit: CorpusUnit; source: string }[] = [];
  private readonly allow: ReadonlySet<string>;
  private readonly transcripts: TranscriptEligibility;
  private readonly baseDir: string;
  private readonly metaCommentAllow: readonly CompiledAllow[];

  constructor(opts: ScannerOptions = {}) {
    this.matcher = opts.matcher ?? null;
    this.allow = opts.allow ?? new Set();
    this.transcripts = opts.transcripts ?? NO_TRANSCRIPTS;
    this.baseDir = opts.baseDir ?? process.cwd();
    this.aliases = opts.aliases ?? null;
    this.aliasKeys = new Set<string>([...ALIAS_KEYS, ...(opts.aliasKeys ?? [])]);
    this.metaCommentAllow = opts.metaCommentAllow ?? [];
  }

  // ---- remarks on the audio or the transcript ------------------------------------

  /** Check published texts of one source; one finding per term (first field and context, total count). */
  private checkMetaComments(texts: Iterable<{ text: string; field?: string }>, source: string): void {
    const acc = new Map<string, Extract<Finding, { kind: "meta-comment" }>>();
    for (const { text, field } of texts) {
      this.counts.metaCommentUnits++;
      for (const hit of findMetaComments(text)) {
        if (isMetaCommentAllowed(this.metaCommentAllow, source, hit)) {
          this.counts.metaCommentAllowed++;
          continue;
        }
        const prev = acc.get(hit.term);
        if (prev) prev.count++;
        else acc.set(hit.term, { kind: "meta-comment", source, term: hit.term, ...(field !== undefined ? { field } : {}), context: hit.context, count: 1 });
      }
    }
    for (const f of acc.values()) this.add(f);
  }

  /**
   * The approved transcript view (Quiet's `data-follow-text` section) names what it shows: with the
   * view on and an eligible recording, that section is left out of the remark check. Its words never
   * sit in the page; the verbatim and key checks still read the whole page.
   */
  private withoutApprovedTranscriptView(html: string): string {
    if (!this.transcripts.enabled || this.transcripts.versions.size === 0 || !html.includes("data-follow-text")) return html;
    return html.replace(/<section\b[^>]*\bdata-follow-text\b[^>]*>[\s\S]*?<\/section\s*>/gi, " ");
  }

  /**
   * Every string value of a parsed value, except identifiers (see `isIdentifier`): bare paths and URLs (no spaces, with
   * `/` or `:`) and slugs (`yi-simchos-…-03`), which are not prose.
   */
  private *metaCommentTexts(value: unknown): Generator<{ text: string; field: string }> {
    const stack: { node: unknown; path: (string | number)[] }[] = [{ node: value, path: [] }];
    while (stack.length > 0) {
      const { node, path } = stack.pop()!;
      if (typeof node === "string") {
        if (!isIdentifier(node)) yield { text: node, field: fieldOf(path) };
      } else if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0; i--) stack.push({ node: node[i], path: [...path, i] });
      } else if (isRecord(node)) {
        for (const [k, c] of Object.entries(node).reverse()) stack.push({ node: c, path: [...path, k] });
      }
    }
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
    this.record(this.matcher.scan(text, ctx.shiurId), source, ctx);
  }

  /** Report (and fail) one scanned unit. */
  private record(r: ScanResult, source: string, ctx: { shiurId: string | null; itemId?: string; field?: string }): void {
    if (!this.matcher) return;
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

  /**
   * Compare the waiting corpus-layer units with their member shiurim, one shiur index at a time.
   * A unit none of whose members is known is compared with every transcript. Called by `result()`.
   */
  flushDeferred(): void {
    const matcher = this.matcher;
    const pending = this.pending;
    this.pending = [];
    if (!matcher || pending.length === 0) return;
    const results = new Map<number, ScanResult>();
    const best = new Map<number, { shiurId: string; run: number }>();
    const byShiur = new Map<string, number[]>();
    pending.forEach(({ unit }, i) => {
      this.counts.textUnits++;
      this.counts.corpusUnits++;
      let known = false;
      for (const sid of unit.members) {
        if (!matcher.knowsShiur(sid)) continue;
        known = true;
        const list = byShiur.get(sid) ?? [];
        list.push(i);
        byShiur.set(sid, list);
      }
      if (known) this.counts.unitsMappedToShiur++;
      else {
        this.counts.unitsCheckedAgainstCorpus++;
        if (unit.text.length >= matcher.thresholds.report) results.set(i, matcher.scan(unit.text, null));
      }
    });
    for (const [sid, idxs] of byShiur) {
      const index = matcher.buildShiurIndex(sid);
      if (!index) continue;
      for (const i of idxs) {
        const text = pending[i]!.unit.text;
        if (text.length < matcher.thresholds.report) continue;
        const r = matcher.scanIndex(index, text);
        results.set(i, mergeScans(results.get(i) ?? NO_RUN, r));
        const b = best.get(i);
        if (!b || r.maxRun > b.run) best.set(i, { shiurId: sid, run: r.maxRun });
      }
    }
    pending.forEach(({ unit, source }, i) => {
      const r = results.get(i);
      if (!r) return;
      const b = best.get(i);
      this.record(r, source, { shiurId: b && b.run > 0 ? b.shiurId : null, itemId: unit.id, field: fieldOf(unit.path) });
    });
  }

  // ---- aliases ---------------------------------------------------------------

  /**
   * Check every string under an alias-bearing key. The entity is the nearest enclosing object with
   * an entity `kind` and an `id`, else (in a layer entity file) the nearest object with an `id`,
   * else `ctx.entity`, else unknown (raw ban only).
   */
  private walkAliases(value: unknown, source: string, ctx: ValueContext): void {
    const rules = this.aliases;
    if (!rules) return;
    const acc = new Map<string, { rule: AliasRule; entity?: string; field: string; count: number }>();
    const walk = (node: unknown, path: (string | number)[], entity: { kind: EntityKind; id: string } | null): void => {
      if (Array.isArray(node)) {
        node.forEach((c, i) => walk(c, [...path, i], entity));
        return;
      }
      if (!isRecord(node)) return;
      let e = entity;
      if (isEntityKind(node.kind) && typeof node.id === "string") e = { kind: node.kind, id: node.id };
      else if (ctx.fileKind && typeof node.id === "string") e = { kind: ctx.fileKind, id: node.id };
      // A person on a story: `{ name }` inside a `people` list.
      const storyPerson = ctx.storyNames === true && path.at(-2) === "people" && typeof path.at(-1) === "number";
      // An entity row (quick-index entity, EntityDoc): its labels are that entity's display names (F.1).
      if (isEntityKind(node.kind) && typeof node.id === "string" && isRecord(node.labels)) {
        const field = fieldOf([...path, "labels"]);
        for (const term of Object.values(node.labels)) {
          if (typeof term !== "string" || term.trim() === "") continue;
          this.counts.namesChecked++;
          const v = rules.check({ kind: node.kind, id: node.id }, term);
          if (!v) continue;
          const entityKey = `${node.kind}:${node.id}`;
          const key = `${v.rule}\u0000${entityKey}\u0000${field}`;
          const prev = acc.get(key);
          if (prev) prev.count++;
          else acc.set(key, { rule: v.rule, entity: entityKey, field, count: 1 });
        }
      }
      for (const [k, c] of Object.entries(node)) {
        const asName = storyPerson && k === "name";
        if (this.aliasKeys.has(k) || asName) {
          const field = fieldOf([...path, k]);
          for (const term of asName ? (typeof c === "string" ? [c] : []) : aliasTerms(c)) {
            const strict = ctx.storyNames === true && (asName || e === null);
            if (strict) this.counts.storyNamesChecked++;
            else this.counts.aliasTermsChecked++;
            const v = strict ? rules.checkName(term) : rules.check(e, term);
            if (!v) continue;
            const entityKey = e ? `${e.kind}:${e.id}` : undefined;
            const key = `${v.rule}\u0000${entityKey ?? ""}\u0000${field}`;
            const prev = acc.get(key);
            if (prev) prev.count++;
            else acc.set(key, entityKey === undefined ? { rule: v.rule, field, count: 1 } : { rule: v.rule, entity: entityKey, field, count: 1 });
          }
        }
        if (typeof c === "object" && c !== null) walk(c, [...path, k], e);
      }
    };
    walk(value, [], ctx.entity ?? null);
    for (const a of acc.values()) this.add({ kind: "alias", source, ...a });
  }

  /**
   * Name fields (F.1): in a shiur file every person name (a string in a `people` list, a
   * `people[].name`, `people[].label.*`) and concept name (`concepts[].he`); in a search doc
   * (`kind` "shiur" with a `titleOriginal`) its `people`/`concepts` strings; in a Pagefind record
   * its name-bearing meta/filter keys (entity labels against the record's entity). Each must be a
   * display name of a corpus entity: raw extraction names (possible ASR mishearings) never ship.
   */
  private walkNames(value: unknown, source: string, ctx: ValueContext): void {
    const rules = this.aliases;
    if (!rules) return;
    const acc = new Map<string, { rule: AliasRule; entity?: string; field: string; count: number }>();
    const check = (term: unknown, path: (string | number)[], entity: { kind: EntityKind; id: string } | null = null) => {
      if (typeof term !== "string" || term.trim() === "") return;
      this.counts.namesChecked++;
      const v = entity ? rules.check(entity, term) : rules.checkName(term);
      if (!v) return;
      const field = fieldOf(path);
      const entityKey = entity ? `${entity.kind}:${entity.id}` : undefined;
      const key = `${v.rule}\u0000${entityKey ?? ""}\u0000${field}`;
      const prev = acc.get(key);
      if (prev) prev.count++;
      else acc.set(key, entityKey === undefined ? { rule: v.rule, field, count: 1 } : { rule: v.rule, entity: entityKey, field, count: 1 });
    };
    const shiurWalk = (node: unknown, path: (string | number)[]): void => {
      if (Array.isArray(node)) {
        node.forEach((c, i) => shiurWalk(c, [...path, i]));
        return;
      }
      if (!isRecord(node)) return;
      for (const [k, c] of Object.entries(node)) {
        if (k === "people" && Array.isArray(c)) {
          c.forEach((p, i) => {
            const at = [...path, k, i];
            if (typeof p === "string") check(p, at);
            else if (isRecord(p)) {
              check(p.name, [...at, "name"]);
              if (isRecord(p.label)) for (const [lk, lv] of Object.entries(p.label)) check(lv, [...at, "label", lk]);
            }
          });
        } else if (k === "concepts" && Array.isArray(c)) {
          c.forEach((x, i) => {
            if (typeof x === "string") check(x, [...path, k, i]);
            else if (isRecord(x)) check(x.he, [...path, k, i, "he"]);
          });
        }
        if (typeof c === "object" && c !== null) shiurWalk(c, [...path, k]);
      }
    };
    if (ctx.shiurNames === true) shiurWalk(value, []);
    else if (isRecord(value) && value.kind === "shiur" && typeof value.titleOriginal === "string") {
      // A SearchDoc: its top-level name lists (facets hold ids, not names).
      for (const k of ["people", "concepts"] as const) {
        const list = value[k];
        if (Array.isArray(list)) list.forEach((x, i) => check(x, [k, i]));
      }
    }
    if (ctx.pagefind === true && isRecord(value)) {
      for (const part of ["meta", "filters"] as const) {
        const o = value[part];
        if (!isRecord(o)) continue;
        for (const [k, c] of Object.entries(o)) {
          const asLabel = (PAGEFIND_LABEL_KEYS as readonly string[]).includes(k);
          if (!asLabel && !(PAGEFIND_NAME_KEYS as readonly string[]).includes(k)) continue;
          const entity = asLabel ? (ctx.entity ?? null) : null;
          for (const term of aliasTerms(c)) check(term, [part, k], entity);
        }
      }
    }
    for (const a of acc.values()) this.add({ kind: "alias", source, ...a });
  }

  /** Alias check for terms an emitter publishes for one entity (search docs, quick index rows). */
  checkEntityAliases(entity: { kind: EntityKind; id: string } | null, terms: readonly string[], source: string): void {
    this.walkAliases({ terms: [...terms] }, source, { entity });
  }

  // ---- structured values -----------------------------------------------------

  /**
   * Scan a parsed JSON value (a file, an NDJSON line, a Pagefind record, Vectorize metadata).
   * Keys are checked structurally; strings are checked for substrings and verbatim runs,
   * mapped to a shiur by the nearest enclosing `shiurId`/`id`, else by `pathHint`.
   */
  scanValue(value: unknown, source: string, pathHint: string | null = null, vctx: ValueContext = {}): void {
    const keyCounts = new Map<string, { count: number; field: string }>();
    const subCounts = new Map<string, number>();
    const fallbackShiur = pathHint;
    this.checkMetaComments(this.metaCommentTexts(value), source);
    this.walkAliases(value, source, vctx);
    this.walkNames(value, source, vctx);
    const layerUnits = new Map<string, CorpusUnit>();
    if (vctx.layerFile) for (const u of layerFileUnits(vctx.layerFile, value)) layerUnits.set(pathKey(u.path), u);

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
        const unit = layerUnits.size > 0 ? layerUnits.get(pathKey(path)) : undefined;
        if (unit && unit.text === node) {
          if (this.matcher) this.pending.push({ unit, source });
          return;
        }
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

  /** Story names marked on a built page (`data-story-person`): each must be a corpus entity's display name. */
  private checkMarkedNames(html: string, source: string): void {
    const rules = this.aliases;
    if (!rules || !html.includes(STORY_PERSON_ATTR)) return;
    const acc = new Map<AliasRule, number>();
    for (const name of markedStoryNames(html)) {
      this.counts.storyNamesChecked++;
      const v = rules.checkName(decodeHtmlEntities(name));
      if (v) acc.set(v.rule, (acc.get(v.rule) ?? 0) + 1);
    }
    for (const [rule, count] of acc) this.add({ kind: "alias", source, rule, field: `[${STORY_PERSON_ATTR}]`, count });
  }

  /**
   * Person names marked on a built page (`data-person="<id>"`, F.1): each must be a display name
   * of that person (any corpus entity's when the id is empty).
   */
  private checkMarkedPersons(html: string, source: string): void {
    const rules = this.aliases;
    if (!rules || !html.includes(PERSON_ATTR)) return;
    const acc = new Map<string, { rule: AliasRule; entity?: string; count: number }>();
    for (const { id, name } of markedPersonNames(html)) {
      this.counts.namesChecked++;
      const entity = id !== "" ? { kind: "person" as const, id } : null;
      const term = decodeHtmlEntities(name);
      const v = entity ? rules.check(entity, term) : rules.checkName(term);
      if (!v) continue;
      const key = `${v.rule}\u0000${id}`;
      const prev = acc.get(key);
      if (prev) prev.count++;
      else acc.set(key, entity ? { rule: v.rule, entity: `person:${id}`, count: 1 } : { rule: v.rule, count: 1 });
    }
    for (const a of acc.values()) this.add({ kind: "alias", source, field: `[${PERSON_ATTR}]`, ...a });
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
      // Accepted only for an eligible id with the gate's exact public shape and identity version
      // (eligible.ts); never scanned as ordinary text, since it is the approved transcript itself.
      let reason: TranscriptRejection | "unreadable" | null;
      try {
        reason = checkTranscriptFile(tid, readFileSync(file, "utf8"), this.transcripts);
      } catch {
        reason = "unreadable";
      }
      if (reason === null) this.counts.transcriptFilesAllowed++;
      else this.add({ kind: "transcript-file", source, recordingId: tid, reason });
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
      this.scanValue(parsed, source, hint, {
        layerFile: layerFileOf(file),
        fileKind: entityKindOfFile(file),
        storyNames: isStoryNamesFile(file),
        shiurNames: isShiurNamesFile(file),
      });
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
      this.checkMetaComments([{ text: htmlToText(withoutIdentifierAttributes(this.withoutApprovedTranscriptView(raw))) }], source);
      this.checkMarkedNames(raw, source);
      this.checkMarkedPersons(raw, source);
      this.scanText(raw, source, htmlProse(raw), hint);
      return;
    }
    if (JS_EXT.has(ext)) {
      this.scanText(raw, source, decodeJsEscapes(raw), hint);
      return;
    }
    if (PROSE_TEXT_EXT.has(ext)) this.checkMetaComments([{ text: raw }], source);
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
    this.flushDeferred();
    return {
      version: 1,
      generatedBy: "@emunas/corpus-guard post",
      verbatimChecked: this.matcher !== null,
      aliasesChecked: this.aliases !== null,
      counts: { ...this.counts },
      findings: [...this.findings],
      verbatim: [...this.verbatim],
    };
  }
}

/**
 * Identifiers, not prose: bare paths and URLs (no spaces, with `/` or `:`) and slugs
 * (`yi-simchos-…-03`). Recording ids and media keys come from archive file names and are
 * not published text, so the remark check leaves them out.
 */
function isIdentifier(value: string): boolean {
  return /^\S*[/:]\S*$/.test(value) || /^[a-z0-9]+(?:[-_.~][a-z0-9]+)+$/.test(value);
}

/** Blank attribute values that are identifiers (`href`, `src`, `data-rec`, …) inside the tags of a page. */
function withoutIdentifierAttributes(html: string): string {
  return html.replace(/<[a-zA-Z][^<>]*>/g, (tag) =>
    tag.replace(/(=\s*)(?:"([^"]*)"|'([^']*)')/g, (m, eq: string, dq?: string, sq?: string) =>
      isIdentifier(dq ?? sq ?? "") ? `${eq}""` : m,
    ),
  );
}
