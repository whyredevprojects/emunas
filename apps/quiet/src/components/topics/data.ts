/**
 * Build-time source of the topic pages: the corpus layer (C1.8 reader), the catalog rows and the
 * calendar's occasions (`.corpus/index.json`, `occasions.json`, through the calendar loader) and
 * chapter titles from `.corpus/shiurim/<id>.json`. Reads `.corpus/` only, never the pipeline's data
 * folder. Without a layer (or a catalog) there are no topic pages and the calendar prints no
 * cross-line.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { IndexRow, LocalizedText, PublicShiur } from "@emunas/corpus/public";
import { quietLayer, type QuietLayer } from "../corpus/layer.ts";
import { loadCalendarData } from "../calendar/data.ts";
import type { CalendarData } from "../calendar/model.ts";
import type { TopicsSource } from "./model.ts";

/** Ids that may name a file: no path separators, no dot segments. */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;

/** A topics source from a loaded layer and calendar data (`corpusDir`: where `shiurim/` is). */
export function topicsSourceOf(layer: QuietLayer, calendar: CalendarData, corpusDir: string | null): TopicsSource {
  const rows = new Map<string, IndexRow>(calendar.index.shiurim.map((r) => [r.id, r]));
  const chapters = new Map<string, Map<number, LocalizedText>>();
  const chaptersOf = (shiurId: string): Map<number, LocalizedText> => {
    const hit = chapters.get(shiurId);
    if (hit) return hit;
    const map = new Map<number, LocalizedText>();
    const path = corpusDir !== null && SAFE_ID.test(shiurId) && rows.has(shiurId) ? join(corpusDir, "shiurim", `${shiurId}.json`) : null;
    if (path && existsSync(path)) {
      const shiur = JSON.parse(readFileSync(path, "utf8")) as Pick<PublicShiur, "notes">;
      for (const c of shiur.notes?.chapters ?? []) if (Number.isInteger(c.idx) && c.title) map.set(c.idx, c.title);
    }
    chapters.set(shiurId, map);
    return map;
  };
  return {
    topics: layer.topics,
    topicDetail: (id) => layer.topicDetail(id),
    occasionTopics: layer.occasionTopics,
    concept: (id) => layer.concept(id),
    person: (id) => layer.person(id),
    work: (id) => layer.work(id),
    hasPage: (kind, id) => layer.hasPage(kind, id),
    rows,
    occasions: calendar.occasions,
    chapterTitle: (shiurId, idx) => chaptersOf(shiurId).get(idx) ?? null,
  };
}

let cached: { key: string; source: TopicsSource } | null = null;

/** The topics source for this build (memoised). The layer, and so the corpus, is required. */
export function topicsSource(): TopicsSource {
  const layer = quietLayer();
  const key = layer.dir;
  if (cached && cached.key === key) return cached.source;
  const calendar = loadCalendarData();
  if (calendar === null) throw new Error("topics: no .corpus/ calendar data (run npm run corpus:build)");
  const source = topicsSourceOf(layer, calendar, dirname(layer.dir));
  cached = { key, source };
  return source;
}

/** The layer itself (labels and counts the pages need beside the source). */
export function topicsLayer(): QuietLayer {
  return quietLayer();
}
