// A topic page (concept-live-corpus C.2): `features/topics` over `/data/topic/<id>.json`. The route,
// its prerender list and SEO (title from the prerendered page data) are C1.7's.
import { corpusLabel, isUiLang, type UiLang } from "@emunas/i18n";
import type { JSX } from "react";
import { useParams } from "react-router";
import { TopicPage } from "../features/topics/index.ts";
import { tFor } from "../i18n/index.ts";
import { clip } from "../seo/head.ts";
import { seoPageFor, TITLE_SEPARATOR, type SeoMetaArgs } from "../seo/meta.ts";

export function meta({ params, location, matches }: SeoMetaArgs): { title: string }[] {
  const ui: UiLang = isUiLang(params["ui"]) ? params["ui"] : "en";
  const page = seoPageFor(location.pathname, matches);
  const name = page?.title.trim() ? clip(page.title, 120) : corpusLabel("index.topics", ui);
  return [{ title: `${name}${TITLE_SEPARATOR}${tFor(ui)("site.name")}` }];
}

export default function Topic(): JSX.Element {
  const { ui: rawUi, topicId = "" } = useParams();
  const ui: UiLang = isUiLang(rawUi) ? rawUi : "en";
  return <TopicPage key={topicId} topicId={topicId} ui={ui} />;
}
