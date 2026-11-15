/**
 * Budget helpers (integration-plan §4 step 6). Cloudflare Workers static assets allow
 * 20,000 files per version and 25 MiB per file; the sites keep a margin at 18,000.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const MAX_FILES = 18_000;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Every regular file under `dir`, depth-first, sorted by name for stable output. */
export function* walkFiles(dir: string): Generator<string> {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walkFiles(p);
    else if (e.isFile()) yield p;
  }
}

export type BudgetFinding =
  | { kind: "file-count"; root: string; files: number; limit: number }
  | { kind: "file-size"; root: string; file: string; bytes: number; limit: number };

export interface BudgetResult {
  root: string;
  files: number;
  totalBytes: number;
  largest: { file: string; bytes: number } | null;
  findings: BudgetFinding[];
}

export interface BudgetLimits {
  maxFiles?: number;
  maxFileBytes?: number;
}

/** File count and per-file size of one deploy root (e.g. `apps/quiet/dist`). */
export function checkBudgets(root: string, limits: BudgetLimits = {}): BudgetResult {
  const maxFiles = limits.maxFiles ?? MAX_FILES;
  const maxFileBytes = limits.maxFileBytes ?? MAX_FILE_BYTES;
  const findings: BudgetFinding[] = [];
  let files = 0;
  let totalBytes = 0;
  let largest: { file: string; bytes: number } | null = null;
  for (const f of walkFiles(root)) {
    files++;
    const bytes = statSync(f).size;
    totalBytes += bytes;
    const rel = relative(root, f).split(sep).join("/");
    if (!largest || bytes > largest.bytes) largest = { file: rel, bytes };
    if (bytes > maxFileBytes) findings.push({ kind: "file-size", root, file: rel, bytes, limit: maxFileBytes });
  }
  if (files > maxFiles) findings.push({ kind: "file-count", root, files, limit: maxFiles });
  return { root, files, totalBytes, largest, findings };
}

/** Human-readable size (for job summaries). */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}
