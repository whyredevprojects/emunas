/**
 * topics.json (corpus-wave-plan §3.3; Quiet C4.1, Live C.2): the taxonomy with visible recounts
 * and, per topic, the description, hubs, three grades, children, co-tagged topics, threads,
 * stories and occasion links. Counts and grades cover the topic and its descendants; co-topics,
 * threads and section joins for stories are computed from visible tags only.
 */
import type {
  LayerGradeRow,
  LayerStoriesFile,
  LayerThreadsFile,
  LayerTopicDetail,
  LayerTopicNode,
  LayerTopicsFile,
  LayerTouchedRow,
} from "../public/corpus-layer.ts";
import { cmpStr, type LayerContext } from "./context.ts";
import type { TopicIn } from "./input/schemas.ts";
import type { TagIndex } from "./tag-index.ts";

/** "The shiur is about this" (Quiet C4.1). */
export const MAIN_SALIENCE = 0.6;
/** Hubs per topic ("begin here", at most ten). */
export const HUB_SIZE = 10;
/** Co-tagged topics listed per topic, and the minimum number of shared sections. */
export const CO_TOPICS_MAX = 8;
export const CO_TOPICS_MIN_SECTIONS = 2;

export interface TopicsInput {
  tags: TagIndex;
  threads: LayerThreadsFile;
  stories: LayerStoriesFile;
  /** Existing ids of the other entity kinds (for `sameAs`). */
  conceptIds: ReadonlySet<string>;
  personIds: ReadonlySet<string>;
  workIds: ReadonlySet<string>;
  /** topic id → occasion keys. */
  occasionsOf: ReadonlyMap<string, readonly string[]>;
}

export interface TopicsResult {
  file: LayerTopicsFile;
  /** Parents that do not exist (the topic is shown at the top). */
  orphaned: number;
}

