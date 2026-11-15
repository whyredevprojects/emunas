// My Shelf overview (W3.9): tech-live §1 routing `/:ui/shelf`, concept-live §5.8.
import { isUiLang } from "@emunas/i18n";
import type { JSX } from "react";
import { ShelfOverview, shelfT, useShelfT } from "../features/shelf/index.ts";
import { tFor, useUi } from "../i18n/index.ts";

export function meta({ params }: { params: Readonly<Record<string, string | undefined>> }) {
  const ui = isUiLang(params["ui"]) ? params["ui"] : "en";
  return [{ title: `${shelfT(ui)("shelf.title")} · ${tFor(ui)("site.name")}` }];
}

export default function Shelf(): JSX.Element {
  return <ShelfOverview ui={useUi()} t={useShelfT()} />;
}
