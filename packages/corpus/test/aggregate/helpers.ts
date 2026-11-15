import type { Aggregates } from "../../src/aggregate/types.ts";
import type { PublicShiur } from "../../src/public/types.ts";

/** Checks shared by the mini-corpus and real-data aggregate tests. Returns violations (empty = ok). */
export function aggregateViolations(files: Aggregates, shiurim: readonly PublicShiur[]): string[] {
  const v: string[] = [];
  const ids = new Set(shiurim.map((s) => s.id));

  // every in-scope shiur in exactly one section listing
  const seen = new Map<string, number>();
  for (const sec of files.sections.sections) {
    if (sec.count !== sec.shiurIds.length) v.push(`section ${sec.key}: count ${sec.count} != ${sec.shiurIds.length}`);
    for (const id of sec.shiurIds) seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  for (const s of shiurim) {
    const n = seen.get(s.id) ?? 0;
    if (n !== 1) v.push(`${s.id} is in ${n} section listings`);
  }
  for (const id of seen.keys()) if (!ids.has(id)) v.push(`section lists unknown shiur ${id}`);

  // undated lane = shiurim without years; each year lists exactly its shiurim
  const undated = shiurim.filter((s) => s.years.length === 0).map((s) => s.id).sort();
  if (files.years.unknown.count !== undated.length) v.push(`undated count ${files.years.unknown.count} != ${undated.length}`);
  if (JSON.stringify([...files.years.unknown.shiurIds].sort()) !== JSON.stringify(undated)) v.push("undated ids differ");
  for (const y of files.years.years) {
    const want = shiurim.filter((s) => s.years.includes(y.year)).map((s) => s.id).sort();
    if (JSON.stringify([...y.shiurIds].sort()) !== JSON.stringify(want)) v.push(`year ${y.year} lists the wrong shiurim`);
    if (y.count !== want.length) v.push(`year ${y.year} count`);
  }

  // neighbours: one entry per shiur, prev/next consistent with the section listing
  const sections = new Map(files.sections.sections.map((s) => [s.key, s.shiurIds]));
  for (const s of shiurim) {
    const n = files.neighbours[s.id];
    if (!n) {
      v.push(`${s.id}: no neighbours entry`);
      continue;
    }
    const list = sections.get(n.section.of) ?? [];
    if (list[n.section.pos - 1] !== s.id) v.push(`${s.id}: section position wrong`);
    if (n.section.prev !== (list[n.section.pos - 2] ?? null)) v.push(`${s.id}: section prev wrong`);
    if (n.section.next !== (list[n.section.pos] ?? null)) v.push(`${s.id}: section next wrong`);
    if ((s.series === null) !== (n.series === null)) v.push(`${s.id}: series nav presence`);
    if (n.sameOccasion.includes(s.id)) v.push(`${s.id}: lists itself as same occasion`);
  }

  // occasions: each catalogued shiur with a parsha/zman appears once per value; sorted by year
  const firstYear = (id: string) => {
    const ys = shiurim.find((s) => s.id === id)?.years ?? [];
    return ys.length ? Math.min(...ys) : Number.POSITIVE_INFINITY;
  };
  for (const o of [...files.occasions.parshiyos, ...files.occasions.zmanim]) {
    const lists = "subs" in o ? [o.shiurim, ...o.subs.map((x) => x.shiurim)] : [o.shiurim];
    const total = lists.reduce((a, l) => a + l.length, 0);
    if (total !== o.count) v.push(`occasion ${o.key}: count ${o.count} != ${total}`);
    for (const l of lists) {
      for (let i = 1; i < l.length; i++) {
        if (firstYear(l[i - 1]!.id) > firstYear(l[i]!.id)) v.push(`occasion ${o.key}: not sorted by year`);
      }
    }
  }

  // series parts follow index series order
  for (const se of files.series.series) {
    if (se.count !== se.parts.length) v.push(`series ${se.id}: count`);
    if (se.groups) {
      const flat = se.groups.flatMap((g) => g.shiurIds).sort();
      if (JSON.stringify(flat) !== JSON.stringify(se.parts.map((p) => p.id).sort())) v.push(`series ${se.id}: groups do not cover parts`);
    }
  }

  // stories carry no retelling; every story of every shiur is listed once
  const storyIds = files.stories.stories.map((s) => s.id);
  const want = shiurim.flatMap((s) => s.notes?.stories.map((x) => x.id) ?? []);
  if (JSON.stringify([...storyIds].sort()) !== JSON.stringify([...want].sort())) v.push("stories.json does not list every story once");
  for (const s of files.stories.stories) if ("retelling" in s) v.push(`${s.id}: retelling in stories.json`);
  const grouped = files.stories.byPerson.flatMap((g) => g.storyIds).sort();
  if (JSON.stringify(grouped) !== JSON.stringify([...storyIds].sort())) v.push("stories byPerson does not cover every story once");

  // works: every published source with a work key is filed once
  const mentions = files.works.works.reduce((a, w) => a + w.mentionCount, 0);
  const filed = files.works.works.reduce((a, w) => a + w.unlocated.length + w.refs.reduce((b, r) => b + r.mentions.length, 0), 0);
  if (mentions !== filed) v.push(`works: mentionCount ${mentions} != filed ${filed}`);
  const sourcesWithWork = shiurim.reduce((a, s) => a + (s.notes?.sources.filter((x) => x.workKey !== null).length ?? 0), 0);
  if (mentions < sourcesWithWork) v.push(`works: ${mentions} mentions < ${sourcesWithWork} sources with a work`);
  for (const w of files.works.works) {
    for (const r of w.refs) for (const m of r.mentions) if (m.resolution === "unresolved") v.push(`${m.id}: unresolved under a ref`);
  }
  return v;
}

/** Field names that must not appear anywhere in an aggregate file. */
export const AGGREGATE_FORBIDDEN_KEYS = [
  "heardAs",
  "asrNotes",
  "segs",
  "startSeg",
  "endSeg",
  "questionSegs",
  "answerSegs",
  "segments",
  "transcriptKey",
  "audioKey",
  "asrModel",
  "retelling",
  "paragraphs",
  "abstract",
] as const;
