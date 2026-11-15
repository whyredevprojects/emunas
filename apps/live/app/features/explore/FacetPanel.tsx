/**
 * The facet column (concept-live §5.2). Native checkboxes in fieldsets: keyboard and screen-reader
 * behaviour come from the platform, and the order follows the inline direction. Each value shows
 * the count it would give; zero counts are dimmed, never hidden. Long data facets (occasions, works,
 * people, concepts, series) show the strongest values first, a filter box and "show more".
 */
import { formatNumber, type UiLang } from "@emunas/i18n";
import { useId, useMemo, useState, type ChangeEvent, type JSX } from "react";
import { Text } from "../../components/Text.tsx";
import type { FacetCounts } from "./engine.ts";
import { valueLabel, yearText } from "./labels.ts";
import type { FacetsFile } from "./live-data.ts";
import { DURATION_BUCKETS, SET_FACETS, UNDATED, type ExploreFilters, type SetFacet, type YearFilter } from "./model.ts";
import { exploreT, type ExploreKey } from "./strings.ts";
import { exploreStyles as s } from "./styles.ts";
import { CATEGORIES, toggleValue } from "./url.ts";

const FIXED_ORDER: Partial<Record<SetFacet, readonly string[]>> = {
  lang: ["yi", "en"],
  category: CATEGORIES,
  duration: DURATION_BUCKETS,
  stories: ["yes", "no"],
  ai: ["full", "catalog-only"],
  catalogued: ["catalogued", "uncatalogued"],
};

/** Values shown before "show more" in a long facet. */
export const FACET_PREVIEW = 8;
const MORE_STEP = 50;

export interface FacetPanelProps {
  filters: ExploreFilters;
  counts: FacetCounts | null;
  facets: FacetsFile;
  ui: UiLang;
  onChange(next: ExploreFilters): void;
}

export function FacetPanel({ filters, counts, facets, ui, onChange }: FacetPanelProps): JSX.Element {
  const et = exploreT(ui);
  const headingId = useId();
  return (
    <aside className={s.facets} aria-labelledby={headingId}>
      <div className={s.facetsHead}>
        <h2 id={headingId} className={s.facetsTitle}>
          {et("explore.filters")}
        </h2>
        <button
          type="button"
          className={s.textButton}
          onClick={() => onChange({ sets: {}, year: null })}
          disabled={filters.year === null && SET_FACETS.every((f) => (filters.sets[f]?.length ?? 0) === 0)}
        >
          {et("explore.clear")}
        </button>
      </div>
      {SET_FACETS.slice(0, 4).map((f) => (
        <FacetGroup key={f} facet={f} filters={filters} counts={counts} facets={facets} ui={ui} onChange={onChange} />
      ))}
      <YearFacet filters={filters} counts={counts} ui={ui} onChange={onChange} />
      {SET_FACETS.slice(4).map((f) => (
        <FacetGroup key={f} facet={f} filters={filters} counts={counts} facets={facets} ui={ui} onChange={onChange} />
      ))}
    </aside>
  );
}

interface GroupProps extends FacetPanelProps {
  facet: SetFacet;
}

/** The ordered values of a facet: fixed vocabularies in their order, data facets selected-first then by count. */
export function orderedValues(facet: SetFacet, counts: FacetCounts | null, selected: readonly string[]): string[] {
  const c = counts?.[facet] ?? {};
  const fixed = FIXED_ORDER[facet];
  if (fixed) return fixed.filter((v) => c[v] !== undefined || selected.includes(v));
  const all = new Set([...Object.keys(c), ...selected]);
  const sel = new Set(selected);
  return [...all].sort((a, b) => {
    const sa = sel.has(a) ? 1 : 0;
    const sb = sel.has(b) ? 1 : 0;
    return sb - sa || (c[b] ?? 0) - (c[a] ?? 0) || a.localeCompare(b);
  });
}

