// Corpus stage: link every done shiur to the frozen glossary and entity lists. Pure code, no LLM.
//
// For each done shiur, resolves extraction.concepts[].he, extraction.people[].name +
// extraction.stories[].people[] and extraction.sources[].work through the alias maps
// (keys are the raw extraction strings, normalized exactly as scripts/corpus/aggregate.ts does:
// NFC, whitespace collapsed, trimmed, case kept). Concepts additionally fall back to a
// nikud/geresh-insensitive match of the Hebrew spelling.
// people-alias-map values are a person id or a list of person ids (a compound key such as
// "Nadav and Avihu" names several persons). raw/people-shiur-overrides.json ({shiurId: {rawName: id | ids}})
// overrides the corpus-wide key for one shiur, where that shiur's extraction means someone else
// (e.g. "the Belzer Rav" heard as the Bluzhever).
//
// Reads (read-only): data/derived/manifest.json, data/derived/shiurim/<id>/extraction.json,
//   data/derived/corpus/raw/{concept,people,works}-alias-map.json, raw/people-shiur-overrides.json,
//   data/derived/corpus/{concepts,people,works}.json
// Writes: data/derived/corpus/raw/links/<shiurId>.json  (ShiurLinks)
//         data/derived/corpus/{concepts,people,works}.json  (only the shiurIds field, only when it disagrees
//         with the links; entity order and every other field are kept)
//
// Usage: npx tsx scripts/corpus/link.ts   (npm run corpus:link)

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Concept, Person, ShiurTags, Work } from "../../src/corpus-types.js";
import type { Extraction } from "../../src/types.js";
import { MANIFEST_PATH, SHIURIM_DIR, type ManifestEntry } from "../lib/manifest.js";

const CORPUS_DIR = "data/derived/corpus";
const LINKS_DIR = join(CORPUS_DIR, "raw", "links");

/** Per-shiur entity links; the id fields of ShiurTags. */
export type ShiurLinks = Pick<ShiurTags, "shiurId" | "conceptIds" | "personIds" | "workIds" | "sourceWorkIds">;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 1) + "\n");
}

