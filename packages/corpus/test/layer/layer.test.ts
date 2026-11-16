/**
 * C1.2 on the mini corpus: golden files for every layer file, determinism, the visible set, the
 * transcript rules (no forbidden keys, no poison canary, aliases from display fields only) and the
 * synthetic cases of the fixture (redirect chain and cycle, a cross-kind redirect, mergedInto, family,
 * `other` and `individual` people, a telling and a member in a not-done shiur, a low-confidence
 * member, an unknown work `kind`, work nesting, attributionVaries).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MINI_CORPUS_SYNTHETIC, POISON_CANARY, readMiniCorpusPicks } from "../../scripts/make-mini-corpus.ts";
import { projectAndAggregate } from "../../src/aggregate/build.ts";
import { toJson } from "../../src/build/build.ts";
import {
  LAYER_FILES,
  LAYER_PERSON_GROUPS,
  LAYER_SCHEMA_VERSION,
  PERSON_GROUP_OF,
  type LayerConceptsFile,
  type LayerInfo,
  type LayerPeopleFile,
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
    // Retired ids are resolved internally; nothing about them is published.
    expect(names).not.toContain("redirects.json");
  });

  it("is deterministic", () => {
    const again = projectAndAggregate({ dataDir: MINI_DATA, policyDir: MINI_POLICY });
    expect(toJson(again.layer.files)).toBe(toJson(files));
  });

  it("layer.json states the version, inputs and counts", () => {
    expect(info.layerSchemaVersion).toBe(LAYER_SCHEMA_VERSION);
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

  it("resolves retired ids internally (chains, cycles dropped) and publishes none of them", () => {
    expect(info.counts.retiredIds).toBeGreaterThanOrEqual(4);
    expect(info.warnings).toContain("redirect people:syn-cycle-x dropped (cycle)");
    const text = toJson(files);
    for (const id of ["syn-chain-a", "syn-chain-b", S.mergedPersonId, S.crossKindPersonId, "the-sanzer-rav-and-the-business-competitor"]) {
      expect(text).not.toContain(`"${id}"`);
    }
    // A retired record leaves the entity files.
    expect(people.people.some((p) => p.id === S.mergedPersonId)).toBe(false);
    expect(stories.stories.some((s) => s.id === "the-sanzer-rav-and-the-business-competitor")).toBe(false);
  });

  it("follows a person redirected to a concept across kinds (shiur tags and story people)", () => {
    const concept = concepts.concepts.find((c) => c.id === picks.crossKindConceptId)!;
    expect(concept).toBeDefined();
    const r = refs.find((x) => x.shiurId === picks.crossKindShiurId)!;
    expect(r.personIds).not.toContain(S.crossKindPersonId);
    expect(r.conceptIds).toContain(concept.id);
    const st = stories.stories.find((x) => x.id === picks.crossKindStoryId)!;
    expect(st.people).toContainEqual({ name: concept.label.en, linked: false });
  });

  it("publishes no raw story names: only linked people and display names of corpus entities (C3.1)", () => {
    const raw = JSON.parse(readFileSync(join(MINI_DATA, "derived/corpus/stories.json"), "utf8")) as { id: string; people: string[] }[];
    const rawPeople = JSON.parse(readFileSync(join(MINI_DATA, "derived/corpus/people.json"), "utf8")) as { id: string; nameEn: string }[];
    const rawConcepts = JSON.parse(readFileSync(join(MINI_DATA, "derived/corpus/concepts.json"), "utf8")) as { label: { en: string } }[];
    const ids = new Set(rawPeople.map((p) => p.id));
    const unresolved = raw.flatMap((s) => s.people.filter((p) => !ids.has(p) && !p.startsWith("syn-")).map((name) => ({ story: s.id, name })));
    expect(unresolved.length).toBeGreaterThanOrEqual(3);
    const display = new Set([...rawPeople.map((p) => p.nameEn), ...rawConcepts.map((c) => c.label.en)]);
    for (const s of stories.stories) {
      for (const p of s.people) if ("name" in p) expect(display.has(p.name), `${s.id}: ${p.name}`).toBe(true);
    }
    const text = toJson(stories);
    for (const u of unresolved) {
      expect(text, u.story).not.toContain(JSON.stringify(u.name));
      const st = stories.stories.find((x) => x.id === u.story);
      if (st) expect(st.people.every((p) => "id" in p || display.has(p.name))).toBe(true);
    }
  });

  it("groups people by type in sefer order, with descriptions, and keeps `individual` in the other group (D2)", () => {
    for (const p of people.people) {
      expect(p.group).toBe(PERSON_GROUP_OF[p.type]);
      expect(p.groupOrder).toBe(LAYER_PERSON_GROUPS.indexOf(p.group));
    }
    expect(LAYER_PERSON_GROUPS[0]).toBe("tanach");
    expect(LAYER_PERSON_GROUPS[1]).toBe("malach");
    expect(LAYER_PERSON_GROUPS.at(-1)).toBe("other");
    const ind = people.people.find((p) => p.id === S.individualId)!;
    expect(ind).toMatchObject({ type: "individual", group: "other", pages: { quiet: false, live: false }, listed: { quiet: true, live: false } });
    expect(ind.description).toEqual({ en: "A gabbai in one story.", yi: "א גבאי אין איין מעשה." });
    expect(people.people.filter((p) => p.description === null).length).toBeGreaterThan(0);
  });

  it("excludes the Mashgiach's family by rule and keeps `other` people with one shiur out of every index", () => {
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

  it("takes generic from the data's kind and nesting: a childless genre work is listed, never a page; an unknown kind reads as sefer", () => {
    const parents = new Set(works.works.map((w) => w.parentWorkId).filter((p): p is string => p !== null));
    const genre = works.works.filter((w) => w.kind === "genre");
    expect(genre.length).toBeGreaterThan(0);
    for (const w of works.works) expect(w.generic, w.id).toBe(w.kind === "genre" && !parents.has(w.id));
    expect(genre.some((w) => w.generic)).toBe(true);
    for (const w of genre.filter((x) => x.generic)) expect(w.pages).toEqual({ quiet: false, live: false });
    const unknown = works.works.find((x) => x.id === picks.unknownKindWorkId)!;
    expect(unknown).toMatchObject({ kind: "sefer", generic: false });
  });

  it("makes a genre work with child works a family hub: not generic, a page by the usual threshold", () => {
    const hubs = works.works.filter((w) => w.kind === "genre" && works.works.some((c) => c.parentWorkId === w.id));
    expect(hubs.map((w) => w.id)).toEqual(expect.arrayContaining(["rashi", "talmud-bavli"]));
    for (const w of hubs) {
      expect(w.generic, w.id).toBe(false);
      expect(w.pages.quiet, w.id).toBe(w.count >= 2);
      expect(w.pages.live, w.id).toBe(w.count >= 3);
    }
  });

  it("nests works under their parent and orders the shelf by group, then position", () => {
    const pos = new Map(works.works.map((w, i) => [w.id, i]));
    const child = works.works.find((w) => w.id === picks.childWorkId)!;
    expect(child.parentWorkId).not.toBeNull();
    for (const w of works.works) {
      if (w.parentWorkId === null) continue;
      expect(pos.has(w.parentWorkId), w.id).toBe(true);
      expect(pos.get(w.parentWorkId)!, w.id).toBeLessThan(pos.get(w.id)!);
    }
    // Top level: shelf groups never interleave; works without a group come last.
    const groups = works.works.filter((w) => w.parentWorkId === null).map((w) => w.orderGroup);
    const seen: (string | null)[] = [];
    for (const g of groups) if (seen.at(-1) !== g) seen.push(g);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.at(-1)).toBeNull();
    // Tanach books by their order inside each Tanach group.
    const tanach = works.works.filter((w) => w.kind === "tanach-book" && w.parentWorkId === null);
    for (let i = 1; i < tanach.length; i++) {
      if (tanach[i]!.orderGroup === tanach[i - 1]!.orderGroup) expect(tanach[i]!.order!).toBeGreaterThanOrEqual(tanach[i - 1]!.order!);
    }
  });

  it("carries attributionVaries on stories", () => {
    expect(stories.stories.find((s) => s.id === picks.attributionVariesStoryId)?.attributionVaries).toBe(true);
    expect(stories.stories.some((s) => s.attributionVaries === false)).toBe(true);
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

  it("never reads the poisoned files (canary absent from the whole output, including aggregates)", () => {
    expect(toJson(mini.aggregates.files)).not.toContain(POISON_CANARY);
    // The fixture's poisoned files exist, so the test is meaningful.
    expect(readFileSync(join(MINI_DATA, "derived/corpus/raw/asr-variants.json"), "utf8")).toContain(POISON_CANARY);
  });
});
