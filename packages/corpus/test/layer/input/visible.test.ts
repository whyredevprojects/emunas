/**
 * The visible set (corpus-wave-plan §3.2): needs_review, downgraded, simcha/current and
 * confidence-dropped members.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectCorpus } from "../../../src/build/build.ts";
import { createDataReader } from "../../../src/build/read.ts";
import { readCorpusInput } from "../../../src/layer/input/load.ts";
import { buildVisibleSet, loadCategoryVisibility, type VisibleShiurSource } from "../../../src/layer/input/visible.ts";
import { DEFAULT_CORPUS_POLICY } from "../../../src/layer/policy.ts";
import { readMiniCorpusPicks } from "../../../scripts/make-mini-corpus.ts";
import { MINI_POLICY, REAL_POLICY, editJson, miniCopy, shiurFile, tmp } from "../../helpers.ts";

function shiur(id: string, opts: Partial<VisibleShiurSource> & { stories?: number[]; insights?: number[]; sections?: [number, string][] } = {}): VisibleShiurSource {
  const status = opts.status ?? "full";
  const s: VisibleShiurSource = { id, status, category: opts.category ?? "parsha" };
  if (status === "full") {
    s.notes = {
      chapters: (opts.sections ?? [[0, "main"], [1, "story"], [2, "other_speaker"]]).map(([idx, kind]) => ({ idx, id: `${id}~s${idx}`, kind })),
      stories: (opts.stories ?? [0, 1]).map((i) => ({ id: `${id}~st${i}` })),
      insights: (opts.insights ?? [0, 1, 2]).map((i) => ({ id: `${id}~i${i}` })),
    };
  }
  return s;
}

const CATS = { current: { generalBrowse: false }, simcha: { generalBrowse: false } };

function setOf(follow = true) {
  const shiurim = [
    shiur("yi-good-01"),
    // needs_review: not done → catalog-only and not in the corpus index
    shiur("yi-review-01", { status: "catalog-only" }),
    // downgraded: done and in the corpus, but the projector held it back as catalog-only
    shiur("yi-down-01", { status: "catalog-only" }),
    shiur("yi-simcha-01", { category: "simcha" }),
    shiur("yi-current-01", { category: "current" }),
    // story 1 and insight 2 dropped by the confidence filter (no moment)
    shiur("yi-lowconf-01", { stories: [0], insights: [0, 1] }),
  ];
  const corpus = ["yi-good-01", "yi-down-01", "yi-simcha-01", "yi-current-01", "yi-lowconf-01", "yi-not-built-01"];
  return buildVisibleSet({
    shiurim,
    corpusShiurIds: corpus,
    categoryVisibility: CATS,
    policy: { visibility: { followCategoryVisibility: follow } },
  });
}

describe("visible set (unit)", () => {
  const V = setOf();

  it("V = full ∩ corpus index", () => {
    expect([...V.ids].sort()).toEqual(["yi-current-01", "yi-good-01", "yi-lowconf-01", "yi-simcha-01"]);
  });

  it("needs_review shiurim are never members", () => {
    expect(V.shiurDrop("yi-review-01")).toBe("not-in-corpus");
    expect(V.tellingDrop({ shiurId: "yi-review-01", storyIndex: 0 })).toBe("not-in-corpus");
    expect(V.clusterMemberDrop({ shiurId: "yi-review-01", insightIndex: 0 })).toBe("not-in-corpus");
    expect(V.isVisible("yi-review-01")).toBe(false);
  });

  it("downgraded shiurim are never members", () => {
    expect(V.shiurDrop("yi-down-01")).toBe("not-full");
    expect(V.tellingDrop({ shiurId: "yi-down-01", storyIndex: 0 })).toBe("not-full");
    expect(V.exampleRefDrop({ shiurId: "yi-down-01", sectionIndex: 0 })).toBe("not-full");
    expect(V.shiurDrop("yi-not-built-01")).toBe("not-built");
  });

  it("confidence-dropped items do not count; their shiur still does", () => {
    expect(V.isVisible("yi-lowconf-01")).toBe(true);
    expect(V.tellingDrop({ shiurId: "yi-lowconf-01", storyIndex: 0 })).toBeNull();
    expect(V.tellingDrop({ shiurId: "yi-lowconf-01", storyIndex: 1 })).toBe("item-dropped");
    expect(V.clusterMemberDrop({ shiurId: "yi-lowconf-01", insightIndex: 2 })).toBe("item-dropped");
    expect(V.clusterMemberDrop({ shiurId: "yi-lowconf-01", insightIndex: 99 })).toBe("item-dropped");
    expect(V.exampleRefDrop({ shiurId: "yi-lowconf-01", sectionIndex: 7 })).toBe("item-dropped");
  });

  it("simcha/current tellings and cluster members are not members when the policy follows category visibility (D6)", () => {
    for (const id of ["yi-simcha-01", "yi-current-01"]) {
      expect(V.generalBrowse(id)).toBe(false);
      expect(V.tellingDrop({ shiurId: id, storyIndex: 0 })).toBe("category-hidden");
      expect(V.clusterMemberDrop({ shiurId: id, insightIndex: 0 })).toBe("category-hidden");
      // hubs, tagged shiurim, exampleRefs and section tags follow V only
      expect(V.isVisible(id)).toBe(true);
      expect(V.isVisibleExampleRef({ shiurId: id, sectionIndex: 0 })).toBe(true);
      expect(V.isVisibleSectionTag(id, 0)).toBe(true);
    }
    expect(V.generalBrowse("yi-good-01")).toBe(true);
    expect(V.isVisibleTelling({ shiurId: "yi-good-01", storyIndex: 0 })).toBe(true);
  });

  it("with followCategoryVisibility off, simcha/current members count", () => {
    const W = setOf(false);
    expect(W.followCategoryVisibility).toBe(false);
    expect(W.isVisibleTelling({ shiurId: "yi-simcha-01", storyIndex: 0 })).toBe(true);
    expect(W.isVisibleClusterMember({ shiurId: "yi-current-01", insightIndex: 1 })).toBe(true);
  });

  it("section tags on other_speaker chapters are dropped; exampleRefs there are not", () => {
    expect(V.sectionTagDrop("yi-good-01", 2)).toBe("other-speaker");
    expect(V.sectionTagDrop("yi-good-01", 1)).toBeNull();
    expect(V.exampleRefDrop({ shiurId: "yi-good-01", sectionIndex: 2 })).toBeNull();
    expect(V.sectionTagDrop("yi-good-01", 3)).toBe("item-dropped");
  });

  it("malformed indices never throw", () => {
    expect(V.tellingDrop({ shiurId: "yi-good-01", storyIndex: -1 })).toBe("item-dropped");
    expect(V.clusterMemberDrop({ shiurId: "yi-good-01", insightIndex: 1.5 })).toBe("item-dropped");
  });
});

describe("category visibility from publish-policy", () => {
  it("reads current and simcha as out of general browse", () => {
    const c = loadCategoryVisibility(REAL_POLICY);
    expect(c["current"]?.generalBrowse).toBe(false);
    expect(c["simcha"]?.generalBrowse).toBe(false);
    expect(c["parsha"]).toBeUndefined();
  });

  it("missing file → everything in general browse; invalid block → fatal", () => {
    const d = join(tmp(), "p");
    mkdirSync(d);
    expect(loadCategoryVisibility(d)).toEqual({});
    writeFileSync(join(d, "publish-policy.json"), JSON.stringify({ categoryVisibility: { current: { generalBrowse: "no" } } }));
    expect(() => loadCategoryVisibility(d)).toThrow(/categoryVisibility/);
  });
});

describe("visible set on the mini fixture (projection + corpus input)", () => {
  const picks = readMiniCorpusPicks();
  // Lower the picked insight below the publish policy's dropBelow, in a copy.
  const dataDir = miniCopy();
  editJson<{ insights: { evidence: { confidence: number } }[] }>(
    shiurFile(dataDir, picks.lowConfidenceMember.shiurId, "extraction"),
    (x) => void (x.insights[picks.lowConfidenceMember.insightIndex]!.evidence.confidence = 0.3),
  );
  const p = projectCorpus({ dataDir, policyDir: MINI_POLICY });
  const { input } = readCorpusInput(createDataReader(dataDir), { policy: DEFAULT_CORPUS_POLICY });
  const V = buildVisibleSet({
    shiurim: p.shiurim,
    corpusShiurIds: input!.index.shiurIds,
    categoryVisibility: loadCategoryVisibility(REAL_POLICY),
    policy: DEFAULT_CORPUS_POLICY,
  });

  it("V is the full shiurim of the corpus index", () => {
    const full = p.shiurim.filter((s) => s.status === "full").map((s) => s.id);
    expect(V.ids.size).toBeGreaterThan(0);
    for (const id of V.ids) expect(full).toContain(id);
    for (const id of input!.index.shiurIds) if (full.includes(id)) expect(V.has(id)).toBe(true);
  });

  it("a telling and a cluster member in a not-done shiur are dropped", () => {
    const story = input!.stories!.find((s) => s.id === picks.notDoneTellingStoryId)!;
    const t = story.tellings.find((x) => x.shiurId === picks.notDoneShiurId)!;
    expect(V.tellingDrop(t)).toBe("not-in-corpus");
    const cl = input!.teachingClusters!.find((c) => c.id === picks.notDoneMemberClusterId)!;
    const m = cl.members.find((x) => x.shiurId === picks.notDoneShiurId)!;
    expect(V.clusterMemberDrop(m)).toBe("not-in-corpus");
  });

  it("a cluster member whose insight is below the confidence threshold is dropped", () => {
    expect(V.isVisible(picks.lowConfidenceMember.shiurId)).toBe(true);
    expect(V.clusterMemberDrop(picks.lowConfidenceMember)).toBe("item-dropped");
    expect(V.clusterMemberDrop(picks.outOfRangeMember)).toBe("item-dropped");
  });

  it("the other members of the corpus resolve against projected moments", () => {
    const members = input!.teachingClusters!.flatMap((c) => c.members).filter((m) => V.has(m.shiurId));
    const counted = members.filter((m) => V.isVisibleClusterMember(m));
    expect(counted.length).toBe(members.length - 2);
    const tellings = input!.stories!.flatMap((s) => s.tellings).filter((t) => V.has(t.shiurId));
    expect(tellings.filter((t) => V.isVisibleTelling(t)).length).toBe(tellings.length);
  });
});
