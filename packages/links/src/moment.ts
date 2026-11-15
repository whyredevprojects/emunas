import type { MomentKind, MomentRef } from "./types.ts";

// Longest kinds first so `st3` is a story, not a section.
const MOMENT_RE = /^(.+)~(st|tk|kp|s|i|q)(\d{1,5})$/;

/** `<shiurId>~<kind><index>` (integration-plan §2.2). */
export function momentId(shiurId: string, kind: MomentKind, index: number): string {
  if (shiurId === "") throw new TypeError("momentId: empty shiur id");
  if (!Number.isInteger(index) || index < 0) throw new TypeError(`momentId: bad index ${index}`);
  return `${shiurId}~${kind}${index}`;
}

export interface ParsedMomentId extends MomentRef {
  readonly shiurId: string;
}

export function parseMomentId(id: string): ParsedMomentId | null {
  const m = MOMENT_RE.exec(id);
  if (!m || m[1] === undefined || m[2] === undefined || m[3] === undefined) return null;
  return { shiurId: m[1], kind: m[2] as MomentKind, index: Number(m[3]) };
}
