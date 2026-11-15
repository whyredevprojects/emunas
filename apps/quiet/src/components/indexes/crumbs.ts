/**
 * Breadcrumbs and page paths of the AI indexes: Indexes (the title page's index list) › the
 * index › the entry.
 */
import { formatQuiet } from "@emunas/links";
import type { Ed } from "../../lib/edition.ts";
import { INDEXES_ANCHOR, type Crumb } from "../../lib/nav.ts";
import { useT } from "../../i18n/index.ts";
import { indexHref, type IndexKind, type Run } from "./model.ts";
import { useIndexesT } from "./strings.ts";

const TITLE_KEY = {
  sources: "sources.title",
  stories: "stories.title",
  people: "people.title",
  inyanim: "inyanim.title",
} as const;

export function indexTitle(ed: Ed, index: IndexKind): string {
  return useIndexesT(ed)(TITLE_KEY[index]);
}

export function indexCrumbs(ed: Ed, index: IndexKind, entry?: Run): Crumb[] {
  const t = useT(ed);
  const out: Crumb[] = [
    { label: t("nav.indexes"), href: `${formatQuiet({ kind: "home", ed })}#${INDEXES_ANCHOR}` },
    { label: indexTitle(ed, index), href: indexHref(ed, index) },
  ];
  if (entry) out.push({ label: entry.text, lang: entry.lang, dir: entry.dir });
  return out;
}
