// Corpus stage, P10 prep: group every extraction insight by the top-level topic of its shiur's
// highest-salience topic, so the teaching-cluster agents can work one topic group at a time.
// Pure code, no LLM.
//
// Reads (read-only): data/derived/corpus/raw/insights.json,
//   data/derived/corpus/topic-tags/*.json ({shiurim:[{shiurId, topics:[{id, salience}], ...}]}),
//   data/derived/corpus/topics.json (Topic[])
// Writes: data/derived/corpus/raw/insight-groups/<topLevelTopicId>.json
//   {topicId, insights:[{shiurId, insightIndex, text:{en}, shiurTopicIds}]}
//   A group over MAX_GROUP insights is split by second-level topic into <id>-1.json, <id>-2.json ...
//   (whole second-level buckets are packed together; a single bucket over the limit is chunked).
//   Split files also carry `part` (1-based) and `subtopicIds` (the level-2 ids they hold;
//   "<id>" itself stands for insights with no level-2 topic under that root).
//
// Usage: npx tsx scripts/corpus/group-insights.ts

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Topic } from "../../src/corpus-types.js";

const RAW_DIR = "data/derived/corpus/raw";
const INSIGHTS_PATH = join(RAW_DIR, "insights.json");
const TAGS_DIR = "data/derived/corpus/topic-tags";
const TOPICS_PATH = "data/derived/corpus/topics.json";
const OUT_DIR = join(RAW_DIR, "insight-groups");
const MAX_GROUP = 450;

interface RawInsight {
  shiurId: string;
  insightIndex: number;
  text: { en: string };
}

interface TagChunk {
  shiurim: { shiurId: string; topics: { id: string; salience: number }[] }[];
}

interface GroupedInsight {
  shiurId: string;
  insightIndex: number;
  text: { en: string };
  shiurTopicIds: string[];
}

interface GroupFile {
  topicId: string;
  part?: number;
  subtopicIds?: string[];
  insights: GroupedInsight[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 1) + "\n");
}

const topics = readJson<Topic[]>(TOPICS_PATH);
const topicById = new Map(topics.map((t) => [t.id, t]));

/** Ancestor chain from the topic up to its level-1 root (topic first). */
function chain(id: string): Topic[] {
  const out: Topic[] = [];
  let t = topicById.get(id);
  const seen = new Set<string>();
  while (t && !seen.has(t.id)) {
    seen.add(t.id);
    out.push(t);
    t = t.parentId ? topicById.get(t.parentId) : undefined;
  }
  return out;
}

const rootOf = (id: string): string | null => {
  const c = chain(id);
  const last = c[c.length - 1];
  return last && last.level === 1 ? last.id : null;
};

const level2Of = (id: string): string | null => chain(id).find((t) => t.level === 2)?.id ?? null;

// Shiur -> topics sorted by salience (desc; ties keep tag order), known topics only.
const shiurTopics = new Map<string, { id: string; salience: number }[]>();
let unknownTopicRefs = 0;
for (const f of readdirSync(TAGS_DIR).filter((n) => n.endsWith(".json")).sort()) {
  const chunk = readJson<TagChunk>(join(TAGS_DIR, f));
  for (const s of chunk.shiurim) {
    const known = s.topics.filter((t) => {
      const ok = topicById.has(t.id);
      if (!ok) unknownTopicRefs++;
      return ok;
    });
    const sorted = known.map((t, i) => ({ ...t, i })).sort((a, b) => b.salience - a.salience || a.i - b.i);
    shiurTopics.set(s.shiurId, sorted.map(({ id, salience }) => ({ id, salience })));
  }
}

interface Assigned {
  root: string;
  sub: string; // level-2 id, or the root id when none applies
  item: GroupedInsight;
}

const insights = readJson<RawInsight[]>(INSIGHTS_PATH);
const assigned: Assigned[] = [];
const unassigned: RawInsight[] = [];

