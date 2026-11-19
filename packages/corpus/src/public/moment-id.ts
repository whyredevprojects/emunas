/**
 * Moment ids (integration-plan §2.2): `<shiurId>~<kind><index>`, e.g. `yi-tanya-1-01~s3`.
 * Indices are positions in the raw extraction (before any filtering), so an id stays put when an
 * item next to it is dropped; they can shift when a shiur is re-extracted, so every link also
 * carries `t`.
 *
 * Kinds:
 *  kp key point · s section/chapter · i insight · tk takeaway · q question · st story · src source
 *  ol one-liner · ab abstract (index always 0)
 *  w<lang> write-up paragraph, one kind per `UI_LANGS` language (`wen`, `wyi`, `whe`):
 *    `<kind><blockIndex>.<paragraphIndex>` (e.g. `~wen3.1`). A translated write-up mirrors the
 *    `yi` blocks, so `~whe3.1` is the translation of `~wyi3.1`.
 */
import { UI_LANGS, type UiLang } from "@emunas/i18n";

export type WriteupMomentKind = `w${UiLang}`;
export const ITEM_MOMENT_KINDS = ["kp", "s", "i", "tk", "q", "st", "src", "ol", "ab"] as const;
export const WRITEUP_MOMENT_KINDS: readonly WriteupMomentKind[] = UI_LANGS.map((l) => writeupMomentKind(l));
export const MOMENT_KINDS: readonly MomentKind[] = [...ITEM_MOMENT_KINDS, ...WRITEUP_MOMENT_KINDS];
export type MomentKind = (typeof ITEM_MOMENT_KINDS)[number] | WriteupMomentKind;

/** The moment kind of a write-up paragraph in `lang`. */
export function writeupMomentKind(lang: UiLang): WriteupMomentKind {
  return `w${lang}`;
}

function isWriteupKind(kind: string): kind is WriteupMomentKind {
  return (WRITEUP_MOMENT_KINDS as readonly string[]).includes(kind);
}

export interface ParsedMomentId {
  shiurId: string;
  kind: MomentKind;
  index: number;
  /** Only for write-up paragraphs. */
  sub?: number;
}

const SHIUR_ID = /^[a-z0-9][a-z0-9-]*$/;
// Longest kinds first, so `src` is not read as `s` + garbage.
const KIND_ALT = [...MOMENT_KINDS].sort((a, b) => b.length - a.length).join("|");
const MOMENT_RE = new RegExp(`^([a-z0-9][a-z0-9-]*)~(${KIND_ALT})(\\d+)(?:\\.(\\d+))?$`);

export function momentId(shiurId: string, kind: MomentKind, index: number, sub?: number): string {
  if (!SHIUR_ID.test(shiurId)) throw new Error(`invalid shiur id for a moment id: ${JSON.stringify(shiurId)}`);
  if (!Number.isInteger(index) || index < 0) throw new Error(`invalid moment index ${index}`);
  const isWriteup = isWriteupKind(kind);
  if (isWriteup !== (sub !== undefined)) throw new Error(`moment kind ${kind} ${isWriteup ? "needs" : "takes no"} sub index`);
  if (sub !== undefined && (!Number.isInteger(sub) || sub < 0)) throw new Error(`invalid moment sub index ${sub}`);
  return sub === undefined ? `${shiurId}~${kind}${index}` : `${shiurId}~${kind}${index}.${sub}`;
}

export function parseMomentId(id: string): ParsedMomentId | null {
  const m = MOMENT_RE.exec(id);
  if (!m) return null;
  const kind = m[2] as MomentKind;
  const isWriteup = isWriteupKind(kind);
  if (isWriteup !== (m[4] !== undefined)) return null;
  const out: ParsedMomentId = { shiurId: m[1]!, kind, index: Number(m[3]) };
  if (m[4] !== undefined) out.sub = Number(m[4]);
  return out;
}

/** Shiur id of a moment id (or of a plain shiur id); null when malformed. */
export function shiurIdOf(id: string): string | null {
  if (SHIUR_ID.test(id)) return id;
  return parseMomentId(id)?.shiurId ?? null;
}
