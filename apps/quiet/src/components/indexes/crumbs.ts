/**
 * Breadcrumbs and page paths of the corpus-entry indexes: Indexes (the title page's index list) ›
 * the index › the entry.
 */
import { corpusLabel } from "@emunas/i18n";
import { formatQuiet } from "@emunas/links";
import type { Ed } from "../../lib/edition.ts";
import { INDEXES_ANCHOR, type Crumb } from "../../lib/nav.ts";
import { useT } from "../../i18n/index.ts";
import type { Run } from "./model.ts";

/** The corpus-entry indexes (C2.1) and their titles from the shared vocabulary. */
export type EntryIndex = "people" | "sources" | "glossary";

const ENTRY_INDEX_LABEL = { people: "index.names", sources: "index.sources", glossary: "index.glossary" } as const;

export function entryIndexTitle(ed: Ed, index: EntryIndex): string {
  return corpusLabel(ENTRY_INDEX_LABEL[index], ed);
}

export function entryIndexHref(ed: Ed, index: EntryIndex): string {
  return formatQuiet({ kind: "index", ed, index });
}

/** Indexes › the index › the entry (› `extra`, e.g. "all shiurim", with the entry linked). */
export function entryCrumbs(ed: Ed, index: EntryIndex, entry?: { run: Run; href?: string }, extra?: string): Crumb[] {
  const t = useT(ed);
  const out: Crumb[] = [
    { label: t("nav.indexes"), href: `${formatQuiet({ kind: "home", ed })}#${INDEXES_ANCHOR}` },
    { label: entryIndexTitle(ed, index), href: entryIndexHref(ed, index) },
  ];
  if (entry) {
    const linked = extra !== undefined && entry.href !== undefined;
    out.push({ label: entry.run.text, lang: entry.run.lang, dir: entry.run.dir, ...(linked ? { href: entry.href } : {}) });
  }
  if (extra !== undefined) out.push({ label: extra });
  return out;
}