/** Same normalization aggregate.ts used to build the raw keys the alias maps are keyed by. */
const norm = (s: string): string => s.normalize("NFC").replace(/\s+/g, " ").trim();
/** Hebrew spelling without nikud/taamim and quote marks, for a looser concept match. */
const stripHe = (s: string): string => norm(s).replace(/[֑-ׇ]/g, "").replace(/["'׳״]/g, "");

interface Tally {
  mentions: number;
  mapped: number;
}
const tally = (): Tally => ({ mentions: 0, mapped: 0 });
const pct = (t: Tally): number => (t.mentions ? Math.round((t.mapped / t.mentions) * 10000) / 10000 : 0);

function main(): void {
  const manifest = readJson<{ entries: ManifestEntry[] }>(MANIFEST_PATH);
  const done = manifest.entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.status === "done")
    .sort((a, b) => a.e.order - b.e.order || a.i - b.i)
    .map(({ e }) => e.shiurId);

  const conceptMap = readJson<Record<string, string>>(join(CORPUS_DIR, "raw", "concept-alias-map.json"));
  type PersonAlias = string | string[];
  const peopleMap = readJson<Record<string, PersonAlias>>(join(CORPUS_DIR, "raw", "people-alias-map.json"));
  const overridesPath = join(CORPUS_DIR, "raw", "people-shiur-overrides.json");
  const peopleOverrides = existsSync(overridesPath)
    ? readJson<Record<string, Record<string, PersonAlias>>>(overridesPath)
    : {};
  const worksMap = readJson<Record<string, string>>(join(CORPUS_DIR, "raw", "works-alias-map.json"));

  const conceptsPath = join(CORPUS_DIR, "concepts.json");
  const peoplePath = join(CORPUS_DIR, "people.json");
  const worksPath = join(CORPUS_DIR, "works.json");
  const concepts = readJson<Concept[]>(conceptsPath);
  const people = readJson<Person[]>(peoplePath);
  const works = readJson<Work[]>(worksPath);
  const conceptIdSet = new Set(concepts.map((c) => c.id));
  const personIdSet = new Set(people.map((p) => p.id));
  const workIdSet = new Set(works.map((w) => w.id));

  // Fail loudly if a map points at an id the canon file does not have.
  const dangling = (name: string, m: Record<string, string | string[]>, ids: Set<string>): void => {
    const bad = [...new Set(Object.values(m).flat())].filter((v) => !ids.has(v));
    if (bad.length) throw new Error(`${name}: ${bad.length} alias targets missing from canon (${bad.slice(0, 5).join(", ")})`);
  };
  dangling("concept-alias-map", conceptMap, conceptIdSet);
  dangling("people-alias-map", peopleMap, personIdSet);
  for (const [sid, m] of Object.entries(peopleOverrides)) dangling(`people-shiur-overrides ${sid}`, m, personIdSet);
  dangling("works-alias-map", worksMap, workIdSet);

  // Loose Hebrew fallback for concepts: stripped alias keys and canonical spellings, kept only when unambiguous.
  const looseConcept = new Map<string, string | null>();
  const addLoose = (k: string, id: string): void => {
    if (!k) return;
    const prev = looseConcept.get(k);
    looseConcept.set(k, prev === undefined || prev === id ? id : null);
  };
  for (const [k, id] of Object.entries(conceptMap)) if (/[א-ת]/.test(k)) addLoose(stripHe(k), id);
  for (const c of concepts) addLoose(stripHe(c.canonicalHe), c.id);

  const resolveConcept = (he: string): string | null => {
    const k = norm(he);
    return conceptMap[k] ?? looseConcept.get(stripHe(k)) ?? null;
  };
  const resolvePerson = (shiurId: string, name: string): string[] => {
    const v = peopleOverrides[shiurId]?.[norm(name)] ?? peopleMap[norm(name)];
    return v === undefined ? [] : [v].flat();
  };
  const resolveWork = (work: string | null): string | null => (work && norm(work) ? (worksMap[norm(work)] ?? null) : null);

  const cT = tally();
  const pT = tally();
  const pPeopleT = tally();
  const pStoryT = tally();
  const sT = tally();
  const sNamedT = tally();
  let looseHits = 0;
  const missing: string[] = [];

  const conceptShiurs = new Map<string, Set<string>>();
  const personShiurs = new Map<string, Set<string>>();
  const workShiurs = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, id: string, shiurId: string): void => {
    let s = m.get(id);
    if (!s) m.set(id, (s = new Set()));
    s.add(shiurId);
  };

  if (existsSync(LINKS_DIR)) rmSync(LINKS_DIR, { recursive: true });
  mkdirSync(LINKS_DIR, { recursive: true });

  for (const shiurId of done) {
    const path = join(SHIURIM_DIR, shiurId, "extraction.json");
    if (!existsSync(path)) {
      missing.push(shiurId);
      continue;
    }
    const x = readJson<Extraction>(path);

    const conceptIds = new Set<string>();
    for (const c of x.concepts ?? []) {
      if (!norm(c.he)) continue;
      cT.mentions++;
      const id = resolveConcept(c.he);
      if (id) {
        cT.mapped++;
        if (!conceptMap[norm(c.he)]) looseHits++;
        conceptIds.add(id);
      }
    }

    const personIds = new Set<string>();
    const person = (name: string, sub: Tally): void => {
      if (!norm(name)) return;
      pT.mentions++;
      sub.mentions++;
      const ids = resolvePerson(shiurId, name);
      if (ids.length) {
        pT.mapped++;
        sub.mapped++;
        for (const id of ids) personIds.add(id);
      }
    };
    for (const p of x.people ?? []) person(p.name, pPeopleT);
    for (const st of x.stories ?? []) for (const name of st.people ?? []) person(name, pStoryT);

    const workIds = new Set<string>();
    const sourceWorkIds = (x.sources ?? []).map((src) => {
      sT.mentions++;
      const named = !!(src.work && norm(src.work));
      if (named) sNamedT.mentions++;
      const id = resolveWork(src.work);
      if (id) {
        sT.mapped++;
        sNamedT.mapped++;
        workIds.add(id);
      }
      return id;
    });

    const links: ShiurLinks = {
      shiurId,
      conceptIds: [...conceptIds].sort(),
      personIds: [...personIds].sort(),
      workIds: [...workIds].sort(),
      sourceWorkIds,
    };
    writeJson(join(LINKS_DIR, `${shiurId}.json`), links);
    for (const id of conceptIds) add(conceptShiurs, id, shiurId);
    for (const id of personIds) add(personShiurs, id, shiurId);
    for (const id of workIds) add(workShiurs, id, shiurId);
  }

  // shiurIds on the canon entities, in manifest order, from the actual links.
  const order = new Map(done.map((id, i) => [id, i]));
  const sortShiurs = (s: Set<string> | undefined): string[] => [...(s ?? [])].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && new Set(a).size === new Set([...a, ...b]).size;
  const sync = <T extends { id: string; shiurIds: string[] }>(path: string, items: T[], m: Map<string, Set<string>>) => {
    let changed = 0;
    let empty = 0;
    for (const it of items) {
      const next = sortShiurs(m.get(it.id));
      if (!next.length) empty++;
      if (!sameSet(it.shiurIds, next)) {
        it.shiurIds = next;
        changed++;
      }
    }
    if (changed) writeJson(path, items);
    return { entities: items.length, shiurIdsChanged: changed, withNoShiurim: empty };
  };
  const conceptSync = sync(conceptsPath, concepts, conceptShiurs);
  const peopleSync = sync(peoplePath, people, personShiurs);
  const worksSync = sync(worksPath, works, workShiurs);

  // Concept exampleRefs that no longer point at a linked shiur (reported, not changed).
  const strayRefs = concepts.reduce(
    (n, c) => n + c.exampleRefs.filter((r) => !conceptShiurs.get(c.id)?.has(r.shiurId)).length,
    0,
  );

  const written = readdirSync(LINKS_DIR).length;
  console.log(
    JSON.stringify(
      {
        shiurim: written,
        missingExtraction: missing,
        coverage: {
          concepts: { ...cT, share: pct(cT), viaLooseHebrewMatch: looseHits },
          people: { ...pT, share: pct(pT), fromPeople: { ...pPeopleT, share: pct(pPeopleT) }, fromStories: { ...pStoryT, share: pct(pStoryT) } },
          sources: { ...sT, share: pct(sT), withWorkName: { ...sNamedT, share: pct(sNamedT) } },
        },
        canonSync: { concepts: conceptSync, people: peopleSync, works: worksSync, conceptExampleRefsOutsideShiurIds: strayRefs },
      },
      null,
      1,
    ),
  );
}

main();
