/** Typed access to `Series.module.css` (same pattern as `shell/styles.ts`); a test checks the list. */
import raw from "./Series.module.css";

export const SERIES_CLASSES = [
  "aiNote",
  "bar",
  "column",
  "columnTitle",
  "columns",
  "continue",
  "controls",
  "group",
  "groupTitle",
  "index",
  "indexEntry",
  "indexLink",
  "indexRow",
  "lead",
  "meta",
  "muted",
  "page",
  "parts",
  "progress",
  "state",
  "title",
  "viewLink",
] as const;

export type SeriesClass = (typeof SERIES_CLASSES)[number];

export const seriesStyles: Readonly<Record<SeriesClass, string>> = Object.fromEntries(
  SERIES_CLASSES.map((k) => [k, (raw as Readonly<Record<string, string | undefined>>)[k] ?? k]),
) as Record<SeriesClass, string>;
