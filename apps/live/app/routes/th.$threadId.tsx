// A thread page, "A teaching the Mashgiach returns to" (concept-live-corpus C.1, C3.3), over
// `/data/thread/<id>.json` (clusters of three or more visible shiurim). An id with no thread file is a
// 404. Thread pages are always noindex with no canonical (D8): `app/seo` classifies `/:ui/th/:id` as
// a thread and never makes it indexable.
import { corpusLabel, isUiLang, type UiLang } from "@emunas/i18n";
import type { JSX } from "react";
import { useParams } from "react-router";
import { ThreadPage } from "../features/threads/index.ts";
import { tFor } from "../i18n/index.ts";
import { clip } from "../seo/head.ts";
import { seoPageFor, TITLE_SEPARATOR, type SeoMetaArgs } from "../seo/meta.ts";

export function meta({ params, location, matches }: SeoMetaArgs): { title: string }[] {
  const ui: UiLang = isUiLang(params["ui"]) ? params["ui"] : "en";
  const page = seoPageFor(location.pathname, matches);
  const name = page?.title.trim() ? clip(page.title, 120) : corpusLabel("thread.heading", ui);
  return [{ title: `${name}${TITLE_SEPARATOR}${tFor(ui)("site.name")}` }];
}

export default function Thread(): JSX.Element {
  const { ui: rawUi, threadId = "" } = useParams();
  const ui: UiLang = isUiLang(rawUi) ? rawUi : "en";
  return <ThreadPage key={threadId} threadId={threadId} ui={ui} />;
}
