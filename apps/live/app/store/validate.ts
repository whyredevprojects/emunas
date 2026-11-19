/**
 * Validators for personal records that arrive from outside the app: an imported export file and a
 * shared playlist link. Both are untrusted user input. Each validator copies the allowed fields into
 * a fresh object (never passes the input through), so unknown fields are dropped, and returns `null`
 * for anything malformed.
 */
import {
  LIMITS,
  type HistoryRecord,
  type JsonValue,
  type MomentRef,
  type NoteRecord,
  type PlaylistRecord,
  type PrefRecord,
  type ProgressRecord,
  type QueueRecord,
  type SavedRecord,
  type StoreName,
  type StoreRecords,
} from "./schema.ts";

/** Shiur ids are ASCII slugs (`yi-zmanim-tv-bb-04`). */
const SHIUR_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
/** Record ids, keys and moment ids (`<shiurId>~s3`). */
const ID = /^[A-Za-z0-9][A-Za-z0-9._~:-]{0,127}$/;
/** Largest plausible global time: no shiur is longer than a day. */
const MAX_SECONDS = 86_400;

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : null;
}

export function isShiurId(v: unknown): v is string {
  return typeof v === "string" && SHIUR_ID.test(v);
}

export function isId(v: unknown): v is string {
  return typeof v === "string" && ID.test(v);
}

function seconds(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_SECONDS ? v : null;
}

function stamp(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
}

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length <= max ? v : null;
}

function nullable<T>(v: unknown, check: (v: unknown) => T | null): T | null | undefined {
  if (v === null || v === undefined) return null;
  const r = check(v);
  return r === null ? undefined : r;
}

/** `{ shiurId, start, end?, momentId? }`; `end` must be after `start`. */
export function momentRef(v: unknown): MomentRef | null {
  const o = obj(v);
  if (!o || !isShiurId(o["shiurId"])) return null;
  const start = seconds(o["start"]);
  const end = nullable(o["end"], seconds);
  const momentId = nullable(o["momentId"], (x) => (isId(x) ? x : null));
  if (start === null || end === undefined || momentId === undefined) return null;
  if (end !== null && end <= start) return null;
  return { shiurId: o["shiurId"], start, end, momentId };
}

function progress(v: unknown): ProgressRecord | null {
  const o = obj(v);
  if (!o || !isShiurId(o["shiurId"])) return null;
  const t = seconds(o["t"]);
  const duration = seconds(o["duration"]);
  const updatedAt = stamp(o["updatedAt"]);
  const completedAt = nullable(o["completedAt"], stamp);
  const chapters = o["completedChapters"];
  if (t === null || duration === null || updatedAt === null || completedAt === undefined) return null;
  if (!Array.isArray(chapters) || chapters.length > 500) return null;
  if (!chapters.every((c) => Number.isInteger(c) && (c as number) >= 0)) return null;
  const completedChapters = [...new Set(chapters as number[])].sort((a, b) => a - b);
  return { shiurId: o["shiurId"], t, duration, completedChapters, completedAt, updatedAt };
}

function queue(v: unknown): QueueRecord | null {
  const o = obj(v);
  const ref = momentRef(v);
  if (!o || !ref || !isId(o["key"])) return null;
  const pos = o["pos"];
  const updatedAt = stamp(o["updatedAt"]);
  if (typeof pos !== "number" || !Number.isFinite(pos) || updatedAt === null) return null;
  return { key: o["key"], ...ref, pos, updatedAt };
}

function playlist(v: unknown): PlaylistRecord | null {
  const o = obj(v);
  if (!o || !isId(o["id"])) return null;
  const name = str(o["name"], LIMITS.nameLength);
  const createdAt = stamp(o["createdAt"]);
  const updatedAt = stamp(o["updatedAt"]);
  const raw = o["items"];
  if (name === null || createdAt === null || updatedAt === null) return null;
  if (!Array.isArray(raw) || raw.length > LIMITS.playlistItems) return null;
  const items: MomentRef[] = [];
  for (const it of raw) {
    const r = momentRef(it);
    if (!r) return null;
    items.push(r);
  }
  return { id: o["id"], name, items, createdAt, updatedAt };
}

function saved(v: unknown): SavedRecord | null {
  const o = obj(v);
  if (!o || !isId(o["id"]) || !isShiurId(o["shiurId"])) return null;
  const t = seconds(o["t"]);
  const end = nullable(o["end"], seconds);
  const momentId = nullable(o["momentId"], (x) => (isId(x) ? x : null));
  const updatedAt = stamp(o["updatedAt"]);
  if (t === null || end === undefined || momentId === undefined || updatedAt === null) return null;
  return { id: o["id"], shiurId: o["shiurId"], t, end, momentId, updatedAt };
}

function note(v: unknown): NoteRecord | null {
  const o = obj(v);
  if (!o || !isId(o["id"]) || !isShiurId(o["shiurId"])) return null;
  const t = seconds(o["t"]);
  const text = str(o["text"], LIMITS.noteLength);
  const createdAt = stamp(o["createdAt"]);
  const updatedAt = stamp(o["updatedAt"]);
  if (t === null || text === null || createdAt === null || updatedAt === null) return null;
  return { id: o["id"], shiurId: o["shiurId"], t, text, createdAt, updatedAt };
}

function history(v: unknown): HistoryRecord | null {
  const o = obj(v);
  if (!o || !isShiurId(o["shiurId"])) return null;
  const t = seconds(o["t"]);
  const lastPlayedAt = stamp(o["lastPlayedAt"]);
  const updatedAt = stamp(o["updatedAt"]);
  if (t === null || lastPlayedAt === null || updatedAt === null) return null;
  return { shiurId: o["shiurId"], t, lastPlayedAt, updatedAt };
}

function json(v: unknown, depth = 0): JsonValue | undefined {
  if (depth > 6) return undefined;
  if (v === null || typeof v === "boolean" || typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (Array.isArray(v)) {
    const out: JsonValue[] = [];
    for (const x of v) {
      const j = json(x, depth + 1);
      if (j === undefined) return undefined;
      out.push(j);
    }
    return out;
  }
  const o = obj(v);
  if (!o) return undefined;
  const out: { [k: string]: JsonValue } = {};
  for (const [k, x] of Object.entries(o)) {
    const j = json(x, depth + 1);
    if (j === undefined) return undefined;
    out[k] = j;
  }
  return out;
}

function pref(v: unknown): PrefRecord | null {
  const o = obj(v);
  if (!o || !isId(o["key"])) return null;
  const value = json(o["value"]);
  const updatedAt = stamp(o["updatedAt"]);
  if (value === undefined || updatedAt === null) return null;
  if (JSON.stringify(value).length > 10_000) return null;
  return { key: o["key"], value, updatedAt };
}

export const VALIDATORS: { [S in StoreName]: (v: unknown) => StoreRecords[S] | null } = {
  progress,
  queue,
  playlists: playlist,
  saved,
  notes: note,
  history,
  prefs: pref,
};