for (const ins of insights) {
  const st = shiurTopics.get(ins.shiurId);
  const primary = st?.find((t) => rootOf(t.id) !== null);
  if (!st || !primary) {
    unassigned.push(ins);
    continue;
  }
  const root = rootOf(primary.id)!;
  // Second-level key: the primary topic's level-2 ancestor, else the shiur's most salient
  // topic under the same root that has one, else the root itself.
  const sub =
    level2Of(primary.id) ??
    st.map((t) => (rootOf(t.id) === root ? level2Of(t.id) : null)).find((x): x is string => x !== null) ??
    root;
  assigned.push({
    root,
    sub,
    item: { shiurId: ins.shiurId, insightIndex: ins.insightIndex, text: { en: ins.text.en }, shiurTopicIds: st.map((t) => t.id) },
  });
}

if (unassigned.length) {
  const ids = [...new Set(unassigned.map((u) => u.shiurId))];
  console.error(`Error: ${unassigned.length} insights from ${ids.length} shiurim have no usable topic tags: ${ids.slice(0, 10).join(", ")}`);
  process.exit(1);
}

const byRoot = new Map<string, Assigned[]>();
for (const a of assigned) {
  const list = byRoot.get(a.root) ?? [];
  list.push(a);
  byRoot.set(a.root, list);
}

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const written: { file: string; count: number }[] = [];
const orderKey = (a: Assigned, b: Assigned): number =>
  a.item.shiurId.localeCompare(b.item.shiurId) || a.item.insightIndex - b.item.insightIndex;

for (const root of [...byRoot.keys()].sort()) {
  const list = byRoot.get(root)!;
  if (list.length <= MAX_GROUP) {
    const file: GroupFile = { topicId: root, insights: [...list].sort(orderKey).map((a) => a.item) };
    writeJson(join(OUT_DIR, `${root}.json`), file);
    written.push({ file: `${root}.json`, count: list.length });
    continue;
  }
  // Split by second-level topic: bucket, chunk oversized buckets, then first-fit-decreasing pack.
  const buckets = new Map<string, Assigned[]>();
  for (const a of list) {
    const b = buckets.get(a.sub) ?? [];
    b.push(a);
    buckets.set(a.sub, b);
  }
  const pieces: { subs: string[]; items: Assigned[] }[] = [];
  for (const [sub, items] of buckets) {
    const sorted = [...items].sort(orderKey);
    for (let i = 0; i < sorted.length; i += MAX_GROUP) pieces.push({ subs: [sub], items: sorted.slice(i, i + MAX_GROUP) });
  }
  pieces.sort((a, b) => b.items.length - a.items.length || a.subs[0]!.localeCompare(b.subs[0]!));
  const bins: { subs: string[]; items: Assigned[] }[] = [];
  for (const p of pieces) {
    const bin = bins.find((b) => b.items.length + p.items.length <= MAX_GROUP);
    if (bin) {
      bin.items.push(...p.items);
      for (const s of p.subs) if (!bin.subs.includes(s)) bin.subs.push(s);
    } else bins.push({ subs: [...p.subs], items: [...p.items] });
  }
  bins.forEach((bin, i) => {
    const name = `${root}-${i + 1}.json`;
    const file: GroupFile = {
      topicId: root,
      part: i + 1,
      subtopicIds: [...bin.subs].sort(),
      insights: [...bin.items].sort((a, b) => a.sub.localeCompare(b.sub) || orderKey(a, b)).map((a) => a.item),
    };
    writeJson(join(OUT_DIR, name), file);
    written.push({ file: name, count: bin.items.length });
  });
}

const total = written.reduce((s, w) => s + w.count, 0);
for (const w of written) console.log(`${w.file.padEnd(40)} ${w.count}`);
console.log(`\n${insights.length} insights -> ${total} grouped in ${byRoot.size} top-level groups, ${written.length} files` +
  (unknownTopicRefs ? ` (${unknownTopicRefs} unknown topic refs in tags ignored)` : ""));
if (total !== insights.length) {
  console.error("Error: grouped count does not match insight count");
  process.exit(1);
}
