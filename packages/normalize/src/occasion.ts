/**
 * Parsha and zman lookup over the tables in `tables/parshiyos.ts` and `tables/occasions.ts`.
 * Never throws; unmapped strings go to the `other` bucket with status "unmapped" (C10).
 */
import { buildAliasIndex } from "./alias-index.ts";
import { foldBasic } from "./fold.ts";
import { PARSHIYOS, type Parsha } from "./tables/parshiyos.ts";
import {
  MONTH_OCCASION,
  OCCASIONS,
  OTHER_OCCASION_KEY,
  OTHER_ZMANIM,
  SPECIAL_ZMANIM,
  type Occasion,
} from "./tables/occasions.ts";

export type Audience = "children" | "bachurim";
export type OccasionSub = "seudah" | "lechaim";

export interface OccasionMatch {
  /** parsha key, occasion key, or "other" */
  key: string;
  /** "mapped": in a table; "other": deliberately in the other bucket; "unmapped": unknown, report it */
  status: "mapped" | "other" | "unmapped";
  /** sub-heading under the occasion (סעודת X → "seudah") */
  sub: OccasionSub | null;
  /** audience marker stripped from the catalog string ("For Children", "קינדער") */
  audience: Audience | null;
  parsha: Parsha | null;
  occasion: Occasion | null;
}

const AUDIENCE_SUFFIXES: readonly [string, Audience][] = [
  ["for children", "children"],
  ["children", "children"],
  ["kinder", "children"],
  ["קינדער", "children"],
  ["young bachurim", "bachurim"],
  ["bachurim", "bachurim"],
  ["בחורים", "bachurim"],
];

function stripAudience(f: string): { rest: string; audience: Audience | null } {
  for (const [suffix, audience] of AUDIENCE_SUFFIXES) {
    if (f.endsWith(" " + suffix)) return { rest: f.slice(0, -suffix.length - 1).trim(), audience };
  }
  return { rest: f, audience: null };
}

let parshaIndex: Map<string, Parsha> | null = null;
let occasionIndex: Map<string, Occasion> | null = null;
let occasionByKey: Map<string, Occasion> | null = null;

function parshaIdx(): Map<string, Parsha> {
  parshaIndex ??= buildAliasIndex("parshiyos", PARSHIYOS, (p) => [...p.aliases, p.key], foldBasic);
  return parshaIndex;
}

function occasionIdx(): Map<string, Occasion> {
  occasionIndex ??= buildAliasIndex("occasions", OCCASIONS, (o) => [...o.aliases, o.key], foldBasic);
  return occasionIndex;
}

/** Build both indexes now (tests use this to surface alias conflicts). */
export function warmOccasionIndexes(): void {
  parshaIdx();
  occasionIdx();
}

/** Occasion by key. */
export function occasionByKeyOf(key: string): Occasion | null {
  occasionByKey ??= new Map(OCCASIONS.map((o) => [o.key, o]));
  return occasionByKey.get(key) ?? null;
}

/** Parsha by key. */
export function parshaByKey(key: string): Parsha | null {
  return PARSHIYOS.find((p) => p.key === key) ?? null;
}

const OTHER_SET = new Set(OTHER_ZMANIM.map(foldBasic));

function unmapped(audience: Audience | null): OccasionMatch {
  return { key: OTHER_OCCASION_KEY, status: "unmapped", sub: null, audience, parsha: null, occasion: null };
}

/** Map a catalog parsha string (Shiur.parsha). */
export function lookupParsha(raw: string | null | undefined): OccasionMatch {
  if (raw == null) return unmapped(null);
  const { rest, audience } = stripAudience(foldBasic(raw));
  const bare = rest.replace(/^(פרשת|פרשה|parshas|parshat|parashat|parsha) /, "");
  const p = parshaIdx().get(bare) ?? parshaIdx().get(rest);
  if (!p) return unmapped(audience);
  return { key: p.key, status: "mapped", sub: null, audience, parsha: p, occasion: null };
}

function mapped(o: Occasion, sub: OccasionSub | null, audience: Audience | null): OccasionMatch {
  return { key: o.key, status: "mapped", sub, audience, parsha: null, occasion: o };
}

/** Map a catalog zman string (Shiur.zman). */
export function lookupZman(raw: string | null | undefined): OccasionMatch {
  if (raw == null) return unmapped(null);
  const folded = foldBasic(raw);
  for (const s of SPECIAL_ZMANIM) {
    if (foldBasic(s.raw) === folded) {
      const o = occasionByKeyOf(s.key);
      if (o) return mapped(o, s.sub, null);
    }
  }
  if (OTHER_SET.has(folded)) {
    return { key: OTHER_OCCASION_KEY, status: "other", sub: null, audience: null, parsha: null, occasion: null };
  }
  const { rest, audience } = stripAudience(folded);
  return lookupFoldedZman(rest, audience, null);
}

function lookupFoldedZman(f: string, audience: Audience | null, sub: OccasionSub | null): OccasionMatch {
  const direct = occasionIdx().get(f);
  if (direct) return mapped(direct, sub, audience);

  const seudah = /^(סעודת|seudas|seudat) (.+)$/.exec(f);
  if (seudah && sub === null) return lookupFoldedZman(seudah[2] as string, audience, "seudah");

  const month = /^(חודש|chodesh) (.+)$/.exec(f);
  if (month) {
    const key = MONTH_OCCASION[month[2] as string];
    const o = key ? occasionByKeyOf(key) : null;
    if (o) return mapped(o, sub, audience);
  }

  const rc = /^(רח|ראש חודש) (.+)$/.exec(f);
  if (rc) {
    const o = occasionByKeyOf(`rosh-chodesh-${MONTH_OCCASION[rc[2] as string] ?? "-"}`);
    if (o) return mapped(o, sub, audience);
  }
  return unmapped(audience);
}