export function buildTopics(ctx: LayerContext, x: TopicsInput): TopicsResult {
  const live: TopicIn[] = ctx.input.topics.filter((t) => ctx.isLive("topics", t.id));
  const ids = new Set(live.map((t) => t.id));
  let orphaned = 0;
  const parentOf = new Map<string, string | null>();
  for (const t of live) {
    const p = t.parentId === null ? null : ctx.resolve("topics", t.parentId);
    if (t.parentId !== null && (p === null || !ids.has(p) || p === t.id)) orphaned++;
    parentOf.set(t.id, p !== null && ids.has(p) && p !== t.id ? p : null);
  }
  const children = new Map<string, string[]>();
  for (const t of live) {
    const p = parentOf.get(t.id) ?? null;
    if (p === null) continue;
    const l = children.get(p) ?? [];
    l.push(t.id);
    children.set(p, l);
  }
  /** The topic and every descendant (cycle-safe). */
  const subtree = (id: string): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    const stack = [id];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      out.push(cur);
      for (const c of children.get(cur) ?? []) stack.push(c);
    }
    return out;
  };

  // Stories per topic, through the chapter each visible telling sits in.
  const storiesOf = new Map<string, Map<string, number>>();
  for (const s of x.stories.stories) {
    for (const t of s.tellings) {
      if (t.chapterIdx === null) continue;
      for (const topicId of x.tags.sectionsOf.get(t.shiurId)?.get(t.chapterIdx) ?? []) {
        let m = storiesOf.get(topicId);
        if (!m) storiesOf.set(topicId, (m = new Map()));
        m.set(s.id, s.tellings.length);
      }
    }
  }
  const threadsOf = new Map<string, { id: string; n: number }[]>();
  for (const th of x.threads.threads) {
    for (const topicId of th.topicIds) {
      const l = threadsOf.get(topicId) ?? [];
      l.push({ id: th.id, n: th.shiurCount });
      threadsOf.set(topicId, l);
    }
  }

  const share = (id: string) => ctx.input.shiurTags.get(id)?.otherSpeakerShare ?? 0;
  const maxShare = ctx.policy.featured.maxOtherSpeakerShare;
  const tree: LayerTopicNode[] = [];
  const detail: LayerTopicDetail[] = [];
  for (const t of live) {
    const sub = subtree(t.id);
    const subSet = new Set(sub);
    const sal = new Map<string, number>();
    const chapters = new Map<string, Set<number>>();
    for (const id of sub) {
      for (const [shiurId, s] of x.tags.shiurLevel.get(id) ?? []) sal.set(shiurId, Math.max(sal.get(shiurId) ?? 0, s));
      for (const [shiurId, idxs] of x.tags.sectionLevel.get(id) ?? []) {
        let set = chapters.get(shiurId);
        if (!set) chapters.set(shiurId, (set = new Set()));
        for (const i of idxs) set.add(i);
      }
    }
    const members = [...new Set([...sal.keys(), ...chapters.keys()])].sort(ctx.cmpCatalog);
    const main: LayerGradeRow[] = [];
    const discussed: LayerGradeRow[] = [];
    const touched: LayerTouchedRow[] = [];
    for (const shiurId of members) {
      const s = sal.get(shiurId);
      if (s !== undefined && s >= MAIN_SALIENCE) main.push({ shiurId, salience: s });
      else if (s !== undefined) discussed.push({ shiurId, salience: s });
      else {
        const chs = [...(chapters.get(shiurId) ?? [])]
          .map((idx) => ({ idx, t: ctx.chapter(shiurId, idx)?.t ?? 0 }))
          .sort((a, b) => a.t - b.t || a.idx - b.idx);
        touched.push({ shiurId, chapters: chs });
      }
    }

    // Hubs: the pipeline's picks that are still visible and not by another speaker, refilled by salience.
    const hubs: string[] = [];
    const memberSet = new Set(members);
    const eligible = (id: string) => ctx.V.has(id) && memberSet.has(id) && share(id) < maxShare && !hubs.includes(id);
    for (const id of t.hubShiurIds) if (hubs.length < HUB_SIZE && eligible(id)) hubs.push(id);
    const ranked = [...sal.entries()].sort((a, b) => b[1] - a[1] || ctx.cmpCatalog(a[0], b[0]));
    for (const [id] of ranked) if (hubs.length < HUB_SIZE && eligible(id)) hubs.push(id);

    // Co-tagged topics on the same visible sections (direct tags of this topic).
    const co = new Map<string, number>();
    for (const [shiurId, idxs] of x.tags.sectionLevel.get(t.id) ?? []) {
      const secs = x.tags.sectionsOf.get(shiurId);
      for (const idx of idxs) for (const other of secs?.get(idx) ?? []) if (!subSet.has(other)) co.set(other, (co.get(other) ?? 0) + 1);
    }
    const ancestors = new Set<string>();
    for (let p = parentOf.get(t.id) ?? null; p !== null && !ancestors.has(p); p = parentOf.get(p) ?? null) ancestors.add(p);
    const coTopics = [...co.entries()]
      .filter(([id, n]) => n >= CO_TOPICS_MIN_SECTIONS && !ancestors.has(id))
      .sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0]))
      .slice(0, CO_TOPICS_MAX)
      .map(([id, sections]) => ({ id, sections }));

    const storyCounts = new Map<string, number>();
    for (const id of sub) for (const [sid, n] of storiesOf.get(id) ?? []) storyCounts.set(sid, n);
    const storyIds = [...storyCounts.entries()].sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0])).map(([id]) => id);
    const threadIds = [...(threadsOf.get(t.id) ?? [])].sort((a, b) => b.n - a.n || cmpStr(a.id, b.id)).map((e) => e.id);

    const sameAs: NonNullable<LayerTopicNode["sameAs"]> = {};
    const sa = t.sameAs;
    if (sa?.conceptId !== undefined) {
      const id = ctx.resolve("concepts", sa.conceptId);
      if (id !== null && x.conceptIds.has(id)) sameAs.conceptId = id;
    }
    if (sa?.personId !== undefined) {
      const id = ctx.resolve("people", sa.personId);
      if (id !== null && x.personIds.has(id)) sameAs.personId = id;
    }
    if (sa?.workId !== undefined) {
      const id = ctx.resolve("works", sa.workId);
      if (id !== null && x.workIds.has(id)) sameAs.workId = id;
    }

    const count = members.length;
    const label: LayerTopicNode["label"] = { en: t.label.en, yi: t.label.yi };
    if (t.label.he !== undefined) label.he = t.label.he;
    tree.push({
      id: t.id,
      parentId: parentOf.get(t.id) ?? null,
      level: t.level,
      label,
      count,
      sameAs: Object.keys(sameAs).length > 0 ? sameAs : null,
      reviewed: t.reviewStatus === "reviewed",
      pages: { quiet: count > 0, live: count > 0 },
      gateway: t.level === 1 || count > ctx.policy.thresholds.quiet.topicGatewayAbove,
    });
    detail.push({
      id: t.id,
      description: t.description === null ? null : { en: t.description.en, yi: t.description.yi },
      hubs,
      grades: { main, discussed, touched },
      children: [...(children.get(t.id) ?? [])],
      coTopics,
      threadIds,
      storyIds,
      occasions: [...(x.occasionsOf.get(t.id) ?? [])],
    });
  }
  return { file: { tree, detail }, orphaned };
}
