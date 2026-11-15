/**
 * Pagefind record checker (integration-plan §5.3 scope, W3.x Quiet search): run on every
 * custom record before `index.writeFiles()`, because Pagefind's output fragments are
 * compressed and the post-pass cannot read them.
 */
import { LeakScanner, type Finding, type ScannerOptions } from "./post.ts";

/** Shape of a Pagefind `addCustomRecord` argument (only what the guard reads). */
export interface PagefindRecordLike {
  url: string;
  content: string;
  language?: string;
  meta?: Record<string, string>;
  filters?: Record<string, string[]>;
  sort?: Record<string, string>;
}

export interface PagefindCheckOptions extends ScannerOptions {
  /** Shiur the record belongs to, when the caller knows it; otherwise taken from the URL. */
  shiurId?: string;
}

/**
 * Check one record. Keys of `meta`/`filters`/`sort` are checked against the forbidden key
 * list, every string for forbidden substrings and verbatim runs. Returns findings (empty = ok).
 * Pass the same `scanner` across records to reuse the transcript indexes.
 */
export function checkPagefindRecord(record: PagefindRecordLike, scanner: LeakScanner, shiurId?: string): Finding[] {
  const before = scanner.findings.length;
  const hint = shiurId ?? scanner.shiurFromPath(record.url);
  scanner.scanValue(record, `pagefind:${record.url}`, hint);
  return scanner.findings.slice(before);
}

/** Convenience: a scanner for Pagefind checks (same options as the post-pass). */
export function createPagefindChecker(opts: PagefindCheckOptions = {}): (record: PagefindRecordLike) => Finding[] {
  const scanner = new LeakScanner(opts);
  return (record) => checkPagefindRecord(record, scanner, opts.shiurId);
}
