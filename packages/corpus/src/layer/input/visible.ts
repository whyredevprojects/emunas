/**
 * The visible set (corpus-wave-plan §3.2). `V` = shiurim whose `.corpus` status is `full` ∩ the
 * corpus `index.shiurIds`. A member (telling, cluster member, hub, tagged shiur, arc part,
 * exampleRef, section tag) counts only if its shiur is in V and the item it points to survived
 * projection (its moment id exists in the projected shiur), so low-confidence and suppressed items
 * drop out. With `visibility.followCategoryVisibility` (D6), tellings and cluster members must also
 * come from a category with `generalBrowse: true` in publish-policy. Section-level topic tags on
 * `other_speaker` chapters are dropped.
 *
 * needs_review shiurim are not `done`, so they are catalog-only and outside the corpus: never in V.
 */
import * as v from "valibot";
import { momentId } from "../../public/moment-id.ts";
import { readPolicyText } from "../../build/read.ts";
import { issueSummary } from "../../build/schemas.ts";
import type { CorpusPolicy } from "../policy.ts";

/** The part of a projected shiur (`PublicShiur`) the visible set needs. */
export interface VisibleShiurSource {
  id: string;
  status: "full" | "catalog-only";
  category: string;
  notes?: {
    chapters: readonly { idx: number; id: string; kind: string }[];
    stories: readonly { id: string }[];
    insights: readonly { id: string }[];
  };
}

/** Per-category placement read from publish-policy (only `generalBrowse` matters here). */
export type CategoryVisibility = Readonly<Record<string, { generalBrowse: boolean }>>;

const CategoryVisibilitySchema = v.object({
  categoryVisibility: v.optional(v.record(v.string(), v.object({ generalBrowse: v.optional(v.boolean(), true) })), {}),
});

/**
 * `categoryVisibility` from `site-policy/publish-policy.json`. Missing file → every category is in
 * general browse; an invalid block is fatal (reviewed file).
 */
export function loadCategoryVisibility(policyDir: string): CategoryVisibility {
  const text = readPolicyText(policyDir, "publish-policy.json");
  if (text === null) return {};
  const r = v.safeParse(CategoryVisibilitySchema, JSON.parse(text));
  if (!r.success) throw new Error(`site-policy/publish-policy.json categoryVisibility invalid: ${issueSummary(r.issues).join("; ")}`);
  return r.output.categoryVisibility;
}

/** Why a member does not count. */
export type DropReason =
  /** The shiur is not in the corpus index (not done, e.g. needs_review). */
  | "not-in-corpus"
  /** The shiur is in the corpus but not in this build (out of scope / unknown id). */
  | "not-built"
  /** The shiur is in the corpus but `.corpus` holds it as catalog-only (downgraded). */
  | "not-full"
  /** The extraction item did not survive projection (low confidence, suppressed, out of range). */
  | "item-dropped"
  /** The shiur's category is out of general browse and the policy follows category visibility. */
  | "category-hidden"
  /** A section tag on a chapter by another speaker. */
  | "other-speaker";

export interface VisibleSet {
  /** V. */
  readonly ids: ReadonlySet<string>;
  readonly followCategoryVisibility: boolean;
  has(shiurId: string): boolean;
  /** null when the shiur is in V. */
  shiurDrop(shiurId: string): DropReason | null;
  /** Category of a built shiur is in general browse (true for unknown ids). */
  generalBrowse(shiurId: string): boolean;
  /** Story telling `{shiurId, storyIndex}`; null = counts. */
  tellingDrop(t: { shiurId: string; storyIndex: number }): DropReason | null;
  /** Teaching-cluster member `{shiurId, insightIndex}`; null = counts. */
  clusterMemberDrop(m: { shiurId: string; insightIndex: number }): DropReason | null;
  /** Concept exampleRef `{shiurId, sectionIndex}`; null = counts. */
  exampleRefDrop(r: { shiurId: string; sectionIndex: number }): DropReason | null;
  /** Section-level topic tag; null = counts. */
  sectionTagDrop(shiurId: string, sectionIndex: number): DropReason | null;
  /** Hub, tagged shiur, arc part, entity shiurId: just V. */
  isVisible(shiurId: string): boolean;
  isVisibleTelling(t: { shiurId: string; storyIndex: number }): boolean;
  isVisibleClusterMember(m: { shiurId: string; insightIndex: number }): boolean;
  isVisibleExampleRef(r: { shiurId: string; sectionIndex: number }): boolean;
  isVisibleSectionTag(shiurId: string, sectionIndex: number): boolean;
}

