/**
 * The one-line global navigation (concept-quiet §4): Contents · Calendar · Indexes · Search ·
 * About. Paths come from `@emunas/links` so both sites agree on them.
 *
 * The Indexes item covers the back matter in the order of concept-quiet-corpus C5: ענינים (topics,
 * `inyanim/`), ערכים (the glossary, `erachim/`), שמות (`people/`), מראי מקומות (`sources/`),
 * מעשיות (`stories/`); the calendar and years keep their own item.
 */
import { formatQuiet } from "@emunas/links";
import type { UiKey } from "../i18n/index.ts";
import { pathInEdition, type Ed } from "./edition.ts";

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
    // `/{ed}/calendar/` (the three ways in); @emunas/links has no index kind for that page.
    { id: "calendar", key: "nav.calendar", href: `${formatQuiet({ kind: "home", ed })}calendar/` },
    { id: "indexes", key: "nav.indexes", href: `${formatQuiet({ kind: "home", ed })}#${INDEXES_ANCHOR}` },
    { id: "search", key: "nav.search", href: formatQuiet({ kind: "search", ed }) },
    { id: "about", key: "nav.about", href: formatQuiet({ kind: "index", ed, index: "about" }) },
  ];
}

/** Matched against the path after the edition segment (`/he/search/` → `/search/`). */
const SECTION_OF: ReadonlyArray<readonly [RegExp, NavId]> = [
  [/^\/(?:contents|section|series|shiur)\//, "contents"],
  [/^\/(?:calendar|years)\//, "calendar"],
  [/^\/(?:inyanim|erachim|people|sources|stories)\//, "indexes"],
  [/^\/search\//, "search"],
  [/^\/about\//, "about"],
];

/** Which nav item a page belongs to (for `aria-current`), or null (title page, root). */
export function navSectionOf(path: string): NavId | null {
  const rest = pathInEdition(path);
  if (rest === null) return null;
  for (const [re, id] of SECTION_OF) if (re.test(rest)) return id;
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
