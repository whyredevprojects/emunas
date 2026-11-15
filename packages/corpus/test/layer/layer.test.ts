/**
 * C1.2 on the mini corpus: golden files for every layer file, determinism, the visible set, the
 * transcript rules (no forbidden keys, no poison canary, aliases from display fields only) and the
 * synthetic cases of the fixture (redirect chain and cycle, mergedInto, family and `other` people,
 * a telling and a member in a not-done shiur, a low-confidence member, a work `kind`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MINI_CORPUS_SYNTHETIC, POISON_CANARY, readMiniCorpusPicks } from "../../scripts/make-mini-corpus.ts";
import { projectAndAggregate } from "../../src/aggregate/build.ts";
import { toJson } from "../../src/build/build.ts";
import {
  LAYER_FILES,
  LAYER_SCHEMA_VERSION,
  type LayerConceptsFile,
  type LayerInfo,
  type LayerPeopleFile,
  type LayerRedirectsFile,
  type LayerShiurRefs,
  type LayerStoriesFile,
  type LayerSynonymsFile,
  type LayerThreadsFile,
  type LayerTopicsFile,
  type LayerWorksFile,
} from "../../src/public/corpus-layer.ts";
import { MINI_DATA, MINI_POLICY } from "../helpers.ts";
import { aliasViolations, countViolations, forbiddenKeys, referencedShiurIds } from "./helpers.ts";

const mini = projectAndAggregate({ dataDir: MINI_DATA, policyDir: MINI_POLICY });
const files = mini.layer.files;
const visible = new Set(mini.shiurim.filter((s) => s.status === "full").map((s) => s.id));
const picks = readMiniCorpusPicks();
const S = MINI_CORPUS_SYNTHETIC;

const info = files[LAYER_FILES.layer] as LayerInfo;
const topics = files[LAYER_FILES.topics] as LayerTopicsFile;
const concepts = files[LAYER_FILES.concepts] as LayerConceptsFile;
const people = files[LAYER_FILES.people] as LayerPeopleFile;
const works = files[LAYER_FILES.works] as LayerWorksFile;
const stories = files[LAYER_FILES.stories] as LayerStoriesFile;
const threads = files[LAYER_FILES.threads] as LayerThreadsFile;
const synonyms = files[LAYER_FILES.synonyms] as LayerSynonymsFile;
const redirects = files[LAYER_FILES.redirects] as LayerRedirectsFile;
const refs = Object.entries(files).filter(([k]) => k.startsWith("shiur/")).map(([, v]) => v as LayerShiurRefs);

const TOP = [
  LAYER_FILES.layer,
  LAYER_FILES.topics,
  LAYER_FILES.concepts,
  LAYER_FILES.people,
  LAYER_FILES.works,
  LAYER_FILES.stories,
  LAYER_FILES.threads,
  LAYER_FILES.synonyms,
  LAYER_FILES.redirects,
  LAYER_FILES.occasionTopics,
];

describe("corpus layer on the mini corpus", () => {
  it.each(TOP)("%s matches its golden file", async (name) => {
    await expect(toJson(files[name])).toMatchFileSnapshot(join("golden", name));
  });

  it("shiur refs and series match their golden files", async () => {
    const pick = (prefix: string) => Object.fromEntries(Object.entries(files).filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1)));
    await expect(toJson(pick("shiur/"))).toMatchFileSnapshot(join("golden", "shiur-refs.json"));
    await expect(toJson(pick("series/"))).toMatchFileSnapshot(join("golden", "series.json"));
  });

  it("writes exactly the planned files", () => {
    const names = Object.keys(files);
    for (const n of TOP) expect(names).toContain(n);
    for (const n of names) expect(TOP.includes(n as (typeof TOP)[number]) || /^(shiur|series)\/[a-z0-9-]+\.json$/.test(n), n).toBe(true);
    expect(refs.map((r) => r.shiurId).sort()).toEqual([...visible].sort());
  });

  it("is deterministic", () => {
    const again = projectAndAggregate({ dataDir: MINI_DATA, policyDir: MINI_POLICY });
    expect(toJson(again.layer.files)).toBe(toJson(files));
  });

  it("layer.json states the version, inputs and counts", () => {
    expect(info.layerSchemaVersion).toBe(LAYER_SCHEMA_VERSION);
    expect(info.enabled).toBe(true);
    expect(info.inputs).toMatchObject({ topics: true, concepts: true, people: true, works: true, stories: true, teachingClusters: true, redirects: true });
    expect(info.counts.visibleShiurim).toBe(visible.size);
    expect(info.counts.shiurRefs).toBe(visible.size);
    expect(info.notRead).toEqual([S.unknownFile]);
    expect(info.droppedKeys).toEqual({ "concepts.json": 1, "works.json": 1 });
  });

  it("counts are visible recounts and reference visible shiurim only", () => {
    expect(countViolations(files, visible)).toEqual([]);
    expect(referencedShiurIds(files).filter((r) => !visible.has(r.shiurId))).toEqual([]);
  });

  it("never carries forbidden keys, the poison canary or a raw/ name", () => {
    expect(forbiddenKeys(files)).toEqual([]);
    const text = toJson(files);
    expect(text).not.toContain(POISON_CANARY);
    expect(text).not.toContain("corpus/raw/");
    expect(text).not.toContain("alias-map");
  });

  it("publishes aliases and synonyms from display fields only", () => {
    expect(aliasViolations(files, MINI_DATA)).toEqual([]);
    expect(synonyms.synonyms.length).toBeGreaterThan(0);
  });

  it("resolves corpus redirect chains and drops cycles", () => {
    expect(redirects.corpus.concepts).toEqual({ "syn-chain-a": picks.chainTargetConceptId, "syn-chain-b": picks.chainTargetConceptId });
    expect(redirects.corpus.people).toEqual({ [S.mergedPersonId]: picks.mergedIntoPersonId });
    expect(redirects.corpus.stories).toEqual({ "the-sanzer-rav-and-the-business-competitor": "the-divrei-chaim-and-the-man-who-shamed" });
    expect(info.warnings).toContain("redirect people:syn-cycle-x dropped (cycle)");
    // A retired record leaves the entity files.
    expect(people.people.some((p) => p.id === S.mergedPersonId)).toBe(false);
  });

  it("excludes the Rav's family by rule and keeps `other` people with one shiur out of every index", () => {
    const fam = people.people.find((p) => p.id === S.familyPersonId)!;
    expect(fam.excluded).toBe("family");
    expect(fam.listed).toEqual({ quiet: false, live: false });
    expect(fam.pages).toEqual({ quiet: false, live: false });
    expect(synonyms.synonyms.some((s) => s.kind === "person" && s.id === S.familyPersonId)).toBe(false);
    for (const r of refs) expect(r.personIds).not.toContain(S.familyPersonId);
    const other = people.people.find((p) => p.id === S.otherOneShiurId)!;
    expect(other.excluded).toBeNull();
    expect(other.listed).toEqual({ quiet: false, live: false });
    expect(other.pages).toEqual({ quiet: false, live: false });
    for (const p of people.people.filter((x) => x.type === "other")) {
      expect(p.pages).toEqual({ quiet: false, live: false });
      expect(p.listed.live).toBe(false);
      expect(p.listed.quiet).toBe(p.count >= 3);
    }
  });

  it("never counts a telling or member in a not-done shiur, nor a low-confidence or out-of-range member", () => {
    const st = stories.stories.find((s) => s.id === picks.notDoneTellingStoryId);
    for (const t of st?.tellings ?? []) expect(t.shiurId).not.toBe(picks.notDoneShiurId);
    const allMembers = threads.threads.flatMap((t) => t.members);
    expect(allMembers.some((m) => m.shiurId === picks.notDoneShiurId)).toBe(false);
    const low = picks.lowConfidenceMember;
    const out = picks.outOfRangeMember;
    expect(allMembers.some((m) => m.momentId === `${out.shiurId}~i${out.insightIndex}`)).toBe(false);
    // The low-confidence pick counts only if its insight survived projection.
    const insightProjected = mini.shiurim.find((s) => s.id === low.shiurId)?.notes?.insights.some((i) => i.id === `${low.shiurId}~i${low.insightIndex}`);
    expect(allMembers.some((m) => m.momentId === `${low.shiurId}~i${low.insightIndex}`)).toBe(
      insightProjected === true && (threads.threads.find((t) => t.id === low.clusterId)?.shiurCount ?? 0) >= 2,
    );
  });

  it("marks concepts merged into a topic and gives them no page", () => {
    const merged = concepts.concepts.filter((c) => c.mergedIntoTopic !== null);
    expect(merged.length).toBeGreaterThan(0);
    for (const c of merged) {
      expect(c.pages).toEqual({ quiet: false, live: false });
      const t = topics.tree.find((x) => x.id === c.mergedIntoTopic)!;
      expect(t.sameAs?.conceptId).toBe(c.id);
    }
  });

  it("flags the work with a generic kind and gives it no page", () => {
    const w = works.works.find((x) => x.id === picks.kindWorkId)!;
    expect(w.generic).toBe(true);
    expect(w.pages).toEqual({ quiet: false, live: false });
  });

  it("orders works by the shelf table, unknown works last", () => {
    const firstUnknown = works.works.findIndex((w) => w.orderGroup === null);
    expect(firstUnknown).toBeGreaterThan(0);
    expect(works.works.slice(firstUnknown).every((w) => w.orderGroup === null)).toBe(true);
  });

  it("two-shiur threads become inline pointers on both members, never pages", () => {
    const two = threads.threads.filter((t) => t.shiurCount === 2);
    expect(two.length).toBeGreaterThan(0);
    for (const t of two) {
      expect(t.page).toBe(false);
      for (const m of t.members) {
        const ref = refs.find((r) => r.shiurId === m.shiurId)!.insights.find((i) => i.momentId === m.momentId && i.threadId === t.id)!;
        expect(ref.other?.shiurId).not.toBe(m.shiurId);
        expect(t.members.some((o) => o.momentId === ref.other?.momentId)).toBe(true);
      }
    }
  });

  it("story refs carry the visible telling count and page flags", () => {
    for (const s of stories.stories) {
      for (const t of s.tellings) {
        const ref = refs.find((r) => r.shiurId === t.shiurId)!.stories.find((x) => x.momentId === t.momentId)!;
        expect(ref).toEqual({ momentId: t.momentId, storyId: s.id, tellings: s.tellings.length, pages: s.pages });
      }
      expect(s.pages.quiet).toBe(s.tellings.length >= 2);
    }
  });

  it("drops section tags on other-speaker chapters", () => {
    for (const r of refs) {
      const s = mini.shiurim.find((x) => x.id === r.shiurId)!;
      for (const c of r.chapters) expect(s.notes!.chapters.find((ch) => ch.idx === c.idx)!.kind).not.toBe("other_speaker");
    }
  });

  it("source works point at works in works.json", () => {
    const ids = new Set(works.works.map((w) => w.id));
    const all = refs.flatMap((r) => r.sources);
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) expect(ids.has(s.workId)).toBe(true);
  });

  it("maps legacy keys to merged entities", () => {
    expect(redirects.legacy.length).toBeGreaterThan(0);
    const keys = redirects.legacy.map((l) => `${l.kind}:${l.oldKey}`);
    expect(new Set(keys).size).toBe(keys.length);
    const ids = {
      person: new Set(people.people.map((p) => p.id)),
      work: new Set(works.works.map((w) => w.id)),
      concept: new Set(concepts.concepts.map((c) => c.id)),
      topic: new Set(topics.tree.map((t) => t.id)),
    };
    for (const l of redirects.legacy) {
      if (l.target === null) expect(l.via).toBeNull();
      else expect(ids[l.target.kind].has(l.target.id), `${l.kind}:${l.oldKey}`).toBe(true);
    }
    // A concept merged into a topic redirects to the topic.
    for (const l of redirects.legacy.filter((x) => x.target?.kind === "concept")) {
      expect(concepts.concepts.find((c) => c.id === l.target!.id)!.mergedIntoTopic).toBeNull();
    }
    expect(redirects.legacy.filter((l) => l.via === "name").length).toBeGreaterThan(50);
  });

  it("never reads the poisoned files (canary absent from the whole output, including aggregates)", () => {
    expect(toJson(mini.aggregates.files)).not.toContain(POISON_CANARY);
    // The fixture's poisoned files exist, so the test is meaningful.
    expect(readFileSync(join(MINI_DATA, "derived/corpus/raw/asr-variants.json"), "utf8")).toContain(POISON_CANARY);
  });
});
