/** Typed access to `Topics.module.css` (same pattern as `features/series/styles.ts`); a test checks the list. */
import raw from "./Topics.module.css";

export const TOPICS_CLASSES = [
  "cards",
  "chip",
  "chips",
  "crumbs",
  "description",
  "head",
  "hebrew",
  "label",
  "list",
  "meta",
  "more",
  "muted",
  "page",
  "row",
  "section",
  "sectionTitle",
  "subTitle",
  "term",
  "termName",
  "title",
] as const;

export type TopicsClass = (typeof TOPICS_CLASSES)[number];

export const topicsStyles: Readonly<Record<TopicsClass, string>> = Object.fromEntries(
  TOPICS_CLASSES.map((k) => [k, (raw as Readonly<Record<string, string | undefined>>)[k] ?? k]),
) as Record<TopicsClass, string>;
