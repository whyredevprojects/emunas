/**
 * The one-line global navigation (concept-quiet §4): Contents · Calendar · Indexes · Search ·
 * About. Paths come from `@emunas/links` so both sites agree on them.
 */
import { formatQuiet } from "@emunas/links";
import type { UiKey } from "../i18n/index.ts";
import type { Ed } from "./edition.ts";

export type NavId = "contents" | "calendar" | "indexes" | "search" | "about";

export interface NavItem {
  readonly id: NavId;
  readonly key: UiKey;
  readonly href: string;
}

/** Anchor on the title page that holds "the indexes, one line each" (concept-quiet §5.1). */
export const INDEXES_ANCHOR = "indexes";

export function navItems(ed: Ed): NavItem[] {
  return [
    { id: "contents", key: "nav.contents", href: formatQuiet({ kind: "index", ed, index: "contents" }) },
    { id: "calendar", key: "nav.calendar", href: formatQuiet({ kind: "index", ed, index: "calendar-parsha" }) },
    { id: "indexes", key: "nav.indexes", href: `${formatQuiet({ kind: "home", ed })}#${INDEXES_ANCHOR}` },
    { id: "search", key: "nav.search", href: formatQuiet({ kind: "search", ed }) },
    { id: "about", key: "nav.about", href: formatQuiet({ kind: "index", ed, index: "about" }) },
  ];
}

const SECTION_OF: ReadonlyArray<readonly [RegExp, NavId]> = [
  [/^\/(?:yi|en)\/(?:contents|section|series|shiur)\//, "contents"],
  [/^\/(?:yi|en)\/(?:calendar|years)\//, "calendar"],
  [/^\/(?:yi|en)\/(?:sources|stories|people|inyanim)\//, "indexes"],
  [/^\/(?:yi|en)\/search\//, "search"],
  [/^\/(?:yi|en)\/about\//, "about"],
];

/** Which nav item a page belongs to (for `aria-current`), or null (title page, root). */
export function navSectionOf(path: string): NavId | null {
  for (const [re, id] of SECTION_OF) if (re.test(path)) return id;
  return null;
}

/** One breadcrumb step. The last step is the current page and has no href. */
export interface Crumb {
  readonly label: string;
  readonly href?: string;
  /** For catalog text (section titles, shiur titles) whose script differs from the edition. */
  readonly lang?: string;
  readonly dir?: "rtl" | "ltr";
}
