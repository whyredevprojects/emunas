/**
 * Dev-only: (re)generate the test fixtures from today's data.
 *
 *   npm run fixtures:mini --workspace=@emunas/corpus            # mini corpus + goldens
 *   npm run fixtures:mini --workspace=@emunas/corpus -- --golden-only
 *   npm run fixtures:mini --workspace=@emunas/corpus -- --corpus-only  # mini corpus layer only
 *
 * Mini corpus (test/fixtures/mini/data): 60 in-scope shiurim (the 7 sample shiurim, every
 * multi-recording shiur, then an even spread over the rest, about half of them done) plus 2
 * out-of-scope rows. Derived text only: `heardAs` and `asrNotes` are blanked, transcript keys are
 * nulled and audio keys replaced by synthetic ones. Catalog files keep section ids/titles/pages only.
 *
 * Mini corpus layer (test/fixtures/mini/data/derived/corpus): the real corpus-wide files sliced to
 * the mini corpus's done shiurim (see `makeMiniCorpus`), plus the synthetic cases in
 * `MINI_CORPUS_SYNTHETIC`. Only the public files are read (through the allow-listed reader); the
 * poisoned internal folder and alias map written here hold canary strings, never pipeline data.
 *
 * Goldens (test/fixtures/golden/<id>.json): projected output of the 7 samples built from the mini
 * corpus with the default keyer; `rev` is replaced by "<rev>" (it hashes the code too).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDataReader, defaultDataDir } from "../src/build/read.ts";
import { projectCorpus, toJson } from "../src/build/build.ts";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(PKG, "test/fixtures");
export const MINI_DATA = join(FIXTURES, "mini/data");
export const MINI_POLICY = join(FIXTURES, "mini/site-policy");
export const GOLDEN_DIR = join(FIXTURES, "golden");

export const SAMPLES = [
  "yi-parshas-hashavua-brshys-01",
  "en-parsha-en-nch-01",
  "yi-zmanim-lvl-01",
  "yi-zmanim-tv-bb-04",
  "en-miscellaneous-en-01",
  "yi-tanya-1-01",
  "yi-zmanim-msybs-lchyym-bkmp-01-c",
];

type Json = Record<string, unknown>;

function scrubExtraction(e: Json): Json {
  const blankHeard = (x: Json) => ({ ...x, heardAs: Array.isArray(x["heardAs"]) ? [] : "" });
  return {
    ...e,
    sources: (e["sources"] as Json[]).map(blankHeard),
    concepts: (e["concepts"] as Json[]).map(blankHeard),
    people: (e["people"] as Json[]).map(blankHeard),
    asrNotes: "",
  };
}

function scrubRecording(r: Json): Json {
  return { ...r, audioKey: `fixture/${String(r["id"])}.mp3`, transcriptKey: null };
}

function makeMini(): void {
  const reader = createDataReader(defaultDataDir());
  const ingest = JSON.parse(reader.readText("derived/ingest.json")!) as Json & { shiurim: Json[]; recordings: Json[]; series: Json[] };
  const manifest = JSON.parse(reader.readText("derived/manifest.json")!) as Json & { entries: Json[] };
  const status = new Map(manifest.entries.map((e) => [String(e["shiurId"]), String(e["status"])]));
  const inScope = ingest.shiurim.filter((s) => s["inScope"] === true);

  const picked: string[] = [...SAMPLES];
  for (const s of inScope) if ((s["recordingIds"] as string[]).length > 1 && !picked.includes(String(s["id"]))) picked.push(String(s["id"]));
  const rest = inScope.map((s) => String(s["id"])).filter((id) => !picked.includes(id)).sort();
  const done = rest.filter((id) => status.get(id) === "done");
  const notDone = rest.filter((id) => status.get(id) !== "done");
  const need = 60 - picked.length;
  const nDone = Math.ceil(need / 2);
  const spread = (xs: string[], n: number) => Array.from({ length: n }, (_, i) => xs[Math.floor((i * xs.length) / n)]!);
  picked.push(...spread(done, nDone), ...spread(notDone, need - nDone));
  const outOfScope = ingest.shiurim.filter((s) => s["inScope"] !== true).slice(0, 2).map((s) => String(s["id"]));
  const ids = new Set([...picked, ...outOfScope]);

  const shiurim = ingest.shiurim.filter((s) => ids.has(String(s["id"])));
  const recIds = new Set(shiurim.flatMap((s) => s["recordingIds"] as string[]));
  const recordings = ingest.recordings.filter((r) => recIds.has(String(r["id"]))).map(scrubRecording);
  const series = ingest.series
    .map((x) => ({ ...x, shiurIds: (x["shiurIds"] as string[]).filter((id) => ids.has(id)) }))
    .filter((x) => x.shiurIds.length > 0);

  rmSync(join(FIXTURES, "mini"), { recursive: true, force: true });
  mkdirSync(join(MINI_DATA, "derived/shiurim"), { recursive: true });
  mkdirSync(join(MINI_DATA, "catalog"), { recursive: true });
  mkdirSync(MINI_POLICY, { recursive: true });
  writeFileSync(
    join(MINI_DATA, "derived/ingest.json"),
    toJson({ generatedAt: ingest["generatedAt"], stats: {}, shiurim, recordings, series, warnings: [] }),
  );
  writeFileSync(
    join(MINI_DATA, "derived/manifest.json"),
    toJson({ version: 1, updatedAt: manifest["updatedAt"], entries: manifest.entries.filter((e) => ids.has(String(e["shiurId"]))) }),
  );
  for (const name of ["pocket-guide-2012", "uncatalogued-guide"]) {
    const c = JSON.parse(reader.readText(`catalog/${name}.json`)!) as { sections: Json[] };
    const sections = c.sections.map((s) => {
      const o: Json = { id: s["id"], title: s["title"] };
      if (s["pages"] !== undefined) o["pages"] = s["pages"];
      if (s["dir"] !== undefined) o["dir"] = s["dir"];
      return o;
    });
    writeFileSync(join(MINI_DATA, `catalog/${name}.json`), toJson({ sections }));
  }
  for (const id of picked) {
    const files: [string, (j: Json) => Json][] = [
      ["meta", (m) => ({ ...m, recordings: (m["recordings"] as Json[]).map((r) => ({ ...r, recording: scrubRecording(r["recording"] as Json) })), shiur: null })],
      ["extraction", scrubExtraction],
      ["writeup", (w) => w],
    ];
    for (const [name, scrub] of files) {
      const text = reader.readText(`derived/shiurim/${id}/${name}.json`);
      if (text === null) continue;
      mkdirSync(join(MINI_DATA, "derived/shiurim", id), { recursive: true });
      writeFileSync(join(MINI_DATA, "derived/shiurim", id, `${name}.json`), JSON.stringify(scrub(JSON.parse(text) as Json)));
    }
  }
  writeFileSync(
    join(MINI_POLICY, "publish-policy.json"),
    toJson({ policyVersion: 1, confidence: { dropBelow: 0.6, softBelow: 0.75 }, suppress: [], allowVerbatim: [] }),
  );
  console.log(`mini corpus: ${picked.length} in scope (${picked.filter((id) => status.get(id) === "done").length} done) + ${outOfScope.length} out of scope`);
}

// ---------- mini corpus layer (corpus-wave-plan C1.1 (6)) ----------

export const MINI_CORPUS_DIR = join(MINI_DATA, "derived/corpus");

/** A string that must never reach any output: it lives only in files the reader may not open. */
export const POISON_CANARY = "MINI-POISON-CANARY-7f3a";

