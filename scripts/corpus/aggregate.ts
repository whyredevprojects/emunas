// Corpus stage, step 0: gather raw material from every finished shiur for the taxonomy,
// glossary, entity, story and clustering agents. Pure code, no LLM.
//
// Reads (read-only): data/derived/manifest.json (status "done" only), data/derived/ingest.json,
//   data/derived/shiurim/<id>/extraction.json
// Writes: data/derived/corpus/raw/{topics,concepts,people,works,stories,insights}.json
//         data/derived/corpus/raw/digests/chunk-NN.json (40 shiurim each, manifest order)
//
// Usage: npx tsx scripts/corpus/aggregate.ts   (npm run corpus:aggregate)

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Extraction, IngestOutput, Shiur } from "../../src/types.js";
import { MANIFEST_PATH, SHIURIM_DIR, type ManifestEntry } from "../lib/manifest.js";

const INGEST_PATH = "data/derived/ingest.json";
const OUT_DIR = "data/derived/corpus/raw";
const DIGEST_DIR = join(OUT_DIR, "digests");
const CHUNK_SIZE = 40;
const SAMPLE_TITLES = 5;
const SAMPLE_REFS = 8;
const SAMPLE_HEARD = 12;
const RETELLING_MAX = 400;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 1) + "\n");
}

const norm = (s: string): string => s.normalize("NFC").replace(/\s+/g, " ").trim();
const normLower = (s: string): string => norm(s).toLowerCase();

/** Accumulator for one grouped key. */
interface Bucket {
  key: string;
  count: number;
  shiurIds: Set<string>;
  heardAs: Map<string, number>;
}

function bucket(map: Map<string, Bucket>, key: string): Bucket {
  let b = map.get(key);
  if (!b) {
    b = { key, count: 0, shiurIds: new Set(), heardAs: new Map() };
    map.set(key, b);
  }
  return b;
}

function addHeard(b: Bucket, h: string): void {
  const v = norm(h);
  if (v) b.heardAs.set(v, (b.heardAs.get(v) ?? 0) + 1);
}

const heardList = (b: Bucket): string[] => [...b.heardAs.entries()].sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0])).map(([h]) => h);
const byCount = <T extends { count: number; key?: string }>(a: T, c: T): number => c.count - a.count;

function shiurTitle(s: Shiur | undefined): string {
  if (!s) return "";
  const t = s.catalog.heading ? `${s.catalog.heading}: ${s.catalog.titleOriginal}` : s.catalog.titleOriginal;
  return norm(s.catalog.subTitle ? `${t} (${s.catalog.subTitle})` : t);
}

