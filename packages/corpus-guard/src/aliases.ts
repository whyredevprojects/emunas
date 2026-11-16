/**
 * Alias checks of the post-pass (corpus-wave-plan §1 rule 1, §3.4):
 *
 *  - **Raw ban.** A string in an alias-bearing position that folds equal to an ASR variant from
 *    the corpus `raw/asr-variants.json` and is not also a display name of its entity is a finding.
 *  - **Alias-key assertion.** Every `(kind, id, term)` published in an alias-bearing position must
 *    be in that entity's display-field set, read here independently from
 *    `data/derived/corpus/{topics,concepts,people,works}.json` (never from `.corpus`).
 *
 * Display fields: topic `label.{en,yi,he}` + `aliases`; concept `canonicalHe`, `label.{en,yi}`,
 * `transliterations`; person `nameHe/En/Yi` + `aliases`; work `titleHe`, `titleEn`,
 * `sefariaIndexTitle` + `aliases`. Terms compare after `fold` (@emunas/normalize), the same fold
 * the layer's synonyms.json and the search code use.
 *
 *  - **Story names** (C3.1). In story files (`.corpus/layer/stories.json`, Live
 *    `story/<id>.json` and `stories-index.json`) every person name (`people[].name`, `names`) and,
 *    on built pages, every element marked `data-story-person` must be a display name of some corpus
 *    entity: an unresolved raw extraction name may be an ASR spelling and is never published
 *    (`asr-variant` when it is one, else `not-entity-name`).
 *
 *  - **Shiur names** (F.1). In shiur files (`.corpus/shiurim/<id>.json`, Live `shiur/<id>.json`)
 *    every person name (a string in a `people` list, a `people[].name`, a `people[].label.*`) and
 *    every concept name (`concepts[].he`); in search docs (`SearchDoc`: `kind` "shiur" with a
 *    `titleOriginal`) every `people`/`concepts` string; in Pagefind records every name-bearing
 *    meta/filter key (`people`, `person`, `names`, `concepts`, `labelHe/En/Yi`); in entity rows
 *    (an object with an entity `kind` and `id`: quick-index entities, EntityDocs) every `labels.*`;
 *    and on built pages every element marked `data-person` (its first `<bdi>`, else its text) must
 *    be a display name of a corpus entity (of that entity when the position names one). The
 *    extraction's raw names may be ASR mishearings: names reach the sites only through the layer.
 *
 * This package is the only site code that reads the variant dump, and only to detect leaks, the
 * same way it reads transcripts. Findings carry entity ids, field paths and counts, never a term.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fold } from "@emunas/normalize";

/** JSON keys whose strings are aliases or search synonyms of an entity. */
export const ALIAS_KEYS = ["aliases", "synonyms", "transliterations", "names", "terms"] as const;

export const ENTITY_KINDS = ["topic", "concept", "person", "work"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export function isEntityKind(k: unknown): k is EntityKind {
  return typeof k === "string" && (ENTITY_KINDS as readonly string[]).includes(k);
}

/** The ASR variant dump inside the corpus data folder (only this package may name it). */
export const ASR_VARIANTS_FILE = "raw/asr-variants.json";

/** Default corpus data folder, relative to the repo root. */
export const DEFAULT_CORPUS_DATA_DIR = "data/derived/corpus";

const VARIANT_KIND: Record<string, EntityKind> = { concepts: "concept", people: "person", works: "work", topics: "topic" };

export type AliasRule = "asr-variant" | "not-display-field" | "unknown-entity" | "not-entity-name";

export interface AliasVerdict {
  rule: AliasRule;
}

type J = Record<string, unknown>;

function isRecord(v: unknown): v is J {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function strs(...xs: unknown[]): string[] {
  return xs.flatMap((x) => (typeof x === "string" ? [x] : Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : []));
}

function folded(xs: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const x of xs) {
    const f = fold(x);
    if (f !== "") out.add(f);
  }
  return out;
}

function readArray(file: string): J[] {
  const v: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(v)) throw new Error(`${file}: expected an array of records`);
  return v.filter(isRecord);
}

