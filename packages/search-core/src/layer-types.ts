/**
 * The slice of the corpus layer (`.corpus/layer/`, corpus-wave-plan §3.3) the search builders read.
 * Types only; `@emunas/search-core/build` (`readSearchLayer`) fills it from the layer files.
 *
 * Every term in here comes from the entities' own display fields (layer `synonyms.json`, topic
 * labels). Nothing comes from an alias map, an ASR variant or a raw/ file: the layer has none, and
 * the build checks the synonyms against the display fields before using them.
 */
import type { LayerShiurRefs } from "@emunas/corpus/public";
import type { EntityDocKind } from "./types.ts";

export interface SearchLayerTopic {
  en: string;
  yi: string;
  he: string | null;
}

export interface SearchLayer {
  /** Topics with at least one visible shiur: id → labels. */
  topics: ReadonlyMap<string, SearchLayerTopic>;
  /** `<kind>:<id>` → folded display-field terms (layer synonyms.json). */
  synonyms: ReadonlyMap<string, readonly string[]>;
  /** Per-shiur refs (`shiur/<id>.json`). */
  refs: ReadonlyMap<string, LayerShiurRefs>;
  /** Story id → linked person ids that are facet-listed. */
  storyPeople: ReadonlyMap<string, readonly string[]>;
  /** Section moment id → concepts whose example section it is. */
  sectionConcepts: ReadonlyMap<string, readonly string[]>;
  /** Ids allowed in facets and moment entities, per kind (listed on at least one site). */
  facetIds: Readonly<Record<EntityDocKind, ReadonlySet<string>>>;
}

export const synonymKey = (kind: EntityDocKind, id: string): string => `${kind}:${id}`;