function main(): void {
  const manifest = readJson<{ entries: ManifestEntry[] }>(MANIFEST_PATH);
  const ingest = readJson<IngestOutput>(INGEST_PATH);
  const shiurById = new Map(ingest.shiurim.map((s) => [s.id, s]));

  const done = manifest.entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.status === "done")
    .sort((a, b) => a.e.order - b.e.order || a.i - b.i)
    .map(({ e }) => e);

  const topics = new Map<string, Bucket>();
  const concepts = new Map<string, Bucket>();
  const people = new Map<string, Bucket & { fromStories: number; fromPeople: number }>();
  const works = new Map<string, Bucket & { refs: Map<string, number>; resolution: Record<string, number> }>();
  const nullWork = { count: 0, shiurIds: new Set<string>(), heardAs: new Map<string, number>(), resolution: {} as Record<string, number> };
  const stories: unknown[] = [];
  const insights: unknown[] = [];
  const digests: unknown[] = [];
  const missing: string[] = [];
  const resolutionTotals: Record<string, number> = {};

  for (const entry of done) {
    const id = entry.shiurId;
    const path = join(SHIURIM_DIR, id, "extraction.json");
    if (!existsSync(path)) {
      missing.push(id);
      continue;
    }
    const x = readJson<Extraction>(path);
    const s = shiurById.get(id);

    for (const t of x.candidateTopics ?? []) {
      const k = normLower(t);
      if (!k) continue;
      const b = bucket(topics, k);
      b.count++;
      b.shiurIds.add(id);
    }

    for (const c of x.concepts ?? []) {
      const k = norm(c.he);
      if (!k) continue;
      const b = bucket(concepts, k);
      b.count++;
      b.shiurIds.add(id);
      for (const h of c.heardAs ?? []) addHeard(b, h);
    }

    const personBucket = (name: string) => {
      const k = norm(name);
      let p = people.get(k);
      if (!p) {
        p = { ...bucket(new Map(), k), fromStories: 0, fromPeople: 0 };
        people.set(k, p);
      }
      return p;
    };
    for (const p of x.people ?? []) {
      if (!norm(p.name)) continue;
      const b = personBucket(p.name);
      b.count++;
      b.fromPeople++;
      b.shiurIds.add(id);
      for (const h of p.heardAs ?? []) addHeard(b, h);
    }

    (x.stories ?? []).forEach((st, storyIndex) => {
      for (const name of st.people ?? []) {
        if (!norm(name)) continue;
        const b = personBucket(name);
        b.count++;
        b.fromStories++;
        b.shiurIds.add(id);
      }
      const ret = norm(st.retelling?.en ?? "");
      stories.push({
        shiurId: id,
        storyIndex,
        title: { en: norm(st.title?.en ?? "") },
        people: st.people ?? [],
        retelling: { en: ret.length > RETELLING_MAX ? ret.slice(0, RETELLING_MAX - 1).trimEnd() + "…" : ret },
      });
    });

    (x.insights ?? []).forEach((ins, insightIndex) => {
      insights.push({ shiurId: id, insightIndex, text: { en: norm(ins.text?.en ?? "") } });
    });

    for (const src of x.sources ?? []) {
      resolutionTotals[src.resolution] = (resolutionTotals[src.resolution] ?? 0) + 1;
      if (src.work && norm(src.work)) {
        const k = norm(src.work);
        let w = works.get(k);
        if (!w) {
          w = { ...bucket(new Map(), k), refs: new Map(), resolution: {} };
          works.set(k, w);
        }
        w.count++;
        w.shiurIds.add(id);
        addHeard(w, src.heardAs);
        if (src.ref) w.refs.set(norm(src.ref), (w.refs.get(norm(src.ref)) ?? 0) + 1);
        w.resolution[src.resolution] = (w.resolution[src.resolution] ?? 0) + 1;
      } else {
        nullWork.count++;
        nullWork.shiurIds.add(id);
        const h = norm(src.heardAs);
        if (h) nullWork.heardAs.set(h, (nullWork.heardAs.get(h) ?? 0) + 1);
        nullWork.resolution[src.resolution] = (nullWork.resolution[src.resolution] ?? 0) + 1;
      }
    }

    digests.push({
      shiurId: id,
      lang: entry.lang,
      catalogTitle: shiurTitle(s),
      seriesId: s?.seriesId ?? null,
      parsha: s?.parsha ?? null,
      zman: s?.zman ?? null,
      oneLiner: { en: x.summary.oneLiner.en },
      abstract: { en: x.summary.abstract.en },
      keyPoints: { en: x.summary.keyPoints.map((k) => k.text.en) },
      candidateTopics: x.candidateTopics ?? [],
      sections: x.sections.map((sec, index) => ({ index, title: { en: sec.title.en }, summary: { en: sec.summary.en }, kind: sec.kind })),
    });
  }

  const titleSamples = (ids: Set<string>) => [...ids].slice(0, SAMPLE_TITLES).map((i) => shiurTitle(shiurById.get(i)));

  const topicsOut = [...topics.values()].sort((a, b) => byCount(a, b) || a.key.localeCompare(b.key)).map((b) => ({
    phrase: b.key,
    count: b.count,
    shiurIds: [...b.shiurIds],
    sampleTitles: titleSamples(b.shiurIds),
  }));

  const conceptsOut = [...concepts.values()].sort((a, b) => byCount(a, b) || a.key.localeCompare(b.key)).map((b) => ({
    he: b.key,
    count: b.count,
    heardAs: heardList(b),
    shiurIds: [...b.shiurIds],
  }));

  const peopleOut = [...people.values()].sort((a, b) => byCount(a, b) || a.key.localeCompare(b.key)).map((b) => ({
    name: b.key,
    count: b.count,
    fromPeople: b.fromPeople,
    fromStories: b.fromStories,
    heardAs: heardList(b),
    shiurIds: [...b.shiurIds],
  }));

  const worksOut = {
    resolutionTotals,
    nullWork: {
      count: nullWork.count,
      shiurCount: nullWork.shiurIds.size,
      resolution: nullWork.resolution,
      heardAsSamples: [...nullWork.heardAs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200).map(([h, n]) => ({ heardAs: h, count: n })),
    },
    works: [...works.values()].sort((a, b) => byCount(a, b) || a.key.localeCompare(b.key)).map((w) => ({
      work: w.key,
      count: w.count,
      shiurIds: [...w.shiurIds],
      resolution: w.resolution,
      sampleRefs: [...w.refs.entries()].sort((a, b) => b[1] - a[1]).slice(0, SAMPLE_REFS).map(([r]) => r),
      heardAsSamples: heardList(w).slice(0, SAMPLE_HEARD),
    })),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  if (existsSync(DIGEST_DIR)) rmSync(DIGEST_DIR, { recursive: true });
  mkdirSync(DIGEST_DIR, { recursive: true });

  writeJson(join(OUT_DIR, "topics.json"), topicsOut);
  writeJson(join(OUT_DIR, "concepts.json"), conceptsOut);
  writeJson(join(OUT_DIR, "people.json"), peopleOut);
  writeJson(join(OUT_DIR, "works.json"), worksOut);
  writeJson(join(OUT_DIR, "stories.json"), stories);
  writeJson(join(OUT_DIR, "insights.json"), insights);

  const chunkNames: string[] = [];
  for (let i = 0; i < digests.length; i += CHUNK_SIZE) {
    const name = `chunk-${String(i / CHUNK_SIZE + 1).padStart(2, "0")}.json`;
    writeJson(join(DIGEST_DIR, name), digests.slice(i, i + CHUNK_SIZE));
    chunkNames.push(name);
  }

  const summary = {
    shiurim: digests.length,
    missingExtraction: missing,
    uniqueTopics: topicsOut.length,
    uniqueConcepts: conceptsOut.length,
    uniquePeople: peopleOut.length,
    uniqueWorks: worksOut.works.length,
    sources: Object.values(resolutionTotals).reduce((a, b) => a + b, 0),
    nullWorkSources: nullWork.count,
    stories: stories.length,
    insights: insights.length,
    chunks: chunkNames.length,
    chunkNames,
  };
  console.log(JSON.stringify(summary, null, 1));
  if (readdirSync(DIGEST_DIR).length !== chunkNames.length) throw new Error("digest dir mismatch");
}

main();
