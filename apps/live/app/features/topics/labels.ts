import type { UiLang } from "@emunas/i18n";
import type { FacetLabel } from "../../data/index.ts";

/**
 * The loshon-hakodesh name shown beside a topic's label (concept-live-corpus C.2): `he`, else the
 * Yiddish form (the tree leaves `he` out when it equals the Yiddish one). Null when it would repeat
 * the label already shown in the interface language.
 */
export function hebrewName(label: FacetLabel, ui: UiLang): string | null {
  if (ui === "yi") return label.he && label.he !== label.yi ? label.he : null;
  const he = label.he ?? label.yi;
  return he && he !== label.en ? he : null;
}
