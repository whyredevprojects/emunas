/**
 * Guard pre-pass (integration-plan §4 step 2): compare every shipped text item in
 * `.corpus/` with its own shiur's transcripts and list the items to suppress.
 *
 * Output (`.corpus/suppress.json`) carries ids, field paths, run lengths and counts only.
 * It never contains transcript or shipped text.
 */
import { ShingleIndex, maxRun } from "./shingles.ts";
import type { ShiurUnits } from "./items.ts";
import { DEFAULT_THRESHOLDS, VerbatimMatcher, checkThresholds, encode, type Thresholds } from "./verbatim.ts";
import { readCorpusUnits } from "./corpus.ts";

export interface PreReportEntry {
  id: string;
  shiurId: string;
  field: string;
  runLength: number;
  runs: number;
}

export interface PreSuppressEntry {
  id: string;
  reason: "verbatim-run";
  shiurId: string;
  fields: string[];
  runLength: number;
}

export interface PreCounts {
  shiurim: number;
  shiurimScanned: number;
  shiurimWithoutTranscript: number;
  unreadableFiles: number;
  recordingsMissing: number;
  items: number;
  tokensScanned: number;
  reported: number;
  suppressed: number;
  allowed: number;
}

export interface PreResult {
  version: 1;
  generatedBy: "@emunas/corpus-guard pre";
  thresholds: Thresholds;
  counts: PreCounts;
  /** Items with a run ≥ suppress threshold that are not allow-listed. corpus:build --suppress unpublishes these. */
  suppress: PreSuppressEntry[];
  /** Items with a run ≥ suppress threshold that a person allow-listed. */
  allowed: PreSuppressEntry[];
  /** Every (item, field) with a run ≥ report threshold. */
  report: PreReportEntry[];
}

export interface PreOptions {
  transcriptsDir: string;
  allow?: ReadonlySet<string>;
  thresholds?: Thresholds;
}

/** Pre-pass over already-collected units (used by the CLI via `.corpus/`, and by tests/bench directly). */
export function prePassUnits(
  units: Iterable<ShiurUnits | null>,
  opts: PreOptions,
): PreResult {
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;
  checkThresholds(thresholds);
  const allow = opts.allow ?? new Set<string>();
  const matcher = new VerbatimMatcher({ transcriptsDir: opts.transcriptsDir, thresholds });
  const counts: PreCounts = {
    shiurim: 0,
    shiurimScanned: 0,
    shiurimWithoutTranscript: 0,
    unreadableFiles: 0,
    recordingsMissing: 0,
    items: 0,
    tokensScanned: 0,
    reported: 0,
    suppressed: 0,
    allowed: 0,
  };
  const report: PreReportEntry[] = [];
  const hits = new Map<string, PreSuppressEntry>();

  for (const u of units) {
    if (u === null) {
      counts.unreadableFiles++;
      continue;
    }
    counts.shiurim++;
    const { tokens, missing } = matcher.store.stream(u.recordingIds);
    counts.recordingsMissing += missing.length;
    if (missing.length === u.recordingIds.length) {
      counts.shiurimWithoutTranscript++;
      continue;
    }
    counts.shiurimScanned++;
    const index = new ShingleIndex(tokens, thresholds.report);
    for (const item of u.items) {
      counts.items++;
      const query = encode(matcher.vocab, item.text);
      counts.tokensScanned += query.length;
      if (query.length < thresholds.report) continue;
      const runs = index.findRuns(query);
      const len = maxRun(runs);
      if (len < thresholds.report) continue;
      report.push({ id: item.id, shiurId: u.shiurId, field: item.field, runLength: len, runs: runs.length });
      if (len >= thresholds.suppress) {
        const prev = hits.get(item.id);
        if (prev) {
          if (!prev.fields.includes(item.field)) prev.fields.push(item.field);
          prev.runLength = Math.max(prev.runLength, len);
        } else {
          hits.set(item.id, { id: item.id, reason: "verbatim-run", shiurId: u.shiurId, fields: [item.field], runLength: len });
        }
      }
    }
  }

  const suppress: PreSuppressEntry[] = [];
  const allowed: PreSuppressEntry[] = [];
  for (const h of hits.values()) (allow.has(h.id) ? allowed : suppress).push(h);
  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  suppress.sort(byId);
  allowed.sort(byId);
  report.sort((a, b) => byId(a, b) || (a.field < b.field ? -1 : a.field > b.field ? 1 : 0));
  counts.reported = report.length;
  counts.suppressed = suppress.length;
  counts.allowed = allowed.length;
  return { version: 1, generatedBy: "@emunas/corpus-guard pre", thresholds, counts, suppress, allowed, report };
}

/** Pre-pass over `.corpus/shiurim/*.json`. */
export function runPrePass(corpusDir: string, opts: PreOptions): PreResult {
  return prePassUnits(
    (function* () {
      for (const { units } of readCorpusUnits(corpusDir)) yield units;
    })(),
    opts,
  );
}
