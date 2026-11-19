/**
 * How a suggestion reads: its name and a small type line. Entity names are the corpus entity's own
 * display labels from the quick index (never a synonym, which is for matching only).
 */
import { formatHebrewYear, type UiLang } from "@emunas/i18n";
import type { JSX } from "react";
import { Text } from "../../components/Text.tsx";
import type { FacetLabel, QuickEntity } from "./live-data.ts";
import type { Suggestion } from "./engine.ts";
import { searchT } from "./strings.ts";
import { searchStyles as s } from "./styles.ts";
import { labelText } from "../../i18n/content.ts";

function labelIn(label: FacetLabel, ui: UiLang): string {
  return labelText(label, ui) || label.he || label.en;
}

/**
 * Which entity label to show per interface language, in order: Yiddish falls back to the Hebrew label
 * (works have no Yiddish title), English to the Hebrew, Hebrew to the Yiddish, then the other one.
 */
const ENTITY_LABEL_ORDER: Readonly<Record<UiLang, readonly UiLang[]>> = {
  en: ["en", "he", "yi"],
  yi: ["yi", "he", "en"],
  he: ["he", "yi", "en"],
};

/** An entity's name in the interface language (`ENTITY_LABEL_ORDER`). */
export function entityName(labels: QuickEntity["labels"], ui: UiLang): string {
  for (const l of ENTITY_LABEL_ORDER[ui]) {
    const v = labels[l];
    if (v) return v;
  }
  return "";
}

export function suggestionMeta(sg: Suggestion, ui: UiLang): string {
  const t = searchT(ui);
  switch (sg.type) {
    case "series-part":
      return t("cb.type.series");
    case "year":
      return `${t("cb.type.year")} · ${t("cb.count", { count: sg.count })}`;
    case "entity":
      return `${t(`cb.type.${sg.kind}`)} · ${t("cb.count", { count: sg.count })}`;
    default:
      return `${t(`cb.type.${sg.type}`)} · ${t("cb.count", { count: sg.count })}`;
  }
}

/** Plain-text name, for `aria-label`s and tests. */
export function suggestionName(sg: Suggestion, ui: UiLang): string {
  const t = searchT(ui);
  switch (sg.type) {
    case "series-part":
      return `${labelIn(sg.label, ui)}, ${t(sg.how === "perek" ? "cb.seriesPerek" : "cb.seriesPart", { n: sg.n })}`;
    case "year":
      return formatHebrewYear(sg.year, ui);
    case "entity":
      return entityName(sg.labels, ui);
    default:
      return labelIn(sg.label, ui);
  }
}

export function SuggestionLabel({ sg, ui }: { sg: Suggestion; ui: UiLang }): JSX.Element {
  const t = searchT(ui);
  let name: JSX.Element;
  if (sg.type === "series-part") {
    name = (
      <span>
        <Text value={labelIn(sg.label, ui)} shiurLang={null} />
        {", "}
        {t(sg.how === "perek" ? "cb.seriesPerek" : "cb.seriesPart", { n: sg.n })}
      </span>
    );
  } else if (sg.type === "year") {
    name = <span>{formatHebrewYear(sg.year, ui)}</span>;
  } else {
    name = <Text value={suggestionName(sg, ui)} shiurLang={null} />;
  }
  return (
    <>
      {name}
      <span className={s.optionMeta}>{suggestionMeta(sg, ui)}</span>
    </>
  );
}