/** Display-field strings of one entity record of `kind` (raw, not folded). */
export function displayFields(kind: EntityKind, r: J): string[] {
  const label = isRecord(r.label) ? r.label : {};
  switch (kind) {
    case "topic":
      return strs(label.en, label.yi, label.he, r.aliases);
    case "concept":
      return strs(r.canonicalHe, label.en, label.yi, r.transliterations);
    case "person":
      return strs(r.nameHe, r.nameEn, r.nameYi, r.aliases);
    case "work":
      return strs(r.titleHe, r.titleEn, r.sefariaIndexTitle, r.aliases);
  }
}

export class AliasRules {
  /** kind → id → folded display terms. */
  readonly display: ReadonlyMap<EntityKind, ReadonlyMap<string, ReadonlySet<string>>>;
  /** Every folded display term of every entity. */
  private readonly anyDisplay: ReadonlySet<string>;
  /** Folded ASR variants (any entity). */
  private readonly variants: ReadonlySet<string>;

  constructor(display: Map<EntityKind, Map<string, Set<string>>>, variants: Iterable<string>) {
    this.display = display;
    const any = new Set<string>();
    for (const m of display.values()) for (const set of m.values()) for (const t of set) any.add(t);
    this.anyDisplay = any;
    this.variants = folded([...variants]);
  }

  /**
   * Read the four entity files and the variant dump from the corpus data folder. A missing entity
   * file means no display names for that kind; a missing variant dump means an empty ban list.
   */
  static read(corpusDataDir: string): AliasRules {
    if (!existsSync(corpusDataDir)) throw new Error(`corpus data folder not found: ${corpusDataDir}`);
    const display = new Map<EntityKind, Map<string, Set<string>>>();
    const files: Record<EntityKind, string> = { topic: "topics.json", concept: "concepts.json", person: "people.json", work: "works.json" };
    for (const kind of ENTITY_KINDS) {
      const m = new Map<string, Set<string>>();
      const file = join(corpusDataDir, files[kind]);
      if (existsSync(file)) {
        for (const r of readArray(file)) if (typeof r.id === "string") m.set(r.id, folded(displayFields(kind, r)));
      }
      display.set(kind, m);
    }
    return new AliasRules(display, readAsrVariants(corpusDataDir));
  }

  /** Verdict for one published alias term (null: fine). `entity` null when the position names no entity. */
  check(entity: { kind: EntityKind; id: string } | null, term: string): AliasVerdict | null {
    const f = fold(term);
    if (f === "") return null;
    if (entity === null) {
      if (this.anyDisplay.has(f)) return null;
      return this.variants.has(f) ? { rule: "asr-variant" } : null;
    }
    const set = this.display.get(entity.kind)?.get(entity.id);
    if (set?.has(f)) return null;
    if (this.variants.has(f)) return { rule: "asr-variant" };
    return { rule: set === undefined ? "unknown-entity" : "not-display-field" };
  }

  /**
   * Verdict for a published person name on a story (a story file or page): it must be a display
   * name of some corpus entity (null: fine).
   */
  checkName(term: string): AliasVerdict | null {
    const f = fold(term);
    if (f === "" || this.anyDisplay.has(f)) return null;
    return { rule: this.variants.has(f) ? "asr-variant" : "not-entity-name" };
  }
}

/**
 * Every variant string of the dump (`{ concepts|people|works|topics: { <id>: string[] } }`, read
 * defensively: unknown groups and non-string entries are skipped). Missing file → none.
 */
export function readAsrVariants(corpusDataDir: string): string[] {
  const file = join(corpusDataDir, ASR_VARIANTS_FILE);
  if (!existsSync(file)) return [];
  const v: unknown = JSON.parse(readFileSync(file, "utf8"));
  const out: string[] = [];
  const take = (group: unknown) => {
    if (!isRecord(group)) return;
    for (const list of Object.values(group)) out.push(...strs(list));
  };
  if (isRecord(v)) {
    const known = Object.keys(v).filter((k) => k in VARIANT_KIND);
    if (known.length > 0) for (const k of known) take(v[k]);
    else take(v);
  }
  return out;
}

