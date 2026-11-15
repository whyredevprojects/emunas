/**
 * People and concept keys. Never throw; unmapped names become their own deterministic key.
 */
import { buildAliasIndex } from "./alias-index.ts";
import { foldBasic, normalizeHe } from "./fold.ts";
import { slugify } from "./slug.ts";
import { CONCEPT_ALIASES, CONCEPT_STOP_LIST } from "./tables/concepts.ts";
import { PEOPLE, type Person } from "./tables/people.ts";

// ---------------- people ----------------

const HONORIFIC_SUFFIXES = new Set(["hamelech", "hanavi", "hatzaddik", "hatzadik", "hakadosh", "avinu", "imeinu", "rabbeinu", "haneviah", "hasofer"]);
const RABBI_PREFIXES = new Set(["rabbi", "rav", "reb", "r", "rebbi"]);
const TOKEN_SPELLINGS: Readonly<Record<string, string>> = { yisroel: "yisrael", sholom: "shalom", avrohom: "avraham", koritz: "koretz" };

function baseTokens(s: string): string[] {
  let tokens = foldBasic(s).split(" ").filter((t) => t.length > 0);
  if (tokens[0] === "the" && tokens.length > 1) tokens = tokens.slice(1);
  if (tokens.length > 1 && RABBI_PREFIXES.has(tokens[0] as string)) tokens[0] = "rabbi";
  return tokens.map((t) => TOKEN_SPELLINGS[t] ?? t);
}

/**
 * Exact matching form: foldBasic, leading "the" dropped, rabbinic prefixes unified
 * (R'/Reb/Rav/Rabbi → rabbi), a few token spellings unified (Yisroel → Yisrael). Parentheticals
 * and honorifics are kept, so "Shimon HaTzaddik" and "Shmuel (Amora)" can be told apart.
 */
export function personExactForm(raw: string): string {
  return baseTokens(raw).join(" ");
}

/**
 * Loose matching form: the exact form, plus a trailing parenthetical dropped, one honorific
 * suffix dropped (HaMelech, HaNavi, HaTzaddik, HaKadosh, Avinu, Imeinu, Rabbeinu…) and a final
 * "-ah" → "-a". Unmapped names are keyed by this form.
 */
export function personForm(raw: string): string {
  const noParen = raw.replace(/\s*\([^()]*\)\s*$/, "");
  let tokens = baseTokens(noParen.trim().length > 0 ? noParen : raw);
  if (tokens.length > 1 && HONORIFIC_SUFFIXES.has(tokens[tokens.length - 1] as string)) tokens = tokens.slice(0, -1);
  return tokens.map((t) => (t.length > 3 && t.endsWith("ah") ? t.slice(0, -1) : t)).join(" ");
}

let exactIndex: Map<string, Person> | null = null;
let looseIndex: Map<string, Person> | null = null;
let peopleByKey: Map<string, Person> | null = null;

function indexes(): { exact: Map<string, Person>; loose: Map<string, Person> } {
  const aliases = (p: Person): string[] => [...p.aliases, p.key.replace(/-/g, " ")];
  exactIndex ??= buildAliasIndex("people", PEOPLE, aliases, personExactForm);
  looseIndex ??= buildAliasIndex("people (loose)", PEOPLE.filter((p) => p.exactOnly !== true), aliases, personForm);
  return { exact: exactIndex, loose: looseIndex };
}

export function warmPeopleIndex(): void {
  indexes();
}

export interface PersonMatch {
  key: string;
  status: "mapped" | "unmapped";
  person: Person | null;
}

/** Person by key. */
export function personByKey(key: string): Person | null {
  peopleByKey ??= new Map(PEOPLE.map((p) => [p.key, p]));
  return peopleByKey.get(key) ?? null;
}

/** Map a person name (Extraction.people[].name, stories[].people[]). Exact aliases win over loose ones. */
export function lookupPerson(raw: string | null | undefined): PersonMatch {
  if (raw == null) return { key: "unknown", status: "unmapped", person: null };
  const f = personForm(raw);
  if (f.length === 0) return { key: "unknown", status: "unmapped", person: null };
  const { exact, loose } = indexes();
  const p = exact.get(personExactForm(raw)) ?? loose.get(f);
  if (p) return { key: p.key, status: "mapped", person: p };
  return { key: slugify(f), status: "unmapped", person: null };
}

// ---------------- concepts ----------------

let conceptCanon: Map<string, string> | null = null;
let stopSet: Set<string> | null = null;

function cIdx(): Map<string, string> {
  if (!conceptCanon) {
    const rows = Object.entries(CONCEPT_ALIASES).map(([canonical, variants]) => ({ key: foldBasic(canonical), canonical, variants }));
    const idx = buildAliasIndex("concepts", rows, (r) => [r.canonical, ...r.variants], foldBasic);
    conceptCanon = new Map([...idx.entries()].map(([f, r]) => [f, r.canonical]));
  }
  return conceptCanon;
}

export function warmConceptIndex(): void {
  cIdx();
}

export interface ConceptMatch {
  key: string;
  /** the canonical Hebrew term (after alias merging, nikud stripped) */
  he: string;
  /** true when an alias row merged this spelling into another */
  merged: boolean;
  /** on the stop-list: keep in shiur data, skip in indexes */
  stop: boolean;
}

/** Map a concept term (Extraction.concepts[].he). */
export function lookupConcept(raw: string | null | undefined): ConceptMatch {
  const n = foldBasic(raw ?? "");
  if (n.length === 0) return { key: "unknown", he: "", merged: false, stop: false };
  const canonical = cIdx().get(n);
  const he = canonical ?? normalizeHe(raw ?? "");
  stopSet ??= new Set(CONCEPT_STOP_LIST.map(foldBasic));
  const canonicalFolded = foldBasic(he);
  return {
    key: slugify(canonicalFolded),
    he,
    merged: canonical !== undefined && foldBasic(canonical) !== n,
    stop: stopSet.has(canonicalFolded),
  };
}

/** True when the term is on the concept stop-list. */
export function isStopConcept(raw: string): boolean {
  return lookupConcept(raw).stop;
}
