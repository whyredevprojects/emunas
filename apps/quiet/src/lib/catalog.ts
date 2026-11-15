/**
 * Helpers for the catalog voice (concept-quiet §3, §5.4 part 1): what the catalog header shows and
 * which "where this title came from" notice applies.
 */
import { notice } from "@emunas/i18n";
import type { PublicCatalog, PublicShiur } from "@emunas/corpus/public";
import { useT } from "../i18n/index.ts";
import type { Ed } from "./edition.ts";

/** The fields of a shiur the catalog header reads (a `PublicShiur` fits). */
export type CatalogHeaderShiur = Pick<
  PublicShiur,
  "id" | "lang" | "catalog" | "parsha" | "zman" | "perek" | "years" | "duration" | "pathNotes"
>;

/**
 * The one-sentence notice for a catalog row that is not a printed Pocket Guide entry
 * (concept-quiet §5.2: "guessed rows visibly marked as such"), or null for a printed row.
 * Driven by `catalog.source` and `catalog.derived`; `catalog.note` is pipeline commentary and is
 * not shown.
 */
export function catalogNotice(catalog: Pick<PublicCatalog, "source" | "derived">, ed: Ed): string | null {
  if (catalog.source === "pocket-guide-2012") return null;
  const t = useT(ed);
  switch (catalog.derived) {
    case "filename":
      return t("catalog.derived.filename");
    case "dir-prefix":
      return t("catalog.derived.dirPrefix");
    default:
      return notice("uncatalogued", ed);
  }
}
