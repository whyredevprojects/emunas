// One part of My Shelf in full (W3.9): `/:ui/shelf/:section` (continue, queue, playlists[?id=],
// saved, notes, history, downloads).
import { isUiLang } from "@emunas/i18n";
import type { JSX } from "react";
import { useParams, useSearchParams } from "react-router";
import { ShelfSectionPage, isShelfSection, sectionTitleKey, shelfT, useShelfT } from "../features/shelf/index.ts";
import { tFor, useUi } from "../i18n/index.ts";

export function meta({ params }: { params: Readonly<Record<string, string | undefined>> }) {
  const ui = isUiLang(params["ui"]) ? params["ui"] : "en";
  const t = shelfT(ui);
  const s = params["section"];
  const title = isShelfSection(s) ? `${t(sectionTitleKey(s))} · ${t("shelf.title")}` : t("shelf.title");
  return [{ title: `${title} · ${tFor(ui)("site.name")}` }];
}

export default function ShelfSection(): JSX.Element {
  const { section } = useParams();
  const [search] = useSearchParams();
  return (
    <ShelfSectionPage
      ui={useUi()}
      t={useShelfT()}
      section={isShelfSection(section) ? section : null}
      playlistId={search.get("id")}
    />
  );
}
