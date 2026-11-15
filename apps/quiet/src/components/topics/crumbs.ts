/**
 * Breadcrumbs of the topic pages: Indexes (the title page's index list) › ענינים › the topic's
 * place in the tree (gate first) › the topic (› all the shiurim, on a continuation page). Topic
 * names are the Hebrew headword in both editions.
 */
import { corpusLabel } from "@emunas/i18n";
import { formatQuiet } from "@emunas/links";
import type { Ed } from "../../lib/edition.ts";
import { INDEXES_ANCHOR, type Crumb } from "../../lib/nav.ts";
import { useT } from "../../i18n/index.ts";
import { topicHref, topicsIndexHref, type TopicPage } from "./model.ts";

export function topicCrumbs(ed: Ed, page: TopicPage, last?: string): Crumb[] {
  const out: Crumb[] = [
    { label: useT(ed)("nav.indexes"), href: `${formatQuiet({ kind: "home", ed })}#${INDEXES_ANCHOR}` },
    { label: corpusLabel("index.topics", ed), href: topicsIndexHref(ed) },
  ];
  for (const a of page.path) {
    out.push({ label: a.name.title.text, lang: a.name.title.lang, dir: a.name.title.dir, ...(a.href ? { href: a.href } : {}) });
  }
  const self = { label: page.name.title.text, lang: page.name.title.lang, dir: page.name.title.dir };
  if (last === undefined) out.push(self);
  else out.push({ ...self, href: topicHref(ed, page.id) }, { label: last });
  return out;
}
