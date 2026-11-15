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

export type AliasRule = "asr-variant" | "not-display-field" | "unknown-entity";

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
 * The site-derived legacy aggregates at the top of `.corpus/` (people, concepts, works, stories,
 * entities). Their `names` are extraction spellings the sites have shipped since wave 2, not corpus
 * entity aliases, so their positions name no corpus entity and the raw ban does not apply to them.
 * C3.1 retires these files; drop this exemption with them.
 */
export const LEGACY_AGGREGATE_FILES = ["people.json", "concepts.json", "works.json", "stories.json", "entities.json"] as const;

export function isLegacyAggregateFile(path: string): boolean {
  const parts = path.split(/[\\/]/);
  return parts.at(-2) === ".corpus" && (LEGACY_AGGREGATE_FILES as readonly string[]).includes(parts.at(-1) ?? "");
}