function FacetGroup({ facet, filters, counts, facets, ui, onChange }: GroupProps): JSX.Element | null {
  const et = exploreT(ui);
  const selected = filters.sets[facet] ?? [];
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(FACET_PREVIEW);
  const long = FIXED_ORDER[facet] === undefined;
  const values = useMemo(() => orderedValues(facet, counts, selected), [facet, counts, selected]);
  const legend = et(`explore.facet.${facet}` as ExploreKey);
  const filterId = useId();
  if (values.length === 0) return null;

  const q = query.trim().toLocaleLowerCase();
  const matching = q === "" ? values : values.filter((v) => valueLabel(facet, v, facets, ui).text.toLocaleLowerCase().includes(q) || v.includes(q));
  const visible = long ? matching.slice(0, Math.max(shown, selected.length)) : matching;
  const hidden = matching.length - visible.length;

  return (
    <fieldset className={s.facet} data-facet={facet}>
      <legend className={s.legend}>{legend}</legend>
      {long && values.length > FACET_PREVIEW ? (
        <>
          <label className="visually-hidden" htmlFor={filterId}>
            {et("explore.facet.filter", { facet: legend })}
          </label>
          <input
            id={filterId}
            className={s.facetFilter}
            type="search"
            value={query}
            placeholder={et("explore.facet.filter", { facet: legend })}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          />
        </>
      ) : null}
      <ul className={s.values}>
        {visible.map((v) => {
          const n = counts?.[facet]?.[v] ?? 0;
          const label = valueLabel(facet, v, facets, ui);
          const checked = selected.includes(v);
          return (
            <li key={v} className={n === 0 && !checked ? s.dimmed : undefined} data-value={v} data-count={n}>
              <label className={s.value}>
                <input type="checkbox" checked={checked} onChange={() => onChange(toggleValue(filters, facet, v))} />
                {label.data ? <Text value={label.text} shiurLang={ui} /> : <span>{label.text}</span>}
                <span className={s.count}>{formatNumber(n, ui)}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {matching.length === 0 ? <p className={s.muted}>{et("explore.facet.noMatch")}</p> : null}
      {long && hidden > 0 ? (
        <button type="button" className={s.textButton} onClick={() => setShown((n) => n + MORE_STEP)}>
          {et("explore.facet.more", { count: Math.min(hidden, MORE_STEP) })}
        </button>
      ) : long && shown > FACET_PREVIEW ? (
        <button type="button" className={s.textButton} onClick={() => setShown(FACET_PREVIEW)}>
          {et("explore.facet.fewer")}
        </button>
      ) : null}
    </fieldset>
  );
}

function YearFacet({ filters, counts, ui, onChange }: Omit<FacetPanelProps, "facets">): JSX.Element {
  const et = exploreT(ui);
  const fromId = useId();
  const toId = useId();
  const years = Object.keys(counts?.year ?? {})
    .filter((k) => k !== UNDATED)
    .map(Number)
    .sort((a, b) => a - b);
  const y = filters.year;
  const from = y?.kind === "range" ? y.from : null;
  const to = y?.kind === "range" ? y.to : null;
  const undated = y?.kind === "undated";
  const lo = years[0] ?? 0;
  const hi = years[years.length - 1] ?? 0;

  const set = (next: YearFilter | null) => onChange({ ...filters, year: next });
  const setRange = (a: number | null, b: number | null) => {
    if (a === null && b === null) return set(null);
    const f = a ?? lo;
    const t = b ?? hi;
    return set({ kind: "range", from: Math.min(f, t), to: Math.max(f, t) });
  };
  const parse = (v: string): number | null => (v === "" ? null : Number(v));
  const option = (yr: number) => (
    <option key={yr} value={yr}>
      {yearText(yr, ui)}
    </option>
  );

  return (
    <fieldset className={s.facet} data-facet="year">
      <legend className={s.legend}>{et("explore.facet.year")}</legend>
      <div className={s.yearRow}>
        <label htmlFor={fromId}>{et("explore.year.from")}</label>
        <select id={fromId} value={from ?? ""} disabled={undated} onChange={(e) => setRange(parse(e.target.value), to)}>
          <option value="">{et("explore.year.any")}</option>
          {years.map(option)}
        </select>
        <label htmlFor={toId}>{et("explore.year.to")}</label>
        <select id={toId} value={to ?? ""} disabled={undated} onChange={(e) => setRange(from, parse(e.target.value))}>
          <option value="">{et("explore.year.any")}</option>
          {years.map(option)}
        </select>
      </div>
      <label className={s.value}>
        <input type="checkbox" checked={undated} onChange={() => set(undated ? null : { kind: "undated" })} />
        <span>{et("explore.year.undated")}</span>
        <span className={s.count}>{formatNumber(counts?.year[UNDATED] ?? 0, ui)}</span>
      </label>
      {y !== null ? (
        <button type="button" className={s.textButton} onClick={() => set(null)}>
          {et("explore.year.clear")}
        </button>
      ) : null}
    </fieldset>
  );
}