/** Terms inside an alias-bearing value: a string (split on `|` and newlines), or nested arrays of them. */
export function aliasTerms(value: unknown): string[] {
  if (typeof value === "string") return value.split(/[|\n]/).filter((t) => t.trim() !== "");
  if (Array.isArray(value)) return value.flatMap((x) => (typeof x === "string" || Array.isArray(x) ? aliasTerms(x) : []));
  return [];
}

/** Entity kind implied by a layer file (`.corpus/layer/people.json` → person), else null. */
export function entityKindOfFile(path: string): EntityKind | null {
  const parts = path.split(/[\\/]/);
  const name = parts.at(-1) ?? "";
  if (parts.at(-2) !== "layer") return null;
  const m: Record<string, EntityKind> = { "topics.json": "topic", "concepts.json": "concept", "people.json": "person", "works.json": "work" };
  return m[name] ?? null;
}

/**
 * A file whose person names are story names (checked with `AliasRules.checkName`): the layer's
 * `stories.json`, and Live's `story/<id>.json` and `stories-index.json`.
 */
export function isStoryNamesFile(path: string): boolean {
  const parts = path.split(/[\\/]/);
  const name = parts.at(-1) ?? "";
  if (name === "stories-index.json") return true;
  if (parts.at(-2) === "layer" && name === "stories.json") return true;
  return parts.at(-2) === "story" && name.endsWith(".json");
}

/** Attribute that marks a story person's name on a built page (Quiet story pages). */
export const STORY_PERSON_ATTR = "data-story-person";

/** Text of every element carrying `data-story-person` (inner tags stripped; entities are left to the caller). */
export function markedStoryNames(html: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*\\s${STORY_PERSON_ATTR}(?=[\\s=/>])(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?[^>]*>([\\s\\S]*?)</\\1\\s*>`, "g");
  for (const m of html.matchAll(re)) {
    const text = (m[2] ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (text !== "") out.push(text);
  }
  return out;
}

/** Attribute that marks a person's name on a built page (`data-person="<person id>"`). */
export const PERSON_ATTR = "data-person";

/**
 * Every element carrying `data-person`: its value (the person id, may be "") and its name, the
 * text of the first `<bdi>` inside it, else its whole text (inner tags stripped; entities are left
 * to the caller). An element whose name is empty is skipped.
 */
export function markedPersonNames(html: string): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  const re = new RegExp(
    `<([a-zA-Z][a-zA-Z0-9]*)\\b([^>]*\\s${PERSON_ATTR}(?=[\\s=/>])(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?[^>]*)>([\\s\\S]*?)</\\1\\s*>`,
    "g",
  );
  const attrRe = new RegExp(`\\s${PERSON_ATTR}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?`);
  for (const m of html.matchAll(re)) {
    const a = attrRe.exec(m[2] ?? "");
    const id = (a?.[1] ?? a?.[2] ?? a?.[3] ?? "").trim();
    const inner = m[3] ?? "";
    const bdi = /<bdi\b[^>]*>([\s\S]*?)<\/bdi\s*>/.exec(inner);
    const name = (bdi ? bdi[1]! : inner).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (name !== "") out.push({ id, name });
  }
  return out;
}

/**
 * A shiur file whose names are checked (F.1): `.corpus/shiurim/<id>.json` and Live
 * `shiur/<id>.json` (not the layer's `layer/shiur/<id>.json`, which holds ids only).
 */
export function isShiurNamesFile(path: string): boolean {
  const parts = path.split(/[\\/]/);
  const name = parts.at(-1) ?? "";
  if (!name.endsWith(".json")) return false;
  const dir = parts.at(-2);
  if (dir === "shiurim") return true;
  return dir === "shiur" && parts.at(-3) !== "layer";
}

/** Meta/filter keys of a Pagefind record whose values are names. */
export const PAGEFIND_NAME_KEYS = ["people", "person", "names", "concepts"] as const;
/** Meta keys of a Pagefind entity record whose values are its entity's display labels. */
export const PAGEFIND_LABEL_KEYS = ["labelHe", "labelEn", "labelYi"] as const;
