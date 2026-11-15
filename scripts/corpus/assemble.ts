// Corpus stage, final step: assemble the website-facing corpus files from the agent outputs,
// then run integrity checks. Pure code, no LLM.
//
// Reads (read-only): data/derived/manifest.json (status "done" only), data/derived/ingest.json,
//   data/derived/shiurim/<id>/{meta,extraction}.json,
//   data/derived/corpus/{topics,concepts,people,works,stories}.json, series/*.json,
//   data/derived/corpus/topic-tags/*.json ({shiurim: {shiurId, topics, sections}[]}),
//   data/derived/corpus/raw/links/<shiurId>.json ({shiurId, conceptIds, personIds, workIds, sourceWorkIds}),
//   data/derived/corpus/teaching-clusters/*.json (TeachingCluster[] per chunk)
// Writes: data/derived/corpus/shiur-tags/<shiurId>.json, topics.json (shiurCount, hubShiurIds),
//   teaching-clusters.json, search/sections.jsonl, index.json
//
// Topic descriptions are LLM work: level-1/2 topics whose description is still null are listed
// in index.json `pendingDescriptions` for a later pass; existing descriptions are kept.
//
// Usage: npx tsx scripts/corpus/assemble.ts   (npm run corpus:assemble)

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  Concept,
  CorpusIndex,
  Person,
  RedirectKind,
  Redirects,
  RedirectTarget,
  SearchSectionDoc,
  SeriesSynthesis,
  ShiurTags,
  Story,
  TeachingCluster,
  Topic,
  Work,
} from "../../src/corpus-types.js";
import type { Extraction, IngestOutput, Shiur } from "../../src/types.js";
import { MANIFEST_PATH, SHIURIM_DIR, type ManifestEntry } from "../lib/manifest.js";

const CORPUS = "data/derived/corpus";
const INGEST_PATH = "data/derived/ingest.json";
const CORPUS_VERSION = 2;
const HUB_SIZE = 10;
/** Salience given to a topic that a shiur carries only at section level (shiur-level tags are >= 0.1). */
const SECTION_ONLY_SALIENCE = 0.05;
/** Shiurim where another speaker takes at least this share of the time are left out of topic hubs. */
const OTHER_SPEAKER_HUB_MAX = 0.5;
const MAX_TOPICS = 8;
const MAX_SECTION_TOPICS = 3;
const EXCLUDED_KINDS = new Set(["noise", "singing"]);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface MetaRecording {
  recording: { id: string };
  starts: number[];
  ends: number[];
}
interface Meta {
  shiurId: string;
  shiur: Shiur;
  recordings: MetaRecording[];
}
interface TopicTagsChunk {
  shiurim: { shiurId: string; topics: { id: string; salience: number }[]; sections: { index: number; topicIds: string[] }[] }[];
}
interface LinkFile {
  shiurId: string;
  conceptIds?: string[];
  personIds?: string[];
  workIds?: string[];
  sourceWorkIds?: (string | null)[];
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const writeJson = (path: string, data: unknown): void => writeFileSync(path, JSON.stringify(data, null, 1) + "\n");
const jsonFiles = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];

// ---------- issue log ----------

const issues = new Map<string, string[]>();
function issue(kind: string, msg: string): void {
  let l = issues.get(kind);
  if (!l) issues.set(kind, (l = []));
  l.push(msg);
}
const notes: string[] = [];

// ---------- load ----------

const manifest = readJson<{ entries: ManifestEntry[] }>(MANIFEST_PATH);
const doneIds = manifest.entries.filter((e) => e.status === "done").map((e) => e.shiurId);
const doneSet = new Set(doneIds);
const ingest = readJson<IngestOutput>(INGEST_PATH);
const ingestSeries = new Map(ingest.series.map((s) => [s.id, s]));

const extractions = new Map<string, Extraction>();
const metas = new Map<string, Meta>();
for (const id of doneIds) {
  extractions.set(id, readJson<Extraction>(join(SHIURIM_DIR, id, "extraction.json")));
  metas.set(id, readJson<Meta>(join(SHIURIM_DIR, id, "meta.json")));
}

