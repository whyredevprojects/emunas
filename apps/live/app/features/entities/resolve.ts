/**
 * Which entity pages exist, so the browse pages only ever link to a page that has data
 * ("every entity link resolves", W4.2 acceptance).
 *
 * The rules mirror what the data build (W3.6, `data-build/emit.ts`) writes:
 * - `work/<key>.json` exists for every work in `facets.work` (every cited work, genre labels too);
 * - `entity/p/<key>.json` and `entity/c/<key>.json` exist for people and browse concepts with at least
 *   `ENTITY_FILE_MIN` shiurim; `facets.person` / `facets.concept` carry that count;
 * - `entity/o/<key>.json` exists for listed occasions with at least `ENTITY_FILE_MIN` shiurim. The
 *   occasion facet also counts uncatalogued file-name guesses, so the listed membership is read from
 *   `today.json` (the same occasion lists the emitter uses).
 *
 * A test (`test/resolve.test.ts`) runs the real emitter over the mini corpus and the repo's data and
 * checks these rules against the files it writes.
 */
import type { UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import type { EntityKind, FacetLabel, FacetsFile, TodayFile } from "./live-data.ts";

/** `EMIT_LIMITS.entityFileMin` in the data build. */
export const ENTITY_FILE_MIN = 2;

export type LinkKind = EntityKind | "w";

export interface EntityResolver {
  /** True when `/data/...` has a file for this entity. */
  has(kind: LinkKind, key: string): boolean;
  /** The page URL, or null when there is no page. */
  href(ui: UiLang, kind: LinkKind, key: string): string | null;
  /** Labels from `facets.json`, or null for an unknown key. */
  label(kind: LinkKind, key: string): FacetLabel | null;
}

const paths = livePaths();

export function createResolver(facets: FacetsFile, today: TodayFile | null): EntityResolver {
  const occasionMembers = (key: string): number => today?.occasions[key]?.shiurIds.length ?? 0;
  const facetOf = (kind: LinkKind) =>
    kind === "w" ? facets.work : kind === "p" ? facets.person : kind === "c" ? facets.concept : facets.occasion;

  function has(kind: LinkKind, key: string): boolean {
    if (!Object.hasOwn(facetOf(kind), key)) return false;
    switch (kind) {
      case "w":
        return true;
      case "p":
        return (facets.person[key]?.count ?? 0) >= ENTITY_FILE_MIN;
      case "c":
        return (facets.concept[key]?.count ?? 0) >= ENTITY_FILE_MIN;
      case "o":
        return occasionMembers(key) >= ENTITY_FILE_MIN;
    }
  }

  return {
    has,
    href(ui, kind, key) {
      if (!has(kind, key)) return null;
      switch (kind) {
        case "w":
          return paths.work(ui, key);
        case "p":
          return paths.person(ui, key);
        case "c":
          return paths.concept(ui, key);
        case "o":
          return paths.occasion(ui, key);
      }
    },
    label(kind, key) {
      const f = facetOf(kind);
      return Object.hasOwn(f, key) ? (f[key]?.label ?? null) : null;
    },
  };
}
