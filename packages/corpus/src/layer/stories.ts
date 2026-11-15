/**
 * stories.json and threads.json (corpus-wave-plan §3.3): merged stories with their visible tellings,
 * and teaching clusters ("threads") with their visible members. A telling or member counts only
 * when its shiur is visible, its story/insight survived projection and, under D6, its category is
 * in general browse. A story with no visible telling and a cluster left with fewer than two
 * shiurim are dropped.
 */
import { momentId } from "../public/moment-id.ts";
import type {
  LayerCountLint,
  LayerMomentRef,
  LayerStoriesFile,
  LayerStory,
  LayerStoryPerson,
  LayerThread,
  LayerThreadsFile,
} from "../public/corpus-layer.ts";
import { cmpStr, type LayerContext } from "./context.ts";

const momentTime = (ctx: LayerContext, shiurId: string, kind: "stories" | "insights", id: string): number | null => {
  const list = ctx.shiur(shiurId)?.notes?.[kind] ?? [];
  return list.find((m) => m.id === id)?.t ?? null;
};

export interface StoriesResult {
  file: LayerStoriesFile;
  byId: Map<string, LayerStory>;
  /** Stories with no visible telling (left out). */
  withoutTelling: number;
}

/**
 * @param personOf how a story's `people[]` entry is shown: a linked person id, or plain text.
 */
export function buildStories(ctx: LayerContext, personOf: (raw: string) => LayerStoryPerson): StoriesResult {
  const out: LayerStory[] = [];
  let withoutTelling = 0;
  const pol = ctx.policy.thresholds;
  for (const s of ctx.input.stories ?? []) {
    if (!ctx.isLive("stories", s.id)) continue;
    const seen = new Set<string>();
    const tellings: LayerMomentRef[] = [];
    for (const t of s.tellings) {
      if (!ctx.V.isVisibleTelling(t)) continue;
      const mid = momentId(t.shiurId, "st", t.storyIndex);
      if (seen.has(mid)) continue;
      seen.add(mid);
      tellings.push(ctx.momentRef(t.shiurId, mid, momentTime(ctx, t.shiurId, "stories", mid)));
    }
    if (tellings.length === 0) {
      withoutTelling++;
      continue;
    }
    tellings.sort(ctx.cmpRef);
    const people: LayerStoryPerson[] = [];
    const shown = new Set<string>();
    for (const raw of s.people) {
      const p = personOf(raw);
      const key = "id" in p ? `id:${p.id}` : `name:${p.name}`;
      if (shown.has(key)) continue;
      shown.add(key);
      people.push(p);
    }
    out.push({
      id: s.id,
      title: { en: s.title.en, yi: s.title.yi },
      retelling: { en: s.retelling.en, yi: s.retelling.yi },
      people,
      attributionVaries: s.attributionVaries,
      tellings,
      shiurCount: new Set(tellings.map((t) => t.shiurId)).size,
      reviewed: s.reviewStatus === "reviewed",
      pages: { quiet: tellings.length >= pol.quiet.storyPageMinTellings, live: tellings.length >= pol.live.storyPageMinTellings },
    });
  }
  out.sort((a, b) => cmpStr(a.id, b.id));
  return { file: { stories: out }, byId: new Map(out.map((s) => [s.id, s])), withoutTelling };
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
};
const STATED_RE = new RegExp(
  `\\b(\\d+|${Object.keys(NUMBER_WORDS).join("|")})\\s+(other\\s+|different\\s+|separate\\s+)?(?:shiurim|shiurs|talks|lectures|tellings)\\b`,
  "gi",
);

/** Numbers of shiurim stated in a summary ("in five shiurim"); "N other shiurim" counts this one too. */
export function statedShiurCounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(STATED_RE)) {
    const w = m[1]!.toLowerCase();
    const n = /^\d+$/.test(w) ? Number(w) : NUMBER_WORDS[w];
    if (n === undefined) continue;
    out.push(m[2]?.toLowerCase().startsWith("other") ? n + 1 : n);
  }
  return out;
}

export interface ThreadsResult {
  file: LayerThreadsFile;
  byId: Map<string, LayerThread>;
  /** Clusters left with fewer than two visible shiurim. */
  belowTwo: number;
  lint: LayerCountLint[];
}

export function buildThreads(ctx: LayerContext): ThreadsResult {
  const out: LayerThread[] = [];
  const lint: LayerCountLint[] = [];
  let belowTwo = 0;
  const pol = ctx.policy.threads;
  for (const c of ctx.input.teachingClusters ?? []) {
    if (!ctx.isLive("threads", c.id)) continue;
    const seen = new Set<string>();
    const members: LayerMomentRef[] = [];
    for (const m of c.members) {
      if (!ctx.V.isVisibleClusterMember(m)) continue;
      const mid = momentId(m.shiurId, "i", m.insightIndex);
      if (seen.has(mid)) continue;
      seen.add(mid);
      members.push(ctx.momentRef(m.shiurId, mid, momentTime(ctx, m.shiurId, "insights", mid)));
    }
    const shiurCount = new Set(members.map((m) => m.shiurId)).size;
    if (shiurCount < 2) {
      belowTwo++;
      continue;
    }
    members.sort(ctx.cmpRef);
    const years = members.map((m) => m.year).filter((y): y is number => y !== null);
    const topicIds: string[] = [];
    for (const raw of c.topicIds) {
      const id = ctx.resolve("topics", raw);
      if (id !== null && !topicIds.includes(id)) topicIds.push(id);
    }
    for (const stated of new Set(statedShiurCounts(c.summary.en))) {
      if (stated !== shiurCount) lint.push({ threadId: c.id, stated, visible: shiurCount });
    }
    out.push({
      id: c.id,
      label: { en: c.label.en, yi: c.label.yi },
      summary: { en: c.summary.en, yi: c.summary.yi },
      topicIds,
      members,
      shiurCount,
      datedCount: years.length,
      years: years.length > 0 ? [Math.min(...years), Math.max(...years)] : null,
      page: shiurCount >= pol.pageMinShiurim,
      timeline: years.length >= pol.timelineMinDated,
      reviewed: c.reviewStatus === "reviewed",
    });
  }
  out.sort((a, b) => cmpStr(a.id, b.id));
  return { file: { threads: out }, byId: new Map(out.map((t) => [t.id, t])), belowTwo, lint };
}
