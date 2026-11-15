/**
 * Work lookup: SourceMention.work string → workKey and table row. Never throws.
 *
 * Resolution order on the matching form (foldBasic, leading "the" removed):
 *   1. alias table (tables/works.ts)
 *   2. the same without a trailing parenthetical ("Siddur (Hashkiveinu)" → Siddur)
 *   3. "<commentator> on <book>" → the commentator ("Rashi on Bereishis" → rashi)
 *   4. "Rambam, Hilchos X" / "Hilchos X" → mishneh-torah; "<work>, <part>" → the work
 *   5. "Shulchan Aruch <section>" → shulchan-aruch
 *   6. otherwise unmapped: key = slugify(matching form), status "unmapped" (report it)
 */
import { buildAliasIndex } from "./alias-index.ts";
import { foldBasic } from "./fold.ts";
import { slugify } from "./slug.ts";
import { WORKS, WORK_GROUPS, type Work, type WorkGroup } from "./tables/works.ts";

export interface WorkMatch {
  key: string;
  status: "mapped" | "unmapped";
  work: Work | null;
}

/** Matching form for work names. */
export function workForm(raw: string): string {
  return foldBasic(raw).replace(/^the /, "");
}

let index: Map<string, Work> | null = null;
let byKey: Map<string, Work> | null = null;

function idx(): Map<string, Work> {
  index ??= buildAliasIndex("works", WORKS, (w) => [...w.aliases, w.key], workForm);
  return index;
}

export function warmWorkIndex(): void {
  idx();
}

/** Work row by key. */
export function workByKey(key: string): Work | null {
  byKey ??= new Map(WORKS.map((w) => [w.key, w]));
  return byKey.get(key) ?? null;
}

function hit(w: Work): WorkMatch {
  return { key: w.key, status: "mapped", work: w };
}

function resolve(raw: string): Work | null {
  const i = idx();
  const f = workForm(raw);
  const direct = i.get(f);
  if (direct) return direct;

  const noParen = raw.replace(/\s*\([^()]*\)\s*$/, "");
  if (noParen !== raw) {
    const w = i.get(workForm(noParen));
    if (w) return w;
  }

  const on = /^(.+?) (?:on|al) (.+)$/.exec(f);
  if (on) {
    const left = i.get(on[1] as string);
    if (left && !left.genre) return left;
  }

  // foldBasic turns "Rambam, Hilchos X" into "rambam hilchos x"
  if (/^(?:rambam )?(?:hilchos|hilchot|hilkhot|laws of) /.test(f)) {
    const mt = workByKey("mishneh-torah");
    if (mt) return mt;
  }

  const comma = /^([^,]+),\s*(.+)$/.exec(raw);
  if (comma) {
    const left = i.get(workForm(comma[1] as string));
    if (left && !left.genre) return left;
  }

  if (/^shulchan (?:aruch|arukh) /.test(f)) return workByKey("shulchan-aruch");

  const alTorah = /^(.+) al hatorah$/.exec(f);
  if (alTorah) {
    const w = i.get(alTorah[1] as string);
    if (w) return w;
  }
  return null;
}

/** Map a work string (SourceMention.work). Null/empty → key "unknown", unmapped. */
export function lookupWork(raw: string | null | undefined): WorkMatch {
  if (raw == null || foldBasic(raw).length === 0) return { key: "unknown", status: "unmapped", work: null };
  const w = resolve(raw);
  if (w) return hit(w);
  return { key: slugify(workForm(raw)), status: "unmapped", work: null };
}

/** Sort comparator for shelf display: group order, then order within group, then English name. */
export function compareWorks(a: Work, b: Work): number {
  const ga = WORK_GROUPS.indexOf(a.group);
  const gb = WORK_GROUPS.indexOf(b.group);
  if (ga !== gb) return ga - gb;
  if (a.order !== b.order) return a.order - b.order;
  return a.en < b.en ? -1 : a.en > b.en ? 1 : 0;
}

export type { Work, WorkGroup };
