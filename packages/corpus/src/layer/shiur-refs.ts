/**
 * shiur/<shiurId>.json (corpus-wave-plan §3.3): the corpus refs of one visible shiur. Ids only;
 * the page joins them with the entity files. Every id is live and points at an entity that is in
 * the layer files; excluded people are left out. Section tags of other-speaker chapters are gone.
 */
import { parseMomentId } from "../public/moment-id.ts";
import type {
  LayerConceptsFile,
  LayerPeopleFile,
  LayerShiurInsightRef,
  LayerShiurRefs,
  LayerShiurStoryRef,
  LayerStoriesFile,
  LayerThreadsFile,
  LayerWorksFile,
} from "../public/corpus-layer.ts";
import { cmpStr, type LayerContext } from "./context.ts";
import type { TagIndex } from "./tag-index.ts";

export interface ShiurRefsInput {
  tags: TagIndex;
  concepts: LayerConceptsFile;
  people: LayerPeopleFile;
  works: LayerWorksFile;
  stories: LayerStoriesFile;
  threads: LayerThreadsFile;
}

/** Resolved corpus work id per source moment of the visible shiurim. */
export function sourceWorkIndex(ctx: LayerContext, workIds: ReadonlySet<string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const shiurId of ctx.visibleIds) {
    const tags = ctx.tags(shiurId);
    if (!tags) continue;
    for (const src of ctx.shiur(shiurId)?.notes?.sources ?? []) {
      const i = parseMomentId(src.id)?.index;
      if (i === undefined) continue;
      const raw = tags.sourceWorkIds[i];
      if (raw === undefined || raw === null) continue;
      const id = ctx.resolve("works", raw);
      if (id !== null && workIds.has(id)) out.set(src.id, id);
    }
  }
  return out;
}

export function buildShiurRefs(ctx: LayerContext, x: ShiurRefsInput, sourceWork: ReadonlyMap<string, string>): Map<string, LayerShiurRefs> {
  const concepts = new Set(x.concepts.concepts.map((c) => c.id));
  const people = new Set(x.people.people.filter((p) => p.excluded === null).map((p) => p.id));
  const works = new Set(x.works.works.map((w) => w.id));
  // Every tag id is followed to its surviving entity, which may be of another kind (a person now a concept).
  const keep = { concepts, people, works } as const;
  const pickAll = (tags: { conceptIds: readonly string[]; personIds: readonly string[]; workIds: readonly string[] } | undefined) => {
    const out = { concepts: new Set<string>(), people: new Set<string>(), works: new Set<string>() };
    if (tags === undefined) return out;
    for (const [kind, raws] of [["concepts", tags.conceptIds], ["people", tags.personIds], ["works", tags.workIds]] as const) {
      for (const raw of raws) {
        const r = ctx.resolveRef(kind, raw);
        if (r === null || !(r.kind === "concepts" || r.kind === "people" || r.kind === "works")) continue;
        if (keep[r.kind].has(r.id)) out[r.kind].add(r.id);
      }
    }
    return out;
  };
  const sorted = (xs: Set<string>) => [...xs].sort(cmpStr);

  const storyRefs = new Map<string, LayerShiurStoryRef[]>();
  for (const s of x.stories.stories) {
    for (const t of s.tellings) {
      const l = storyRefs.get(t.shiurId) ?? [];
      l.push({ momentId: t.momentId, storyId: s.id, tellings: s.tellings.length, pages: { ...s.pages } });
      storyRefs.set(t.shiurId, l);
    }
  }
  const insightRefs = new Map<string, LayerShiurInsightRef[]>();
  const twoMember = ctx.policy.threads.twoMember;
  for (const th of x.threads.threads) {
    for (const m of th.members) {
      const ref: LayerShiurInsightRef = { momentId: m.momentId, threadId: th.id, shiurCount: th.shiurCount, years: th.years, page: th.page };
      if (th.shiurCount === 2 && !th.page) {
        if (twoMember === "none") continue;
        const other = th.members.find((o) => o.shiurId !== m.shiurId);
        if (other) ref.other = { ...other };
      }
      const l = insightRefs.get(m.shiurId) ?? [];
      l.push(ref);
      insightRefs.set(m.shiurId, l);
    }
  }
  const byMoment = <T extends { momentId: string }>(a: T, b: T) => {
    const pa = parseMomentId(a.momentId)?.index ?? 0;
    const pb = parseMomentId(b.momentId)?.index ?? 0;
    return pa - pb;
  };

  const out = new Map<string, LayerShiurRefs>();
  for (const shiurId of ctx.visibleIds) {
    const tags = ctx.tags(shiurId);
    const secs = x.tags.sectionsOf.get(shiurId);
    const notes = ctx.shiur(shiurId)?.notes;
    const picked = pickAll(tags);
    out.set(shiurId, {
      shiurId,
      otherSpeakerShare: tags?.otherSpeakerShare ?? null,
      topics: (x.tags.topicsOf.get(shiurId) ?? []).map((t) => ({ ...t })),
      chapters: secs ? [...secs.entries()].sort((a, b) => a[0] - b[0]).map(([idx, topicIds]) => ({ idx, topicIds: [...topicIds] })) : [],
      conceptIds: sorted(picked.concepts),
      personIds: sorted(picked.people),
      workIds: sorted(picked.works),
      sources: (notes?.sources ?? []).flatMap((s) => {
        const workId = sourceWork.get(s.id);
        return workId === undefined ? [] : [{ momentId: s.id, workId }];
      }),
      stories: (storyRefs.get(shiurId) ?? []).sort((a, b) => byMoment(a, b) || cmpStr(a.storyId, b.storyId)),
      insights: (insightRefs.get(shiurId) ?? []).sort((a, b) => byMoment(a, b) || cmpStr(a.threadId, b.threadId)),
    });
  }
  return out;
}