const topicsIn = readJson<Topic[]>(join(CORPUS, "topics.json"));
const concepts = readJson<Concept[]>(join(CORPUS, "concepts.json"));
const people = readJson<Person[]>(join(CORPUS, "people.json"));
const works = readJson<Work[]>(join(CORPUS, "works.json"));
const stories = readJson<Story[]>(join(CORPUS, "stories.json"));
const seriesFiles = jsonFiles(join(CORPUS, "series"));
const series = seriesFiles.map((f) => ({ file: f, data: readJson<SeriesSynthesis>(join(CORPUS, "series", f)) }));

// Story people: resolve raw names to person ids through people-alias-map (same normalization as
// aggregate/link; a value may list several persons for a compound key such as "Nadav and Avihu").
// Entries that are already person ids are kept as they are, so per-story corrections in stories.json
// (raw/story-people-fix.json) are never undone. Unresolved names stay as written. Rewrites stories.json
// in place (idempotent).
{
  const aliasPath = join(CORPUS, "raw", "people-alias-map.json");
  const alias = existsSync(aliasPath) ? readJson<Record<string, string | string[]>>(aliasPath) : {};
  const norm = (x: string): string => x.normalize("NFC").replace(/\s+/g, " ").trim();
  const known = new Set(people.map((p) => p.id));
  let changed = false;
  for (const st of stories) {
    const next = [...new Set(st.people.flatMap((n) => (known.has(n) ? [n] : [alias[norm(n)] ?? n].flat())))];
    if (next.join("\u0000") !== st.people.join("\u0000")) {
      st.people = next;
      changed = true;
    }
  }
  if (changed) writeJson(join(CORPUS, "stories.json"), stories);
}

// Series arcs: drop parts whose shiur is not done (e.g. needs_review), renumber, rewrite in place.
for (const { file, data } of series) {
  const kept = data.arc.filter((a) => doneSet.has(a.shiurId));
  if (kept.length !== data.arc.length) {
    notes.push(`series ${data.seriesId}: dropped non-done arc parts ${data.arc.filter((a) => !doneSet.has(a.shiurId)).map((a) => a.shiurId).join(", ")}`);
    data.arc = kept.map((a, i) => ({ ...a, part: i + 1 }));
    writeJson(join(CORPUS, "series", file), data);
  }
}

/** Build an id set for one entity kind, reporting duplicates and non-slug ids. */
function idSet(kind: string, ids: string[]): Set<string> {
  const s = new Set<string>();
  for (const id of ids) {
    if (!SLUG.test(id)) issue(`${kind}: non-slug id`, id);
    if (s.has(id)) issue(`${kind}: duplicate id`, id);
    s.add(id);
  }
  return s;
}
const topicIds = idSet("topics", topicsIn.map((t) => t.id));
const conceptIds = idSet("concepts", concepts.map((c) => c.id));
const personIds = idSet("people", people.map((p) => p.id));
const workIds = idSet("works", works.map((w) => w.id));
const storyIds = idSet("stories", stories.map((s) => s.id));

// ---------- shiur-tags ----------

const tagsIn = new Map<string, TopicTagsChunk["shiurim"][number]>();
for (const f of jsonFiles(join(CORPUS, "topic-tags"))) {
  for (const t of readJson<TopicTagsChunk>(join(CORPUS, "topic-tags", f)).shiurim) {
    if (tagsIn.has(t.shiurId)) issue("topic-tags: shiur tagged twice (later chunk wins)", `${t.shiurId} (${f})`);
    if (!doneSet.has(t.shiurId)) issue("topic-tags: shiur not done", `${t.shiurId} (${f})`);
    tagsIn.set(t.shiurId, t);
  }
}

