// A story page with the telling switcher (concept-live-corpus C.4, C2.7) over `/data/story/<id>.json`
// (stories told at least twice). An id with no story file is a 404.
import { isUiLang, type UiLang } from "@emunas/i18n";
import type { JSX } from "react";
import { useParams } from "react-router";
import { StoryPage } from "../features/maasios/StoryPage.tsx";
import { tFor } from "../i18n/index.ts";
import { clip } from "../seo/head.ts";
import { seoPageFor, TITLE_SEPARATOR, type SeoMetaArgs } from "../seo/meta.ts";

export function meta({ params, location, matches }: SeoMetaArgs): { title: string }[] {
  const ui: UiLang = isUiLang(params["ui"]) ? params["ui"] : "en";
  const page = seoPageFor(location.pathname, matches);
  const name = page?.title.trim() ? clip(page.title, 120) : tFor(ui)("page.maasios");
  return [{ title: `${name}${TITLE_SEPARATOR}${tFor(ui)("site.name")}` }];
}

export default function Story(): JSX.Element {
  const { ui: rawUi, storyId = "" } = useParams();
  const ui: UiLang = isUiLang(rawUi) ? rawUi : "en";
  return <StoryPage key={storyId} storyId={storyId} ui={ui} />;
}
