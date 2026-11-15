/**
 * Verbatim scan: shared token runs between shipped text and the ASR transcripts.
 * Thresholds (integration-plan C11, owner decision O3): report at ≥12 tokens,
 * suppress (pre-pass) / fail (post-pass) at ≥20.
 */
import { ShingleIndex, Vocabulary, concatWithBreaks, maxRun, type Run } from "./shingles.ts";
import { tokenize } from "./tokenize.ts";
import { TranscriptStore } from "./transcripts.ts";

export const REPORT_AT = 12;
export const SUPPRESS_AT = 20;

export interface Thresholds {
  report: number;
  suppress: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { report: REPORT_AT, suppress: SUPPRESS_AT };

export function checkThresholds(t: Thresholds): void {
  if (!Number.isInteger(t.report) || t.report < 2) throw new Error(`report threshold must be an integer ≥ 2, got ${t.report}`);
  if (!Number.isInteger(t.suppress) || t.suppress < t.report) {
    throw new Error(`suppress threshold must be an integer ≥ report threshold, got ${t.suppress}`);
  }
}

/** Encode text against the vocabulary without growing it (unknown tokens never match). */
export function encode(vocab: Vocabulary, text: string): Int32Array {
  const toks = tokenize(text);
  const out = new Int32Array(toks.length);
  toks.forEach((t, i) => {
    out[i] = vocab.lookup(t);
  });
  return out;
}

export interface ScanResult {
  /** Longest shared run (0 when below the report threshold). */
  maxRun: number;
  /** Number of maximal runs at or above the report threshold. */
  runs: number;
  /** Longest run at or above the suppress threshold that is not covered by allow-listed text (0 if none). */
  maxUnallowedRun: number;
}

export interface VerbatimMatcherOptions {
  transcriptsDir: string;
  /** shiurId → recording ids (from `.corpus/shiurim/*.json`). Text not mapped to a shiur is checked against every transcript. */
  shiurRecordings?: ReadonlyMap<string, readonly string[]>;
  thresholds?: Thresholds;
  /** Texts of allow-listed items; a run fully contained in one of them never fails. */
  allowedTexts?: readonly string[];
  /** Per-shiur indexes kept in memory (default 16). */
  cacheShiurim?: number;
  /** Recording token arrays kept in memory (default 0: re-read on demand). */
  cacheRecordings?: number;
}

export class VerbatimMatcher {
  readonly thresholds: Thresholds;
  readonly vocab = new Vocabulary();
  readonly store: TranscriptStore;
  private readonly shiurRecordings: ReadonlyMap<string, readonly string[]>;
  private readonly shiurCache = new Map<string, ShingleIndex>();
  private readonly cacheShiurim: number;
  private global: ShingleIndex | null = null;
  private allowIndex: ShingleIndex | null = null;
  private readonly allowedTexts: readonly string[];
  private allowBuiltAtVocab = -1;

  constructor(opts: VerbatimMatcherOptions) {
    this.thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;
    checkThresholds(this.thresholds);
    this.store = new TranscriptStore(opts.transcriptsDir, this.vocab, { cacheLimit: opts.cacheRecordings ?? 0 });
    this.shiurRecordings = opts.shiurRecordings ?? new Map();
    this.allowedTexts = opts.allowedTexts ?? [];
    this.cacheShiurim = opts.cacheShiurim ?? 16;
  }

  knowsShiur(shiurId: string): boolean {
    return this.shiurRecordings.has(shiurId);
  }

  get shiurIds(): Iterable<string> {
    return this.shiurRecordings.keys();
  }

  /** Index over one shiur's recordings, or null when the shiur is unknown. */
  shiurIndex(shiurId: string): ShingleIndex | null {
    const cached = this.shiurCache.get(shiurId);
    if (cached) return cached;
    const recs = this.shiurRecordings.get(shiurId);
    if (!recs) return null;
    const { tokens } = this.store.stream(recs);
    const index = new ShingleIndex(tokens, this.thresholds.report);
    if (this.shiurCache.size >= this.cacheShiurim) {
      const first = this.shiurCache.keys().next();
      if (!first.done) this.shiurCache.delete(first.value);
    }
    this.shiurCache.set(shiurId, index);
    return index;
  }

  /** Index over every transcript in the folder (built once, on first use). */
  globalIndex(): ShingleIndex {
    if (!this.global) {
      const parts: Int32Array[] = [];
      for (const id of this.store.listRecordingIds()) {
        const t = this.store.tokens(id);
        if (t) parts.push(t);
      }
      this.global = new ShingleIndex(concatWithBreaks(parts), this.thresholds.report);
    }
    return this.global;
  }

  private allowed(): ShingleIndex | null {
    if (this.allowedTexts.length === 0) return null;
    // Re-encode when the vocabulary grew: allow-listed tokens are looked up, never interned.
    if (!this.allowIndex || this.allowBuiltAtVocab !== this.vocab.size) {
      this.allowIndex = new ShingleIndex(
        concatWithBreaks(this.allowedTexts.map((t) => encode(this.vocab, t))),
        this.thresholds.report,
      );
      this.allowBuiltAtVocab = this.vocab.size;
    }
    return this.allowIndex;
  }

  /** Runs of `text` against `index` (the index must be built before encoding so the vocabulary is complete). */
  runsAgainst(index: ShingleIndex, text: string): { query: Int32Array; runs: Run[] } {
    const query = encode(this.vocab, text);
    return { query, runs: index.findRuns(query) };
  }

  /** Scan one text unit; `shiurId` null (or unknown) → the whole transcript corpus. */
  scan(text: string, shiurId: string | null): ScanResult {
    const index = (shiurId !== null ? this.shiurIndex(shiurId) : null) ?? this.globalIndex();
    const { query, runs } = this.runsAgainst(index, text);
    let unallowed = 0;
    const allow = this.allowed();
    for (const r of runs) {
      if (r.length < this.thresholds.suppress) continue;
      if (allow && allow.longestAt(query, r.start) >= r.length) continue;
      if (r.length > unallowed) unallowed = r.length;
    }
    return { maxRun: maxRun(runs), runs: runs.length, maxUnallowedRun: unallowed };
  }
}
