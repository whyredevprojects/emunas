/**
 * The Luach lens (concept-live §5.2): the year as a ring, Tishrei at the top, parshiyos on the outer
 * track and zmanim on the inner. Each stop is a keyboard-reachable button (roving tabindex per ring,
 * arrows mirrored in right-to-left mode); choosing one filters to that occasion and the page lists
 * its shiurim by year. The same data is offered as a table (text alternative).
 */
import { formatNumber, UI_DIR, type UiLang } from "@emunas/i18n";
import { useId, useState, type JSX } from "react";
import { Text } from "../../components/Text.tsx";
import { luachModel, polar, type LuachStop } from "./lenses.ts";
import type { FacetLabel, FacetsFile } from "./live-data.ts";
import { useRoving } from "./roving.ts";
import { exploreT } from "./strings.ts";
import { exploreStyles as s } from "./styles.ts";
import { labelText } from "../../i18n/content.ts";

const SIZE = 420;
const C = SIZE / 2;
const R_OUTER = 180;
const R_INNER = 112;

export interface LuachProps {
  counts: Readonly<Record<string, number>>;
  facets: FacetsFile;
  ui: UiLang;
  /** Currently selected occasion keys. */
  selected: readonly string[];
  onChoose(key: string): void;
}

function radius(count: number, max: number): number {
  if (count === 0) return 3;
  return 4 + 8 * Math.sqrt(count / Math.max(1, max));
}

export function Luach({ counts, facets, ui, selected, onChoose }: LuachProps): JSX.Element {
  const et = exploreT(ui);
  const model = luachModel(counts, facets);
  const rtl = UI_DIR[ui] === "rtl";
  const titleId = useId();
  const [focus, setFocus] = useState<LuachStop | null>(null);
  const max = Math.max(1, ...model.outer.map((x) => x.count), ...model.inner.map((x) => x.count));
  const sel = new Set(selected);
  const shown = focus ?? [...model.outer, ...model.inner].find((x) => sel.has(x.key)) ?? null;
  const stopLabel = (x: { label: FacetLabel; count: number }) => et("explore.luach.stop", { name: labelText(x.label, ui), count: formatNumber(x.count, ui) });

  return (
    <section className={s.lens} aria-labelledby={titleId} data-lens="luach">
      <h2 id={titleId} className={s.lensTitle}>
        {et("explore.luach.title")}
      </h2>
      <p className={s.muted}>{et("explore.luach.lead")}</p>
      <svg className={s.chart} viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-labelledby={titleId}>
        <circle className={s.track} cx={C} cy={C} r={R_OUTER} />
        <circle className={s.track} cx={C} cy={C} r={R_INNER} />
        <Ring
          label={et("explore.luach.parshiyos")}
          stops={model.outer}
          r={R_OUTER}
          max={max}
          rtl={rtl}
          sel={sel}
          ring="outer"
          stopLabel={stopLabel}
          onChoose={onChoose}
          onFocusStop={setFocus}
        />
        <Ring
          label={et("explore.luach.zmanim")}
          stops={model.inner}
          r={R_INNER}
          max={max}
          rtl={rtl}
          sel={sel}
          ring="inner"
          stopLabel={stopLabel}
          onChoose={onChoose}
          onFocusStop={setFocus}
        />
        {shown ? (
          <text className={s.centerText} x={C} y={C} textAnchor="middle" dominantBaseline="middle" aria-hidden="true">
            {stopLabel(shown)}
          </text>
        ) : null}
      </svg>
      {model.others.length > 0 ? (
        <div className={s.others}>
          <h3 className={s.subTitle}>{et("explore.luach.others")}</h3>
          <ul className={s.chips}>
            {model.others.map((o) => (
              <li key={o.key}>
                <button
                  type="button"
                  className={o.count === 0 ? `${s.chip} ${s.dimmed}` : s.chip}
                  aria-pressed={sel.has(o.key)}
                  onClick={() => onChoose(o.key)}
                  data-stop={o.key}
                >
                  <Text value={labelText(o.label, ui)} shiurLang={null} /> <span className={s.count}>{formatNumber(o.count, ui)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <details className={s.alt}>
        <summary>{et("explore.luach.table")}</summary>
        {(
          [
            ["outer", et("explore.luach.parshiyos"), model.outer],
            ["inner", et("explore.luach.zmanim"), model.inner],
          ] as const
        ).map(([ring, caption, stops]) => (
          <table key={ring} className={s.table} data-table={ring}>
            <caption>{caption}</caption>
            <tbody>
              {stops.map((x) => (
                <tr key={x.key}>
                  <th scope="row">
                    <button type="button" className={s.textButton} aria-pressed={sel.has(x.key)} onClick={() => onChoose(x.key)}>
                      <Text value={labelText(x.label, ui)} shiurLang={null} />
                    </button>
                  </th>
                  <td>{formatNumber(x.count, ui)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </details>
    </section>
  );
}

interface RingProps {
  label: string;
  stops: LuachStop[];
  r: number;
  max: number;
  rtl: boolean;
  sel: ReadonlySet<string>;
  ring: "outer" | "inner";
  stopLabel(x: LuachStop): string;
  onChoose(key: string): void;
  onFocusStop(x: LuachStop | null): void;
}

function Ring({ label, stops, r, max, rtl, sel, ring, stopLabel, onChoose, onFocusStop }: RingProps): JSX.Element {
  const selectedIndex = stops.findIndex((x) => sel.has(x.key));
  const roving = useRoving(stops.length, rtl, selectedIndex < 0 ? 0 : selectedIndex);
  return (
    <g role="group" aria-label={label} data-ring={ring}>
      {stops.map((x, i) => {
        const p = polar(C, C, r, x.turn, rtl);
        const props = roving.item(i, () => onChoose(x.key));
        const on = sel.has(x.key);
        const cls = [s.stop, x.count === 0 ? s.dimmed : "", on ? s.on : "", x.combined ? s.combined : ""].filter(Boolean).join(" ");
        return (
          <g
            key={x.key}
            className={cls}
            role="button"
            aria-pressed={on}
            aria-label={stopLabel(x)}
            data-stop={x.key}
            data-count={x.count}
            {...props}
            onFocus={() => {
              props.onFocus();
              onFocusStop(x);
            }}
            onBlur={() => onFocusStop(null)}
          >
            <circle cx={p.x} cy={p.y} r={radius(x.count, max)} />
          </g>
        );
      })}
    </g>
  );
}