/** Synthetic cases added to the sliced corpus. Tests import these instead of guessing. */
export const MINI_CORPUS_SYNTHETIC = {
  /** concepts: a → b → <real concept> (chain) */
  redirectChain: { kind: "concepts", ids: ["syn-chain-a", "syn-chain-b"] },
  /** people: x → y → x (cycle) */
  redirectCycle: { kind: "people", ids: ["syn-cycle-x", "syn-cycle-y"] },
  /** A retired person record carrying `mergedInto`. */
  mergedPersonId: "syn-merged-person",
  /** A type-`other` person with exactly one shiur. */
  otherOneShiurId: "syn-other-one-shiur",
  /** The real person whose nameEn is "the Rav's father" (family rule, D5). */
  familyPersonId: "eliyahu-shalom-wolfson",
  /** An index.json `files` entry no reader knows. */
  unknownFile: "future-insights.json",
  /** Concept carrying an `asrVariants` key and work carrying `heardAsSamples` (dropped on read). */
  asrConceptIndex: 0,
  heardAsWorkIndex: 0,
  /** Topic carrying an unknown field (ignored on read). */
  unknownFieldTopicIndex: 0,
  unknownField: "futureField",
} as const;

/** The synthetic choices that depend on the data, written next to the fixture for the tests. */
export interface MiniCorpusPicks {
  /** Mini shiurim that are not done (outside the mini corpus index). */
  notDoneShiurId: string;
  /** Story that got a telling in the not-done shiur. */
  notDoneTellingStoryId: string;
  /** Cluster that got a member in the not-done shiur. */
  notDoneMemberClusterId: string;
  /** Cluster member pointing at a real insight; tests lower its confidence below dropBelow. */
  lowConfidenceMember: { clusterId: string; shiurId: string; insightIndex: number };
  /** Cluster member whose insight index is past the end of the extraction (never projected). */
  outOfRangeMember: { clusterId: string; shiurId: string; insightIndex: number };
  /** The work that got `kind`. */
  kindWorkId: string;
  /** Real concept at the end of the redirect chain. */
  chainTargetConceptId: string;
  /** Real person the merged record points at. */
  mergedIntoPersonId: string;
}

