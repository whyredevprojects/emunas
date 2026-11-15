/**
 * Moment ids (integration-plan §2.2): `<shiurId>~<kind><index>`, e.g. `yi-tanya-1-01~s3`.
 * Indices are positions in the raw extraction (before any filtering), so an id stays put when an
 * item next to it is dropped; they can shift when a shiur is re-extracted, so every link also
 * carries `t`.
 *
 * Kinds:
 *  kp key point · s section/chapter · i insight · tk takeaway · q question · st story · src source
 *  ol one-liner · ab abstract (index always 0)
 *  wen / wyi write-up paragraph: `<kind><blockIndex>.<paragraphIndex>` (e.g. `~wen3.1`)
 */

export const MOMENT_KINDS = ["kp", "s", "i", "tk", "q", "st", "src", "ol", "ab", "wen", "wyi"] as const;
export type MomentKind = (typeof MOMENT_KINDS)[number];

export interface ParsedMomentId {
  shiurId: string;
  kind: MomentKind;
  index: number;
  /** Only for write-up paragraphs. */
  sub?: number;
}

const SHIUR_ID = /^[a-z0-9][a-z0-9-]*$/;
const MOMENT_RE = /^([a-z0-9][a-z0-9-]*)~(kp|src|st|s|i|tk|q|ol|ab|wen|wyi)(\d+)(?:\.(\d+))?$/;

export function momentId(shiurId: string, kind: MomentKind, index: number, sub?: number): string {
  if (!SHIUR_ID.test(shiurId)) throw new Error(`invalid shiur id for a moment id: ${JSON.stringify(shiurId)}`);
  if (!Number.isInteger(index) || index < 0) throw new Error(`invalid moment index ${index}`);
  const isWriteup = kind === "wen" || kind === "wyi";
  if (isWriteup !== (sub !== undefined)) throw new Error(`moment kind ${kind} ${isWriteup ? "needs" : "takes no"} sub index`);
  if (sub !== undefined && (!Number.isInteger(sub) || sub < 0)) throw new Error(`invalid moment sub index ${sub}`);
  return sub === undefined ? `${shiurId}~${kind}${index}` : `${shiurId}~${kind}${index}.${sub}`;
}

export function parseMomentId(id: string): ParsedMomentId | null {
  const m = MOMENT_RE.exec(id);
  if (!m) return null;
  const kind = m[2] as MomentKind;
  const isWriteup = kind === "wen" || kind === "wyi";
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
