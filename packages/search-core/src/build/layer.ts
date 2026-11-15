/**
 * Reads the corpus layer (`.corpus/layer/`, corpus-wave-plan §3.3) for the search builders, and
 * checks its synonyms before anything is indexed (§1 rule 1, §3.6):
 *
 *  - Only `.corpus/layer/` is read here. Nothing in the corpus raw folder (alias maps, ASR
 *    variants) is ever opened by this package, nor the pipeline's per-section search dump.
 *  - `verifyDisplaySynonyms` re-derives each entity's display-field set from the corpus input,
 *    read through @emunas/corpus's allow-listed reader (`loadLayerInput`), and rejects the build when
 *    a synonym is not one of them. The same call asserts that the corpus policy keeps
 *    `search.asrVariants` false (D1).
 *
 * Errors name entity kinds, ids and counts, never a term.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fold } from "@emunas/normalize";
import {
  LAYER_DIR,
  LAYER_FILES,
  type LayerConceptsFile,
  type LayerPeopleFile,
  type LayerShiurRefs,
  type LayerStoriesFile,
  type LayerSynonymsFile,
  type LayerTopicsFile,
  type LayerWorksFile,
} from "@emunas/corpus/public";
import { loadLayerInput } from "@emunas/corpus/layer";
import { synonymKey, type SearchLayer, type SearchLayerTopic } from "../layer-types.ts";
import { ENTITY_DOC_KINDS, type EntityDocKind } from "../types.ts";

/** The layer files the search build reads (parsed), or null when the layer is off/absent. */
export interface LayerFiles {
  topics: LayerTopicsFile;
  concepts: LayerConceptsFile;
  people: LayerPeopleFile;
  works: LayerWorksFile;
  stories: LayerStoriesFile | null;
  synonyms: LayerSynonymsFile;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

/**
 * The layer files, or null when `.corpus/layer/` is missing or its layer.json says the layer is off.
 * Optional parts are read defensively (missing arrays read as empty).
 */
export function readLayerFiles(corpusDir: string): LayerFiles | null {
  const dir = join(corpusDir, LAYER_DIR);
  const infoPath = join(dir, LAYER_FILES.layer);
  if (!existsSync(infoPath)) return null;
  const info = readJson<{ enabled?: unknown }>(infoPath);
  if (info.enabled === false) return null;
  const opt = <T>(name: string): T | null => (existsSync(join(dir, name)) ? readJson<T>(join(dir, name)) : null);
  const topics = opt<Partial<LayerTopicsFile>>(LAYER_FILES.topics);
  const concepts = opt<Partial<LayerConceptsFile>>(LAYER_FILES.concepts);
  const people = opt<Partial<LayerPeopleFile>>(LAYER_FILES.people);
  const works = opt<Partial<LayerWorksFile>>(LAYER_FILES.works);
  const stories = opt<Partial<LayerStoriesFile>>(LAYER_FILES.stories);
  const synonyms = opt<Partial<LayerSynonymsFile>>(LAYER_FILES.synonyms);
  return {
    topics: { tree: arr(topics?.tree), detail: arr(topics?.detail) },
    concepts: { concepts: arr(concepts?.concepts) },
    people: { people: arr(people?.people) },
    works: { works: arr(works?.works) },
    stories: stories === null ? null : { stories: arr(stories.stories) },
    synonyms: { synonyms: arr(synonyms?.synonyms) },
  };
}

/** Listed on at least one site (facets, moment entities, EntityDocs). People of type other never are. */
export function facetIdSets(files: LayerFiles): Record<EntityDocKind, Set<string>> {
  return {
    topic: new Set(files.topics.tree.filter((t) => t.count > 0).map((t) => t.id)),
    concept: new Set(files.concepts.concepts.filter((c) => c.count > 0).map((c) => c.id)),
    person: new Set(
      files.people.people
        .filter((p) => p.count > 0 && p.excluded === null && p.type !== "other" && (p.listed?.quiet === true || p.listed?.live === true))
        .map((p) => p.id),
    ),
    work: new Set(files.works.works.filter((w) => w.count > 0).map((w) => w.id)),
  };
}

/** Build the in-memory layer for the builders; `shiurIds` limits which refs files are read. */
export function readSearchLayer(corpusDir: string, files: LayerFiles, shiurIds: Iterable<string>): SearchLayer {
  const facetIds = facetIdSets(files);
  const topics = new Map<string, SearchLayerTopic>();
  for (const t of files.topics.tree) {
    if (!facetIds.topic.has(t.id)) continue;
    topics.set(t.id, { en: t.label?.en ?? "", yi: t.label?.yi ?? "", he: t.label?.he ?? null });
  }
  const synonyms = new Map<string, readonly string[]>();
  for (const s of files.synonyms.synonyms) {
    if (!(ENTITY_DOC_KINDS as readonly string[]).includes(s.kind)) continue;
    synonyms.set(synonymKey(s.kind, s.id), arr<unknown>(s.terms).filter((x): x is string => typeof x === "string"));
  }
  const refs = new Map<string, LayerShiurRefs>();
  const refsDir = join(corpusDir, LAYER_DIR, LAYER_FILES.shiurDir);
  for (const id of shiurIds) {
    const p = join(refsDir, `${id}.json`);
    if (existsSync(p)) refs.set(id, readJson<LayerShiurRefs>(p));
  }
  const storyPeople = new Map<string, readonly string[]>();
  for (const st of files.stories?.stories ?? []) {
    const ids = arr<{ id?: unknown }>(st.people)
      .map((p) => (typeof p.id === "string" ? p.id : null))
      .filter((x): x is string => x !== null && facetIds.person.has(x));
    storyPeople.set(st.id, [...new Set(ids)].sort());
  }
  const sectionConcepts = new Map<string, string[]>();
  for (const c of files.concepts.concepts) {
    if (!facetIds.concept.has(c.id)) continue;
    for (const r of arr<{ momentId?: unknown }>(c.exampleRefs)) {
      if (typeof r.momentId !== "string") continue;
      const l = sectionConcepts.get(r.momentId) ?? [];
      if (!l.includes(c.id)) l.push(c.id);
      sectionConcepts.set(r.momentId, l);
    }
  }
  for (const l of sectionConcepts.values()) l.sort();
  return { topics, synonyms, refs, storyPeople, sectionConcepts, facetIds };
}

// ---------------------------------------------------------------- synonym check

export class SynonymCheckError extends Error {
  constructor(
    message: string,
    /** `<kind>:<id>` → number of offending terms (terms are never named). */
    readonly offenders: ReadonlyMap<string, number>,
  ) {
    super(message);
    this.name = "SynonymCheckError";
  }
}

type Rec = Record<string, unknown>;

function strs(...xs: unknown[]): string[] {
  return xs.flatMap((x) => (typeof x === "string" ? [x] : Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : []));
}

/** Display-field strings of one corpus input record (the same fields as corpus-guard's alias check). */
export function displayFieldsOf(kind: EntityDocKind, r: Rec): string[] {
  const label = (typeof r["label"] === "object" && r["label"] !== null ? r["label"] : {}) as Rec;
  switch (kind) {
    case "topic":
      return strs(label["en"], label["yi"], label["he"], r["aliases"]);
    case "concept":
      return strs(r["canonicalHe"], label["en"], label["yi"], r["transliterations"]);
    case "person":
      return strs(r["nameHe"], r["nameEn"], r["nameYi"], r["aliases"]);
    case "work":
      return strs(r["titleHe"], r["titleEn"], r["sefariaIndexTitle"], r["aliases"]);
  }
}

/** `<kind>:<id>` → folded display terms. */
export type DisplaySets = ReadonlyMap<string, ReadonlySet<string>>;

export function displaySetsOf(input: Record<"topics" | "concepts" | "people" | "works", readonly object[]>): DisplaySets {
  const out = new Map<string, Set<string>>();
  const groups: [EntityDocKind, readonly object[]][] = [
    ["topic", input.topics],
    ["concept", input.concepts],
    ["person", input.people],
    ["work", input.works],
  ];
  for (const [kind, records] of groups) {
    for (const r0 of records) {
      const r = r0 as Rec;
      if (typeof r["id"] !== "string") continue;
      out.set(synonymKey(kind, r["id"]), new Set(displayFieldsOf(kind, r).map((x) => fold(x)).filter((x) => x !== "")));
    }
  }
  return out;
}

/**
 * Display-field sets read from the corpus data through @emunas/corpus's allow-listed reader. Also
 * asserts D1: `corpus-policy.json` `search.asrVariants` must be false.
 */
export function loadDisplaySets(dataDir: string, policyDir: string): DisplaySets | null {
  const sources = loadLayerInput({ dataDir, policyDir });
  assertNoAsrVariants(sources.policy);
  const input = sources.corpus.input;
  if (input === null) return null;
  return displaySetsOf({ topics: input.topics, concepts: input.concepts, people: input.people, works: input.works });
}

/** D1: no code path reads ASR variants; a policy that asks for them stops the build. */
export function assertNoAsrVariants(policy: { search?: { asrVariants?: unknown } }): void {
  const v = policy.search?.asrVariants;
  if (v !== undefined && v !== false) {
    throw new Error("search:build: corpus-policy search.asrVariants must be false (D1: needs the evaluated server-side boost)");
  }
}

/** Every `(kind, id, term)` must be a folded display field of that entity; otherwise throw. */
export function verifyDisplaySynonyms(entries: Iterable<{ kind: string; id: string; terms: readonly string[] }>, display: DisplaySets): void {
  const offenders = new Map<string, number>();
  for (const e of entries) {
    const key = `${e.kind}:${e.id}`;
    const set = display.get(key);
    for (const t of e.terms) {
      const f = fold(t);
      if (f === "") continue;
      if (set === undefined || !set.has(f)) offenders.set(key, (offenders.get(key) ?? 0) + 1);
    }
  }
  if (offenders.size > 0) {
    const list = [...offenders].slice(0, 20).map(([k, n]) => `${k} (${n})`);
    throw new SynonymCheckError(
      `search:build: ${[...offenders.values()].reduce((a, b) => a + b, 0)} synonym(s) are not display fields of their entity: ${list.join(", ")}`,
      offenders,
    );
  }
}
