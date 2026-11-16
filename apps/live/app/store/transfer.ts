/**
 * Export and import of personal data as JSON (tech-live §4.2). The file is the listener's own data
 * and doubles as manual sync between devices.
 *
 * Import is untrusted input: every record passes its validator (`validate.ts`), malformed records are
 * skipped and counted, store sizes are capped, and a file from a newer schema is refused rather than
 * half-read. Two modes:
 * - `merge`: per key, the record with the later `updatedAt` wins (the rule a later sync will use);
 * - `replace`: the file's content becomes the whole store.
 */
import { LIMITS, PERSONAL_SCHEMA_VERSION, STORE_NAMES, emptyDump, keyOf, type PersonalDump, type StoreName, type StoreRecords } from "./schema.ts";
import { VALIDATORS } from "./validate.ts";

export const EXPORT_FORMAT = "emunas-live-personal";
/** Refuse files above this size before parsing. */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  data: PersonalDump;
}

export type ImportErrorCode = "too-large" | "not-json" | "wrong-format" | "newer-version";

export class ImportError extends Error {
  override name = "ImportError";
  constructor(readonly code: ImportErrorCode) {
    super(`personal data import failed: ${code}`);
  }
}

export interface ParsedImport {
  dump: PersonalDump;
  /** Records dropped as malformed or over a cap. */
  skipped: number;
  /** Records accepted. */
  accepted: number;
  schemaVersion: number;
}

export type ImportMode = "merge" | "replace";

export function buildExport(dump: PersonalDump, now: number): ExportFile {
  return { format: EXPORT_FORMAT, schemaVersion: PERSONAL_SCHEMA_VERSION, exportedAt: new Date(now).toISOString(), data: dump };
}

export function serializeExport(file: ExportFile): string {
  return `${JSON.stringify(file, null, 1)}\n`;
}

/** `emunas-shelf-2026-11-15.json` */
export function exportFileName(now: number): string {
  return `emunas-shelf-${new Date(now).toISOString().slice(0, 10)}.json`;
}

const CAP: { [S in StoreName]: number } = {
  progress: 100_000,
  queue: LIMITS.queue,
  playlists: LIMITS.playlists,
  saved: LIMITS.saved,
  notes: LIMITS.notes,
  history: LIMITS.history,
  prefs: LIMITS.prefs,
  downloads: 10_000,
};

function readStore<S extends StoreName>(store: S, raw: unknown, out: PersonalDump): { ok: number; bad: number } {
  if (raw === undefined) return { ok: 0, bad: 0 };
  if (!Array.isArray(raw)) return { ok: 0, bad: 1 };
  const validate = VALIDATORS[store];
  const seen = new Map<string, StoreRecords[S]>();
  let bad = 0;
  for (const item of raw) {
    const r = validate(item);
    if (!r) {
      bad++;
      continue;
    }
    const k = keyOf(store, r);
    const prev = seen.get(k);
    if (!prev || prev.updatedAt <= r.updatedAt) seen.set(k, r);
    else bad++;
  }
  let records = [...seen.values()];
  if (records.length > CAP[store]) {
    // Keep the most recently updated ones.
    records = records.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, CAP[store]);
  }
  (out as Record<StoreName, unknown[]>)[store] = records;
  return { ok: records.length, bad: bad + (seen.size - records.length) };
}

/** Parses and validates an export file. Throws `ImportError` for a file that is not one. */
export function parseImport(text: string): ParsedImport {
  if (text.length > MAX_IMPORT_BYTES) throw new ImportError("too-large");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ImportError("not-json");
  }
  const o = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!o || o["format"] !== EXPORT_FORMAT) throw new ImportError("wrong-format");
  const version = o["schemaVersion"];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) throw new ImportError("wrong-format");
  if (version > PERSONAL_SCHEMA_VERSION) throw new ImportError("newer-version");
  const data = o["data"];
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new ImportError("wrong-format");
  const d = data as Record<string, unknown>;
  const dump = emptyDump();
  let accepted = 0;
  let skipped = 0;
  for (const s of STORE_NAMES) {
    const { ok, bad } = readStore(s, d[s], dump);
    accepted += ok;
    skipped += bad;
  }
  return { dump, accepted, skipped, schemaVersion: version };
}

function mergeStore<S extends StoreName>(store: S, a: readonly StoreRecords[S][], b: readonly StoreRecords[S][]) {
  const m = new Map<string, StoreRecords[S]>();
  for (const r of a) m.set(keyOf(store, r), r);
  for (const r of b) {
    const k = keyOf(store, r);
    const prev = m.get(k);
    if (!prev || prev.updatedAt <= r.updatedAt) m.set(k, r);
  }
  return [...m.values()];
}

/** Last-writer-wins per key; ties go to `incoming`. */
export function mergeDumps(current: PersonalDump, incoming: PersonalDump): PersonalDump {
  const out = emptyDump();
  for (const s of STORE_NAMES) {
    (out as Record<StoreName, unknown[]>)[s] = mergeStore(s, current[s], incoming[s]);
  }
  return out;
}
