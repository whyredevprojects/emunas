/** Typed access to `Browse.module.css` (same pattern as `shell/styles.ts`); a test checks the list. */
import raw from "./Browse.module.css";

export const BROWSE_CLASSES = [
  "aiNote",
  "button",
  "buttons",
  "chapterLink",
  "chapters",
  "chip",
  "chips",
  "filter",
  "groupTitle",
  "input",
  "kicker",
  "lead",
  "list",
  "meta",
  "moment",
  "momentKind",
  "moments",
  "muted",
  "page",
  "pager",
  "place",
  "placeLabel",
  "primary",
  "row",
  "rowLink",
  "section",
  "sectionTitle",
  "shelf",
  "shiur",
  "spark",
  "sparkBar",
  "sparkSvg",
  "sparkUnknown",
  "status",
  "title",
] as const;

export type BrowseClass = (typeof BROWSE_CLASSES)[number];

export const browseStyles: Readonly<Record<BrowseClass, string>> = Object.fromEntries(
  BROWSE_CLASSES.map((k) => [k, (raw as Readonly<Record<string, string | undefined>>)[k] ?? k]),
) as Record<BrowseClass, string>;
