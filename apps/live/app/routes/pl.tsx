// Shared playlist (W3.9): `/:ui/pl#<base64url(JSON [shiurId, t, end?][])>`, decoded client-side.
import { isUiLang } from "@emunas/i18n";
import type { JSX } from "react";
import { SharedPlaylist, shelfT, useShelfT } from "../features/shelf/index.ts";
import { tFor, useUi } from "../i18n/index.ts";

export function meta({ params }: { params: Readonly<Record<string, string | undefined>> }) {
  const ui = isUiLang(params["ui"]) ? params["ui"] : "en";
  return [{ title: `${shelfT(ui)("pl.title")} · ${tFor(ui)("site.name")}` }];
}

export default function SharedPlaylistRoute(): JSX.Element {
  return <SharedPlaylist ui={useUi()} t={useShelfT()} />;
}
