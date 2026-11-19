import type { UiLang } from "@emunas/i18n";
import type { FacetLabel } from "../../data/index.ts";
import { labelText } from "../../i18n/content.ts";

/**
 * The loshon-hakodesh name shown beside a topic's label (concept-live-corpus C.2): `he`, else the
 * Yiddish form (the tree leaves `he` out when it equals the Yiddish one). Null when it would repeat
 * the label already shown in the interface language (`labelText`).
 */
export function hebrewName(label: FacetLabel, ui: UiLang): string | null {
  const he = label.he ?? label.yi;
  return he && he !== labelText(label, ui) ? he : null;
}
