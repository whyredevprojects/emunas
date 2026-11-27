/**
 * Typed access to `Today.module.css` (same pattern as `shell/styles.ts`); a test checks the list
 * against the stylesheet.
 */
import raw from "./Today.module.css";

export const TODAY_CLASSES = [
  "aiNote",
  "badge",
  "card",
  "cardMeta",
  "chip",
  "chipWhen",
  "chips",
  "cardTitle",
  "counter",
  "date",
  "header",
  "mix",
  "mixPlay",
  "moment",
  "momentKind",
  "momentText",
  "muted",
  "occasionTitle",
  "oneLiner",
  "page",
  "pending",
  "play",
  "row",
  "seasons",
  "section",
  "sectionLead",
  "sectionTitle",
  "title",
  "toggle",
] as const;

export type TodayClass = (typeof TODAY_CLASSES)[number];

export const todayStyles: Readonly<Record<TodayClass, string>> = Object.fromEntries(
  TODAY_CLASSES.map((k) => [k, (raw as Readonly<Record<string, string | undefined>>)[k] ?? k]),
) as Record<TodayClass, string>;