export interface VisibleSetInput {
  /** Projected shiurim (`ProjectedCorpus.shiurim`). */
  shiurim: readonly VisibleShiurSource[];
  /** Corpus `index.shiurIds`. */
  corpusShiurIds: readonly string[];
  categoryVisibility: CategoryVisibility;
  policy: Pick<CorpusPolicy, "visibility">;
}

export function buildVisibleSet(input: VisibleSetInput): VisibleSet {
  const inCorpus = new Set(input.corpusShiurIds);
  const byId = new Map(input.shiurim.map((s) => [s.id, s]));
  const follow = input.policy.visibility.followCategoryVisibility;
  const ids = new Set<string>();
  const moments = new Set<string>();
  const otherSpeaker = new Set<string>();
  for (const s of input.shiurim) {
    if (s.status !== "full" || !inCorpus.has(s.id) || !s.notes) continue;
    ids.add(s.id);
    for (const c of s.notes.chapters) {
      moments.add(c.id);
      if (c.kind === "other_speaker") otherSpeaker.add(c.id);
    }
    for (const m of s.notes.stories) moments.add(m.id);
    for (const m of s.notes.insights) moments.add(m.id);
  }

  const shiurDrop = (shiurId: string): DropReason | null => {
    if (!inCorpus.has(shiurId)) return "not-in-corpus";
    const s = byId.get(shiurId);
    if (!s) return "not-built";
    if (!ids.has(shiurId)) return "not-full";
    return null;
  };
  const generalBrowse = (shiurId: string): boolean => {
    const s = byId.get(shiurId);
    if (!s) return true;
    return input.categoryVisibility[s.category]?.generalBrowse ?? true;
  };
  /** A moment id, or null when the index cannot form one. */
  const mid = (shiurId: string, kind: "st" | "i" | "s", index: number): string | null => {
    try {
      return momentId(shiurId, kind, index);
    } catch {
      return null;
    }
  };
  const itemDrop = (shiurId: string, kind: "st" | "i" | "s", index: number, browse: boolean): DropReason | null => {
    const d = shiurDrop(shiurId);
    if (d) return d;
    const m = mid(shiurId, kind, index);
    if (m === null || !moments.has(m)) return "item-dropped";
    if (browse && follow && !generalBrowse(shiurId)) return "category-hidden";
    return null;
  };
  const tellingDrop = (t: { shiurId: string; storyIndex: number }) => itemDrop(t.shiurId, "st", t.storyIndex, true);
  const clusterMemberDrop = (m: { shiurId: string; insightIndex: number }) => itemDrop(m.shiurId, "i", m.insightIndex, true);
  const exampleRefDrop = (r: { shiurId: string; sectionIndex: number }) => itemDrop(r.shiurId, "s", r.sectionIndex, false);
  const sectionTagDrop = (shiurId: string, sectionIndex: number): DropReason | null => {
    const d = itemDrop(shiurId, "s", sectionIndex, false);
    if (d) return d;
    return otherSpeaker.has(momentId(shiurId, "s", sectionIndex)) ? "other-speaker" : null;
  };

  return {
    ids,
    followCategoryVisibility: follow,
    has: (id) => ids.has(id),
    shiurDrop,
    generalBrowse,
    tellingDrop,
    clusterMemberDrop,
    exampleRefDrop,
    sectionTagDrop,
    isVisible: (id) => ids.has(id),
    isVisibleTelling: (t) => tellingDrop(t) === null,
    isVisibleClusterMember: (m) => clusterMemberDrop(m) === null,
    isVisibleExampleRef: (r) => exampleRefDrop(r) === null,
    isVisibleSectionTag: (id, i) => sectionTagDrop(id, i) === null,
  };
}
