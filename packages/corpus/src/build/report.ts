/**
 * `.corpus/build-report.json`. Holds ids, reasons, counts and catalog/derived key values only. It
 * never copies item text, and validation issues carry the path and the expectation, never the
 * value that was received.
 */
import type { KeyKind } from "./keyer.ts";

export interface DowngradeEntry {
  id: string;
  /** Manifest status at build time. */
  manifestStatus: string | null;
  reasons: string[];
}

export interface TimeWarning {
  /** Moment id (or shiur id) of the item. */
  id: string;
  reason: string;
}

export interface BuildReport {
  schemaVersion: number;
  counts: { total: number; full: number; catalogOnly: number; downgraded: number; notDone: number };
  /** Manifest `done` but published catalog-only. */
  downgraded: DowngradeEntry[];
  /** Not `done` in the manifest but files exist (pipeline mid-flight); informational. */
  notDoneWithFiles: string[];
  dropped: {
    lowConfidence: number;
    unresolvedSourcesWithoutWork: number;
    suppressed: number;
    writeupRefsToDroppedSources: number;
    /**
     * Raw extraction person names left out of the projection (F.1): every `people[].name` and story
     * `people[]` entry of the projected notes. Names reach the sites only through the corpus layer.
     */
    rawPersonNames: number;
  };
  soft: number;
  timeWarnings: TimeWarning[];
  /** Distinct values the keyer could not map, with how many shiurim use each. */
  unmapped: Record<KeyKind, { raw: string; key: string; count: number }[]>;
  suppressed: string[];
  /** Suppress ids that matched nothing in this build. */
  suppressUnmatched: string[];
  sections: { missingFromCatalog: string[] };
  warnings: string[];
}

export class ReportCollector {
  readonly downgraded: DowngradeEntry[] = [];
  readonly notDoneWithFiles: string[] = [];
  readonly dropped = { lowConfidence: 0, unresolvedSourcesWithoutWork: 0, suppressed: 0, writeupRefsToDroppedSources: 0, rawPersonNames: 0 };
  soft = 0;
  readonly timeWarnings: TimeWarning[] = [];
  readonly suppressedApplied = new Set<string>();
  readonly warnings: string[] = [];
  readonly missingSections: string[] = [];
  private readonly unmappedMap = new Map<KeyKind, Map<string, { key: string; shiurim: Set<string> }>>();

  unmapped(kind: KeyKind, raw: string, key: string, shiurId: string): void {
    let m = this.unmappedMap.get(kind);
    if (!m) this.unmappedMap.set(kind, (m = new Map()));
    let e = m.get(raw);
    if (!e) m.set(raw, (e = { key, shiurim: new Set() }));
    e.shiurim.add(shiurId);
  }

  time(id: string, reason: string): void {
    this.timeWarnings.push({ id, reason });
  }

  finish(counts: BuildReport["counts"], schemaVersion: number, suppressIds: readonly string[]): BuildReport {
    const kinds: KeyKind[] = ["parsha", "zman", "work", "person", "concept"];
    const unmapped = Object.fromEntries(
      kinds.map((k) => [
        k,
        [...(this.unmappedMap.get(k) ?? new Map<string, { key: string; shiurim: Set<string> }>()).entries()]
          .map(([raw, e]) => ({ raw, key: e.key, count: e.shiurim.size }))
          .sort((a, b) => b.count - a.count || (a.raw < b.raw ? -1 : a.raw > b.raw ? 1 : 0)),
      ]),
    ) as BuildReport["unmapped"];
    const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return {
      schemaVersion,
      counts,
      downgraded: [...this.downgraded].sort(byId),
      notDoneWithFiles: [...this.notDoneWithFiles].sort(),
      dropped: { ...this.dropped },
      soft: this.soft,
      timeWarnings: [...this.timeWarnings].sort(byId),
      unmapped,
      suppressed: [...this.suppressedApplied].sort(),
      suppressUnmatched: [...new Set(suppressIds)].filter((id) => !this.suppressedApplied.has(id)).sort(),
      sections: { missingFromCatalog: [...new Set(this.missingSections)].sort() },
      warnings: [...this.warnings],
    };
  }
}