/** Keep ids that resolve, report the rest. */
function resolveIds(kind: string, where: string, ids: string[] | undefined, valid: Set<string>): string[] {
  const out: string[] = [];
  for (const id of ids ?? []) {
    if (!valid.has(id)) {
      issue(`${kind}: unresolved id (dropped)`, `${where}: ${id}`);
      continue;
    }
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

const shiurTags = new Map<string, ShiurTags>();
const missingTopicTags: string[] = [];
const missingLinks: string[] = [];
for (const id of doneIds) {
  const ex = extractions.get(id)!;
  const t = tagsIn.get(id);
  if (!t) missingTopicTags.push(id);
  const linkPath = join(CORPUS, "raw/links", `${id}.json`);
  const link: LinkFile | null = existsSync(linkPath) ? readJson<LinkFile>(linkPath) : null;
  if (!link) missingLinks.push(id);

  const topics: ShiurTags["topics"] = [];
  for (const tp of t?.topics ?? []) {
    if (!topicIds.has(tp.id)) {
      issue("shiur-tags: unresolved topic id (dropped)", `${id}: ${tp.id}`);
      continue;
    }
    if (topics.some((x) => x.id === tp.id)) continue;
    const salience = Math.min(1, Math.max(0, Number(tp.salience) || 0));
    if (salience !== tp.salience) issue("shiur-tags: salience out of range (clamped)", `${id}: ${tp.id}=${tp.salience}`);
    topics.push({ id: tp.id, salience });
  }
  topics.sort((a, b) => b.salience - a.salience);
  if (topics.length > MAX_TOPICS) {
    issue("shiur-tags: more than 8 topics (truncated)", `${id}: ${topics.length}`);
    topics.length = MAX_TOPICS;
  }

  const sections: ShiurTags["sections"] = [];
  for (const s of t?.sections ?? []) {
    if (!Number.isInteger(s.index) || s.index < 0 || s.index >= ex.sections.length) {
      issue("shiur-tags: section index out of range (dropped)", `${id}#${s.index}`);
      continue;
    }
    if (sections.some((x) => x.index === s.index)) {
      issue("shiur-tags: duplicate section index (first kept)", `${id}#${s.index}`);
      continue;
    }
    let ids = resolveIds("shiur-tags sections", `${id}#${s.index}`, s.topicIds, topicIds);
    if (ids.length > MAX_SECTION_TOPICS) {
      issue("shiur-tags: more than 3 section topics (truncated)", `${id}#${s.index}`);
      ids = ids.slice(0, MAX_SECTION_TOPICS);
    }
    sections.push({ index: s.index, topicIds: ids });
  }
  sections.sort((a, b) => a.index - b.index);

  let sourceWorkIds: (string | null)[] = (link?.sourceWorkIds ?? []).map((w) => {
    if (w === null) return null;
    if (!workIds.has(w)) {
      issue("shiur-tags: unresolved sourceWorkId (nulled)", `${id}: ${w}`);
      return null;
    }
    return w;
  });
  if (sourceWorkIds.length !== ex.sources.length) {
    if (link) issue("shiur-tags: sourceWorkIds length != extraction.sources (padded/cut)", `${id}: ${sourceWorkIds.length} vs ${ex.sources.length}`);
    sourceWorkIds = ex.sources.map((_, i) => sourceWorkIds[i] ?? null);
  }

  // Share of the shiur's section duration given by another speaker (kind other_speaker).
  const recsById = new Map(metas.get(id)!.recordings.map((r) => [r.recording.id, r]));
  let total = 0;
  let other = 0;
  for (const sec of ex.sections) {
    const r = recsById.get(sec.recordingId);
    const a = r?.starts[sec.startSeg];
    const b = r?.ends[sec.endSeg];
    if (a === undefined || b === undefined) continue;
    total += b - a;
    if (sec.kind === "other_speaker") other += b - a;
  }
  shiurTags.set(id, {
    shiurId: id,
    otherSpeakerShare: total > 0 ? Math.round((other / total) * 100) / 100 : 0,
    topics,
    sections,
    conceptIds: resolveIds("shiur-tags concepts", id, link?.conceptIds, conceptIds),
    personIds: resolveIds("shiur-tags people", id, link?.personIds, personIds),
    workIds: resolveIds("shiur-tags works", id, link?.workIds, workIds),
    sourceWorkIds,
  });
}
if (missingTopicTags.length) notes.push(`shiurim without topic-tags (empty topics/sections): ${missingTopicTags.join(", ")}`);
if (missingLinks.length) notes.push(`shiurim without raw/links (empty concept/person/work ids): ${missingLinks.join(", ")}`);
for (const s of missingTopicTags) issue("shiur-tags: no topic-tags entry (empty arrays)", s);
for (const s of missingLinks) issue("shiur-tags: no raw/links file (empty arrays)", s);

const tagsDir = join(CORPUS, "shiur-tags");
rmSync(tagsDir, { recursive: true, force: true });
mkdirSync(tagsDir, { recursive: true });
for (const [id, t] of shiurTags) writeJson(join(tagsDir, `${id}.json`), t);

// ---------- redirects ----------
// Hand-kept map of retired ids -> the entity they were merged into, per kind. A string target is an
// id of the same kind; {kind, id} points at another kind (a retired person -> a concept). Checked here:
// the target must exist and the old id must not be live again.
const redirectsPath = join(CORPUS, "redirects.json");
const redirects: Redirects = existsSync(redirectsPath) ? readJson<Redirects>(redirectsPath) : {};
const liveIds: Record<RedirectKind, Set<string>> = {
  topics: topicIds,
  concepts: conceptIds,
  people: personIds,
  works: workIds,
  stories: storyIds,
};
for (const [kind, map] of Object.entries(redirects) as [string, Record<string, RedirectTarget>][]) {
  if (!(kind in liveIds)) {
    issue("redirects: unknown kind", kind);
    continue;
  }
  const k = kind as RedirectKind;
  for (const [from, to] of Object.entries(map)) {
    if (liveIds[k].has(from)) issue("redirects: retired id is live", `${k}: ${from}`);
    const tKind: string = typeof to === "string" ? k : to.kind;
    const tId = typeof to === "string" ? to : to.id;
    if (!(tKind in liveIds) || !liveIds[tKind as RedirectKind].has(tId)) issue("redirects: target missing", `${k}: ${from} -> ${tKind}:${tId}`);
  }
}

// ---------- topics ----------

const topicById = new Map(topicsIn.map((t) => [t.id, t]));
const children = new Map<string, string[]>();
for (const t of topicsIn) {
  if (t.parentId === null) {
    if (t.level !== 1) issue("topics: root topic not level 1", t.id);
    continue;
  }
  const p = topicById.get(t.parentId);
  if (!p) {
    issue("topics: unresolved parentId", `${t.id} -> ${t.parentId}`);
    continue;
  }
  if (t.level !== p.level + 1) issue("topics: level != parent level + 1", `${t.id} (${t.level}) parent ${p.id} (${p.level})`);
  const l = children.get(p.id) ?? [];
  l.push(t.id);
  children.set(p.id, l);
}
function subtree(id: string, seen = new Set<string>()): Set<string> {
  if (seen.has(id)) return seen;
  seen.add(id);
  for (const c of children.get(id) ?? []) subtree(c, seen);
  return seen;
}

// topic id -> shiurId -> salience (direct tags)
const direct = new Map<string, Map<string, number>>();
for (const t of shiurTags.values()) {
  for (const tp of t.topics) {
    let m = direct.get(tp.id);
    if (!m) direct.set(tp.id, (m = new Map()));
    m.set(t.shiurId, tp.salience);
  }
  // Section-level topics that are not shiur-level still put the shiur on the topic page, at the lowest salience.
  for (const sec of t.sections) {
    for (const tid of sec.topicIds) {
      let m = direct.get(tid);
      if (!m) direct.set(tid, (m = new Map()));
      if (!m.has(t.shiurId)) m.set(t.shiurId, SECTION_ONLY_SALIENCE);
    }
  }
}

const pendingDescriptions: string[] = [];
const topicsOut: Topic[] = topicsIn.map((t) => {
  // Best salience per shiur over the subtree; direct tags win ties over descendant tags.
  const best = new Map<string, { sal: number; direct: boolean }>();
  for (const tid of subtree(t.id)) {
    for (const [sid, sal] of direct.get(tid) ?? []) {
      const isDirect = tid === t.id;
      const cur = best.get(sid);
      if (!cur || sal > cur.sal || (sal === cur.sal && isDirect && !cur.direct)) best.set(sid, { sal, direct: isDirect });
    }
  }
  const hubShiurIds = [...best.entries()]
    .filter(([sid]) => (shiurTags.get(sid)?.otherSpeakerShare ?? 0) < OTHER_SPEAKER_HUB_MAX)
    .sort((a, b) => b[1].sal - a[1].sal || Number(b[1].direct) - Number(a[1].direct) || a[0].localeCompare(b[0]))
    .slice(0, HUB_SIZE)
    .map(([sid]) => sid);
  if (best.size === 0) issue("topics: no tagged shiurim (shiurCount 0)", t.id);
  if (t.level <= 2 && t.description === null) pendingDescriptions.push(t.id);
  const sameAs: Topic["sameAs"] = {};
  if (conceptIds.has(t.id)) sameAs.conceptId = t.id;
  if (personIds.has(t.id)) sameAs.personId = t.id;
  if (workIds.has(t.id)) sameAs.workId = t.id;
  const { sameAs: _old, ...rest } = t;
  return { ...rest, ...(Object.keys(sameAs).length ? { sameAs } : {}), shiurCount: best.size, hubShiurIds };
});
topicsOut.sort((a, b) => a.level - b.level || a.label.en.localeCompare(b.label.en));
writeJson(join(CORPUS, "topics.json"), topicsOut);

// ---------- teaching clusters ----------

const clustersOut: TeachingCluster[] = [];
const clusterIds = new Set<string>();
for (const f of jsonFiles(join(CORPUS, "teaching-clusters"))) {
  for (const c of readJson<TeachingCluster[]>(join(CORPUS, "teaching-clusters", f))) {
    if (!SLUG.test(c.id)) issue("teaching-clusters: non-slug id", c.id);
    if (clusterIds.has(c.id)) {
      issue("teaching-clusters: duplicate id (later dropped)", `${c.id} (${f})`);
      continue;
    }
    const members = c.members.filter((m) => {
      const ex = extractions.get(m.shiurId);
      if (!ex) {
        issue("teaching-clusters: member shiur not done/unknown (dropped)", `${c.id}: ${m.shiurId}`);
        return false;
      }
      if (!Number.isInteger(m.insightIndex) || m.insightIndex < 0 || m.insightIndex >= ex.insights.length) {
        issue("teaching-clusters: insightIndex out of range (dropped)", `${c.id}: ${m.shiurId}[${m.insightIndex}]`);
        return false;
      }
      return true;
    });
    const seen = new Set<string>();
    const uniq = members.filter((m) => {
      const k = `${m.shiurId}#${m.insightIndex}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (uniq.length < 2) issue("teaching-clusters: fewer than 2 valid members", `${c.id}: ${uniq.length}`);
    clusterIds.add(c.id);
    clustersOut.push({ ...c, topicIds: resolveIds("teaching-clusters topics", c.id, c.topicIds, topicIds), members: uniq });
  }
}
writeJson(join(CORPUS, "teaching-clusters.json"), clustersOut);

// ---------- search/sections.jsonl ----------

const searchDir = join(CORPUS, "search");
mkdirSync(searchDir, { recursive: true });
const lines: string[] = [];
let missingTimes = 0;
for (const id of doneIds) {
  const ex = extractions.get(id)!;
  const meta = metas.get(id)!;
  const tags = shiurTags.get(id)!;
  const secTopics = new Map(tags.sections.map((s) => [s.index, s.topicIds]));
  const recs = new Map(meta.recordings.map((r) => [r.recording.id, r]));
  ex.sections.forEach((s, i) => {
    if (EXCLUDED_KINDS.has(s.kind)) return;
    const rec = recs.get(s.recordingId);
    if (!rec) issue("search: section recordingId not in meta.json", `${id}#${i}: ${s.recordingId}`);
    const startSec = rec?.starts[s.startSeg] ?? null;
    const endSec = rec?.ends[s.endSeg] ?? null;
    if (startSec === null || endSec === null) missingTimes++;
    const doc: SearchSectionDoc = {
      id: `${id}#${i}`,
      shiurId: id,
      sectionIndex: i,
      lang: meta.shiur.lang,
      kind: s.kind,
      recordingId: s.recordingId,
      startSeg: s.startSeg,
      endSeg: s.endSeg,
      startSec: startSec === null ? null : Math.round(startSec * 100) / 100,
      endSec: endSec === null ? null : Math.round(endSec * 100) / 100,
      shiurTitle: meta.shiur.catalog.titleOriginal,
      title: { en: s.title.en, yi: s.title.yi },
      summary: { en: s.summary.en, yi: s.summary.yi },
      topicIds: secTopics.get(i) ?? [],
      conceptIds: tags.conceptIds,
      seriesId: meta.shiur.seriesId,
      parsha: meta.shiur.parsha,
      zman: meta.shiur.zman,
      hebrewYears: meta.shiur.hebrewYears,
    };
    lines.push(JSON.stringify(doc));
  });
}
if (missingTimes) issue("search: sections without start/end time", String(missingTimes));
writeFileSync(join(searchDir, "sections.jsonl"), lines.join("\n") + "\n");

// ---------- integrity: other entity files ----------

function checkShiurIds(kind: string, owner: string, ids: string[]): void {
  for (const s of ids) if (!doneSet.has(s)) issue(`${kind}: shiurId not a done shiur`, `${owner}: ${s}`);
}
for (const c of concepts) {
  checkShiurIds("concepts", c.id, c.shiurIds);
  for (const r of c.exampleRefs) {
    const ex = extractions.get(r.shiurId);
    if (!ex || r.sectionIndex < 0 || r.sectionIndex >= ex.sections.length)
      issue("concepts: exampleRef does not resolve", `${c.id}: ${r.shiurId}#${r.sectionIndex}`);
  }
}
for (const p of people) {
  checkShiurIds("people", p.id, p.shiurIds);
  if (!p.shiurIds.length) issue("people: no shiurIds", p.id);
}
const WORK_KINDS = new Set(["sefer", "genre", "tanach-book", "talmud-tractate", "mishnah-tractate", "liturgy", "document"]);
const workById = new Map(works.map((w) => [w.id, w]));
for (const w of works) {
  checkShiurIds("works", w.id, w.shiurIds);
  if (w.authorPersonId !== null && !personIds.has(w.authorPersonId)) issue("works: authorPersonId unresolved", `${w.id}: ${w.authorPersonId}`);
  if (!WORK_KINDS.has(w.kind)) issue("works: unknown kind", `${w.id}: ${w.kind}`);
  if (w.order !== null && !Number.isInteger(w.order)) issue("works: order not an integer", `${w.id}: ${w.order}`);
  // parentWorkId must exist, and the chain must end within 2 levels (no cycles).
  let cur = w;
  for (let depth = 0; cur.parentWorkId !== null; depth++) {
    const parent = workById.get(cur.parentWorkId);
    if (!parent) {
      issue("works: parentWorkId unresolved", `${cur.id}: ${cur.parentWorkId}`);
      break;
    }
    if (depth >= 2) {
      issue("works: parent chain deeper than 2 or cyclic", w.id);
      break;
    }
    cur = parent;
  }
}
const PERSON_TYPES = new Set(["tanach", "chazal", "rishon", "acharon", "chassidic_rebbe", "malach", "ruler", "individual", "other"]);
for (const p of people) if (!PERSON_TYPES.has(p.type)) issue("people: unknown type", `${p.id}: ${p.type}`);
const tellingSeen = new Map<string, string>();
let storyPeopleResolved = 0;
let storyPeopleRaw = 0;
for (const s of stories) {
  for (const t of s.tellings) {
    const ex = extractions.get(t.shiurId);
    if (!ex || t.storyIndex < 0 || t.storyIndex >= ex.stories.length) issue("stories: telling does not resolve", `${s.id}: ${t.shiurId}[${t.storyIndex}]`);
    const k = `${t.shiurId}#${t.storyIndex}`;
    const prev = tellingSeen.get(k);
    if (prev && prev !== s.id) issue("stories: telling in two stories", `${k}: ${prev}, ${s.id}`);
    tellingSeen.set(k, s.id);
  }
  for (const p of s.people) personIds.has(p) ? storyPeopleResolved++ : storyPeopleRaw++;
}
let extractionStories = 0;
for (const ex of extractions.values()) extractionStories += ex.stories.length;
for (const { file, data } of series) {
  if (`${data.seriesId}.json` !== file) issue("series: file name != seriesId", file);
  const ing = ingestSeries.get(data.seriesId);
  if (!ing) {
    issue("series: seriesId not in ingest", data.seriesId);
    continue;
  }
  const doneOrder = ing.shiurIds.filter((s) => doneSet.has(s));
  const arcIds = data.arc.map((a) => a.shiurId);
  checkShiurIds("series", data.seriesId, arcIds);
  const missing = doneOrder.filter((s) => !arcIds.includes(s));
  if (missing.length) issue("series: done shiurim missing from arc", `${data.seriesId}: ${missing.join(", ")}`);
}
const seriesWithDone = ingest.series.filter((s) => s.shiurIds.some((id) => doneSet.has(id))).map((s) => s.id);
for (const s of seriesWithDone) if (!seriesFiles.includes(`${s}.json`)) issue("series: no synthesis for series with done shiurim", s);
for (const id of doneIds) if (!existsSync(join(tagsDir, `${id}.json`))) issue("shiur-tags: missing file", id);

// ---------- index.json ----------

const files = [
  "index.json",
  "topics.json",
  "concepts.json",
  "people.json",
  "works.json",
  "stories.json",
  "redirects.json",
  "teaching-clusters.json",
  ...seriesFiles.map((f) => `series/${f}`),
  ...doneIds.map((id) => `shiur-tags/${id}.json`),
  "search/sections.jsonl",
];
const index: CorpusIndex = {
  version: CORPUS_VERSION,
  generatedAt: new Date().toISOString(),
  shiurIds: doneIds,
  counts: {
    shiurim: doneIds.length,
    topics: topicsOut.length,
    concepts: concepts.length,
    people: people.length,
    works: works.length,
    series: series.length,
    stories: stories.length,
    teachingClusters: clustersOut.length,
    searchSections: lines.length,
    shiurTags: shiurTags.size,
  },
  files,
  pendingDescriptions,
};
writeJson(join(CORPUS, "index.json"), index);

// ---------- report ----------

const pct = (n: number, d: number): string => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");
const tagList = [...shiurTags.values()];
let secTotal = 0;
let secTagged = 0;
let srcTotal = 0;
let srcResolved = 0;
for (const t of tagList) {
  const ex = extractions.get(t.shiurId)!;
  const content = ex.sections.map((s, i) => ({ s, i })).filter(({ s }) => !EXCLUDED_KINDS.has(s.kind));
  secTotal += content.length;
  const tagged = new Set(t.sections.filter((s) => s.topicIds.length).map((s) => s.index));
  secTagged += content.filter(({ i }) => tagged.has(i)).length;
  srcTotal += t.sourceWorkIds.length;
  srcResolved += t.sourceWorkIds.filter((w) => w !== null).length;
}
const used = (key: "conceptIds" | "personIds" | "workIds"): Set<string> => new Set(tagList.flatMap((t) => t[key]));
const coverage = {
  shiurimDone: doneIds.length,
  shiurTagsWritten: shiurTags.size,
  shiurimWithTopics: `${tagList.filter((t) => t.topics.length).length} (${pct(tagList.filter((t) => t.topics.length).length, tagList.length)})`,
  avgTopicsPerShiur: (tagList.reduce((a, t) => a + t.topics.length, 0) / (tagList.length || 1)).toFixed(2),
  contentSectionsTagged: `${secTagged}/${secTotal} (${pct(secTagged, secTotal)})`,
  sourcesResolvedToWork: `${srcResolved}/${srcTotal} (${pct(srcResolved, srcTotal)})`,
  shiurimWithConcepts: pct(tagList.filter((t) => t.conceptIds.length).length, tagList.length),
  shiurimWithPeople: pct(tagList.filter((t) => t.personIds.length).length, tagList.length),
  shiurimWithWorks: pct(tagList.filter((t) => t.workIds.length).length, tagList.length),
  topicsWithShiurim: `${topicsOut.filter((t) => t.shiurCount > 0).length}/${topicsOut.length}`,
  conceptsUsedInTags: `${[...conceptIds].filter((c) => used("conceptIds").has(c)).length}/${conceptIds.size}`,
  peopleUsedInTags: `${[...personIds].filter((c) => used("personIds").has(c)).length}/${personIds.size}`,
  worksUsedInTags: `${[...workIds].filter((c) => used("workIds").has(c)).length}/${workIds.size}`,
  storyTellingsCovered: `${tellingSeen.size}/${extractionStories} (${pct(tellingSeen.size, extractionStories)})`,
  storyPeople: `${storyPeopleResolved} person ids, ${storyPeopleRaw} raw names`,
  teachingClusters: clustersOut.length,
  clusterMembers: clustersOut.reduce((a, c) => a + c.members.length, 0),
  seriesSyntheses: `${series.length}/${seriesWithDone.length}`,
  searchSections: lines.length,
  pendingDescriptions: pendingDescriptions.length,
};

console.log("counts:", JSON.stringify(index.counts));
console.log("coverage:", JSON.stringify(coverage, null, 1));
for (const n of notes) console.log("note:", n);
if (!issues.size) console.log("integrity: no issues");
for (const [kind, list] of issues) {
  console.log(`issue: ${kind} x${list.length}: ${list.slice(0, 8).join(" | ")}${list.length > 8 ? " | ..." : ""}`);
}
