/** The fields of a shiur the catalog header reads (concept-quiet §5.4 part 1; a `PublicShiur` fits). */
import type { PublicShiur } from "@emunas/corpus/public";

export type CatalogHeaderShiur = Pick<
  PublicShiur,
  "id" | "lang" | "catalog" | "parsha" | "zman" | "perek" | "years" | "duration" | "pathNotes"
>;
