/** Typed access to `Search.module.css` (same pattern as `shell/styles.ts`); a test checks the list. */
import raw from "./Search.module.css";

export const SEARCH_CLASSES = [
  "aiNote",
  "bar",
  "button",
  "chip",
  "chips",
  "form",
  "group",
  "groupLabel",
  "groupList",
  "groupTitle",
  "hit",
  "hitLink",
  "hits",
  "input",
  "lead",
  "matched",
  "muted",
  "notice",
  "option",
  "optionMeta",
  "page",
  "popup",
  "results",
  "snippet",
  "status",
  "time",
  "title",
  "visuallyHidden",
] as const;

export type SearchClass = (typeof SEARCH_CLASSES)[number];

export const searchStyles: Readonly<Record<SearchClass, string>> = Object.fromEntries(
  SEARCH_CLASSES.map((k) => [k, (raw as Readonly<Record<string, string | undefined>>)[k] ?? k]),
) as Record<SearchClass, string>;
