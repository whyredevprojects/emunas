/**
 * Display labels for facet values. Data labels (occasions, series, works, people, concepts) come from
 * `facets.json` and are rendered direction-isolated with `<Text>`; fixed vocabularies come from
 * `@emunas/i18n` or this feature's strings.
 */
import { categoryLabel, formatHebrewYear, languageName, type Category, type UiLang } from "@emunas/i18n";
import { occasionLabel } from "../today/format.ts";
import type { FacetsFile, TopicNode } from "./live-data.ts";
import { UNDATED, type FacetKey } from "./model.ts";
import { exploreT, type ExploreKey } from "./strings.ts";

export interface ValueLabel {
  text: string;
  /** True for a data string (render with `<Text shiurLang>`), false for UI copy in the interface language. */
  data: boolean;
}

export function yearText(year: number, ui: UiLang): string {
  return formatHebrewYear(year, ui);
}

export function valueLabel(
  facet: FacetKey,
  value: string,
  facets: FacetsFile | null,
  ui: UiLang,
  topics: ReadonlyMap<string, TopicNode> | null = null,
): ValueLabel {
  const et = exploreT(ui);
  const ui_ = (text: string): ValueLabel => ({ text, data: false });
  const data = (text: string | undefined): ValueLabel => ({ text: text ?? value, data: true });
  switch (facet) {
    case "lang":
      return ui_(value === "en" || value === "yi" ? languageName(value, ui) : value);
    case "category":
      return ui_(categoryLabel(value as Category, ui) || value);
    case "occasion":
      return data(occasionLabel(value, facets, ui));
    case "series":
      return data(facets?.series[value]?.label[ui]);
    case "topic":
      return data(topics?.get(value)?.label[ui]);
    case "work":
      return data(facets?.work[value]?.label[ui]);
    case "person":
      return data(facets?.person[value]?.label[ui]);
    case "concept":
      return data(facets?.concept[value]?.label[ui]);
    case "year":
      return ui_(value === UNDATED ? et("explore.year.unknown") : yearText(Number(value), ui));
    case "duration":
    case "stories":
    case "ai":
    case "catalogued": {
      const key = `explore.${facet}.${value}`;
      return ui_(et.has(key) ? et(key as ExploreKey) : value);
    }
  }
}