function makeMiniCorpus(): void {
  const real = createDataReader(defaultDataDir());
  const mini = createDataReader(MINI_DATA);
  const rd = <T>(r: ReturnType<typeof createDataReader>, rel: string): T => {
    const text = r.readText(rel);
    if (text === null) throw new Error(`${rel} missing`);
    return JSON.parse(text) as T;
  };
  type Rec = Json & { id: string };
  const index = rd<Json & { shiurIds: string[]; files: string[]; generatedAt: string; version: number }>(real, "derived/corpus/index.json");
  const manifest = rd<{ entries: Json[] }>(mini, "derived/manifest.json");
  const ingest = rd<{ shiurim: Json[] }>(mini, "derived/ingest.json");
  const realCorpus = new Set(index.shiurIds);
  const doneIds = manifest.entries.filter((e) => e["status"] === "done").map((e) => String(e["shiurId"]));
  const shiurIds = doneIds.filter((id) => realCorpus.has(id)).sort();
  const inMini = new Set(shiurIds);
  const notDone = ingest.shiurim
    .filter((s) => s["inScope"] === true && !inMini.has(String(s["id"])))
    .map((s) => String(s["id"]))
    .sort();
  const inMiniIngest = new Set(ingest.shiurim.map((x) => String(x["id"])));
  const keepIds = (xs: unknown): string[] => (xs as string[]).filter((id) => inMini.has(id));

  const topics = rd<Rec[]>(real, "derived/corpus/topics.json").map((t) => ({
    ...t,
    aliases: (t["aliases"] as string[]).slice(0, 6),
    hubShiurIds: keepIds(t["hubShiurIds"]),
  }));
  const sameAs = (k: string) =>
    new Set(topics.map((t) => ((t as Json)["sameAs"] as Record<string, string> | undefined)?.[k]).filter((x): x is string => !!x));
  const sameConcept = sameAs("conceptId");
  const samePerson = sameAs("personId");
  const sameWork = sameAs("workId");

  const stories0 = rd<Rec[]>(real, "derived/corpus/stories.json");
  const redirects0 = rd<Record<string, Record<string, string>>>(real, "derived/corpus/redirects.json");
  const storyTargets = new Set(Object.values(redirects0["stories"] ?? {}));
  const stories = stories0
    .map((s) => ({ ...s, tellings: (s["tellings"] as { shiurId: string }[]).filter((t) => inMini.has(t.shiurId)) }))
    .filter((s) => s.tellings.length > 0 || storyTargets.has(s.id));

  const works = rd<Rec[]>(real, "derived/corpus/works.json")
    .map((w) => ({ ...w, aliases: (w["aliases"] as string[]).slice(0, 4), shiurIds: keepIds(w["shiurIds"]) }))
    .filter((w) => w.shiurIds.length > 0 || sameWork.has(w.id));

  const storyPeople = new Set(stories.flatMap((s) => (s as Json)["people"] as string[]));
  const authors = new Set(works.map((w) => (w as Json)["authorPersonId"]).filter((x): x is string => typeof x === "string"));
  const S = MINI_CORPUS_SYNTHETIC;
  const people: Json[] = rd<Rec[]>(real, "derived/corpus/people.json")
    .map((p) => ({ ...p, aliases: (p["aliases"] as string[]).slice(0, 4), shiurIds: keepIds(p["shiurIds"]) }))
    .filter((p) => p.shiurIds.length > 0 || samePerson.has(p.id) || storyPeople.has(p.id) || authors.has(p.id) || p.id === S.familyPersonId)
    .map((p) => (p.id === S.familyPersonId && p.shiurIds.length === 0 ? { ...p, shiurIds: [shiurIds[0]!] } : p));
  if (!people.some((p) => p["id"] === S.familyPersonId)) throw new Error(`${S.familyPersonId} not in the real people.json`);

  const concepts: Json[] = rd<Rec[]>(real, "derived/corpus/concepts.json")
    .map((c) => ({
      ...c,
      transliterations: (c["transliterations"] as string[]).slice(0, 4),
      shiurIds: keepIds(c["shiurIds"]),
      exampleRefs: (c["exampleRefs"] as { shiurId: string }[]).filter((r) => inMini.has(r.shiurId)),
    }))
    .filter((c) => c.shiurIds.length > 0 || sameConcept.has(c.id));

  const clusters = rd<Rec[]>(real, "derived/corpus/teaching-clusters.json")
    .map((c) => ({ ...c, members: (c["members"] as { shiurId: string; insightIndex: number }[]).filter((m) => inMini.has(m.shiurId)) }))
    .filter((c) => c.members.length > 0);

  const series: Json[] = [];
  for (const f of index.files.filter((x) => /^series\/[a-z0-9-]+\.json$/.test(x)).sort()) {
    const s = rd<Json>(real, `derived/corpus/${f}`);
    // Arc parts of any mini shiur (done or not), so the fixture has series whose parts are not visible.
    const arc = (s["arc"] as { shiurId: string }[]).filter((a) => inMiniIngest.has(a.shiurId));
    if (arc.length > 0) series.push({ ...s, arc });
  }

  // ---- synthetic cases ----
  const notDoneShiurId = notDone[0]!;
  const tellStory = stories[0]!;
  tellStory.tellings = [...tellStory.tellings, { shiurId: notDoneShiurId, storyIndex: 0 } as { shiurId: string }];
  const notDoneCluster = clusters[0]!;
  notDoneCluster.members = [...notDoneCluster.members, { shiurId: notDoneShiurId, insightIndex: 0 }];

  // The lowest-confidence insight in the mini corpus that no cluster already holds.
  const held = new Set(clusters.flatMap((c) => c.members.map((m) => `${m.shiurId}#${m.insightIndex}`)));
  let low: { shiurId: string; insightIndex: number; confidence: number; count: number } | null = null;
  for (const id of shiurIds) {
    const ex = rd<{ insights: { evidence: { confidence: number } }[] }>(mini, `derived/shiurim/${id}/extraction.json`);
    ex.insights.forEach((ins, i) => {
      if (held.has(`${id}#${i}`)) return;
      if (!low || ins.evidence.confidence < low.confidence) low = { shiurId: id, insightIndex: i, confidence: ins.evidence.confidence, count: ex.insights.length };
    });
  }
  if (!low) throw new Error("no insight to use for the low-confidence member");
  const lowPick: { shiurId: string; insightIndex: number; count: number } = low;
  const memberCluster = clusters[1]!;
  memberCluster.members = [
    ...memberCluster.members,
    { shiurId: lowPick.shiurId, insightIndex: lowPick.insightIndex },
    { shiurId: lowPick.shiurId, insightIndex: lowPick.count + 5 },
  ];

  const kindWork = works.find((w) => w.id === "midrash") ?? works[0]!;
  (kindWork as Json)["kind"] = "generic";
  (works[S.heardAsWorkIndex] as Json)["heardAsSamples"] = [POISON_CANARY];
  (concepts[S.asrConceptIndex] as Json)["asrVariants"] = [POISON_CANARY, `${POISON_CANARY}-2`];
  (topics[S.unknownFieldTopicIndex] as Json)[S.unknownField] = { note: "a field the pipeline may add later" };

  const chainTarget = String(concepts.find((c) => (c["shiurIds"] as string[]).length > 0)!["id"]);
  const mergedInto = String(people.find((p) => p["type"] !== "other" && (p["shiurIds"] as string[]).length > 0)!["id"]);
  people.push(
    { id: S.mergedPersonId, nameHe: "פלוני", nameEn: "Syn Merged", nameYi: "פלוני", type: "acharon", aliases: [], shiurIds: [shiurIds[0]!], mergedInto },
    { id: S.otherOneShiurId, nameHe: "אלמוני", nameEn: "Syn Other", nameYi: "אלמוני", type: "other", aliases: [], shiurIds: [shiurIds[1]!] },
  );
  const redirects = {
    ...redirects0,
    [S.redirectChain.kind]: { [S.redirectChain.ids[0]]: S.redirectChain.ids[1], [S.redirectChain.ids[1]]: chainTarget },
    [S.redirectCycle.kind]: { [S.redirectCycle.ids[0]]: S.redirectCycle.ids[1], [S.redirectCycle.ids[1]]: S.redirectCycle.ids[0] },
  };

  // ---- write ----
  rmSync(MINI_CORPUS_DIR, { recursive: true, force: true });
  for (const d of ["series", "shiur-tags", "raw", "topic-tags", "teaching-clusters", "search"]) mkdirSync(join(MINI_CORPUS_DIR, d), { recursive: true });
  const put = (rel: string, x: unknown) => writeFileSync(join(MINI_CORPUS_DIR, rel), toJson(x));
  put("topics.json", topics);
  put("concepts.json", concepts);
  put("people.json", people);
  put("works.json", works);
  put("stories.json", stories);
  put("teaching-clusters.json", clusters);
  put("redirects.json", redirects);
  for (const s of series) put(`series/${String(s["seriesId"])}.json`, s);
  for (const id of shiurIds) put(`shiur-tags/${id}.json`, rd<Json>(real, `derived/corpus/shiur-tags/${id}.json`));

  // Poison: files the reader must never open. Canary strings only.
  const poison = { canary: POISON_CANARY };
  put("raw/asr-variants.json", { [POISON_CANARY]: [POISON_CANARY] });
  put("raw/concept-alias-map.json", { [POISON_CANARY]: "syn-chain-a" });
  put("raw/topics.json", [poison]);
  put("people-alias-map.json", { [POISON_CANARY]: S.familyPersonId });
  put("topic-tags/chunk-01.json", [poison]);
  put("teaching-clusters/syn.json", [poison]);
  writeFileSync(join(MINI_CORPUS_DIR, "search/sections.jsonl"), `${JSON.stringify(poison)}\n`);

  const files = [
    "index.json",
    "topics.json",
    "concepts.json",
    "people.json",
    "works.json",
    "stories.json",
    "redirects.json",
    "teaching-clusters.json",
    "search/sections.jsonl",
    S.unknownFile,
    ...series.map((s) => `series/${String(s["seriesId"])}.json`),
    ...shiurIds.map((id) => `shiur-tags/${id}.json`),
  ];
  put("index.json", {
    version: index.version,
    generatedAt: index.generatedAt,
    shiurIds,
    counts: {
      shiurim: shiurIds.length,
      topics: topics.length,
      concepts: concepts.length,
      people: people.length,
      works: works.length,
      series: series.length,
      stories: stories.length,
      teachingClusters: clusters.length,
      searchSections: 1,
      shiurTags: shiurIds.length,
    },
    files,
    pendingDescriptions: [],
  });
  const picks: MiniCorpusPicks = {
    notDoneShiurId,
    notDoneTellingStoryId: tellStory.id,
    notDoneMemberClusterId: notDoneCluster.id,
    lowConfidenceMember: { clusterId: memberCluster.id, shiurId: lowPick.shiurId, insightIndex: lowPick.insightIndex },
    outOfRangeMember: { clusterId: memberCluster.id, shiurId: lowPick.shiurId, insightIndex: lowPick.count + 5 },
    kindWorkId: kindWork.id,
    chainTargetConceptId: chainTarget,
    mergedIntoPersonId: mergedInto,
  };
  // Not listed in index.files, so the reader never looks at it; the tests read it directly.
  writeFileSync(MINI_CORPUS_PICKS, toJson(picks));
  console.log(
    `mini corpus layer: ${shiurIds.length} shiurim, ${topics.length} topics, ${concepts.length} concepts, ${people.length} people, ${works.length} works, ${stories.length} stories, ${clusters.length} clusters, ${series.length} series`,
  );
}

export const MINI_CORPUS_PICKS = join(FIXTURES, "mini/data/derived/corpus/synthetic-picks.json");

export function readMiniCorpusPicks(): MiniCorpusPicks {
  return JSON.parse(readFileSync(MINI_CORPUS_PICKS, "utf8")) as MiniCorpusPicks;
}

export function goldenOf(x: unknown): unknown {
  return { ...(x as Json), rev: "<rev>" };
}

function makeGoldens(): void {
  const p = projectCorpus({ dataDir: MINI_DATA, policyDir: MINI_POLICY });
  mkdirSync(GOLDEN_DIR, { recursive: true });
  for (const id of SAMPLES) {
    const s = p.shiurim.find((x) => x.id === id);
    if (!s) throw new Error(`sample ${id} not in the mini corpus`);
    writeFileSync(join(GOLDEN_DIR, `${id}.json`), toJson(goldenOf(s)));
  }
  console.log(`goldens: ${SAMPLES.length} written to ${GOLDEN_DIR}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--corpus-only")) makeMiniCorpus();
  else {
    if (!process.argv.includes("--golden-only")) {
      makeMini();
      makeMiniCorpus();
    }
    makeGoldens();
  }
}
