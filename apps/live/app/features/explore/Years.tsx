/**
 * The Years lens (concept-live §5.2): shiurim per Hebrew year, 5724–5780, under the other active
 * filters, and a separate "undated" lane whose count is stated, never guessed. Bars are buttons with a
 * roving tabindex (arrows follow the reading direction); choosing one keeps only that year. The
 * table under "The years as a table" is the text alternative.
 */
import { formatNumber, hebrewYearParts, UI_DIR, type UiLang } from "@emunas/i18n";
import { useId, type JSX } from "react";
import { Text } from "../../components/Text.tsx";
import { yearText } from "./labels.ts";
import { yearsModel } from "./lenses.ts";
import type { YearFilter } from "./model.ts";
import { useRoving } from "./roving.ts";
import { exploreT } from "./strings.ts";
import { exploreStyles as s } from "./styles.ts";

const BAR = 10;
const GAP = 2;
const HEIGHT = 160;
const AXIS = 24;
const LANE_GAP = 24;

export interface YearsProps {
  counts: Readonly<Record<string, number>>;
  ui: UiLang;
  year: YearFilter | null;
  onYear(next: YearFilter | null): void;
}

export function Years({ counts, ui, year, onYear }: YearsProps): JSX.Element {
  const et = exploreT(ui);
  const model = yearsModel(counts);
  const rtl = UI_DIR[ui] === "rtl";
  const titleId = useId();
  const n = model.bars.length;
  const width = n * BAR + LANE_GAP + BAR * 3;
  const x = (i: number, w = BAR - GAP) => (rtl ? width - i * BAR - w : i * BAR);
  const inRange = (y: number) => year?.kind === "range" && y >= year.from && y <= year.to;
  const undatedOn = year?.kind === "undated";
  const chooseYear = (y: number) =>
    onYear(year?.kind === "range" && year.from === y && year.to === y ? null : { kind: "range", from: y, to: y });
  const chooseUndated = () => onYear(undatedOn ? null : { kind: "undated" });
  // the undated lane is the last stop in keyboard order
  const roving = useRoving(n + 1, rtl);
  const h = (c: number) => (c === 0 ? 0 : Math.max(2, (c / model.max) * (HEIGHT - AXIS)));

  const laneX = rtl ? 0 : n * BAR + LANE_GAP;
  const laneW = BAR * 3;
  const laneProps = roving.item(n, chooseUndated);

  return (
    <section className={s.lens} aria-labelledby={titleId} data-lens="years">
      <h2 id={titleId} className={s.lensTitle}>
        {et("explore.years.title")}
      </h2>
      <p className={s.muted}>{et("explore.years.lead")}</p>
      <svg className={s.chart} viewBox={`0 0 ${width} ${HEIGHT}`} role="group" aria-labelledby={titleId}>
        <g data-bars="">
          {model.bars.map((b, i) => {
            const bh = h(b.count);
            const props = roving.item(i, () => chooseYear(b.year));
            const cls = [s.bar, b.count === 0 ? s.dimmed : "", inRange(b.year) ? s.on : ""].filter(Boolean).join(" ");
            return (
              <g
                key={b.year}
                className={cls}
                role="button"
                aria-pressed={inRange(b.year)}
                aria-label={et("explore.years.bar", { year: yearText(b.year, ui), count: formatNumber(b.count, ui) })}
                data-year={b.year}
                data-count={b.count}
                {...props}
              >
                {/* a full-height hit area so short bars are easy to reach */}
                <rect className={s.hit} x={x(i)} y={0} width={BAR - GAP} height={HEIGHT - AXIS} />
                <rect x={x(i)} y={HEIGHT - AXIS - bh} width={BAR - GAP} height={bh} />
              </g>
            );
          })}
        </g>
        <g aria-hidden="true">
          {model.bars
            .map((b, i) => ({ b, i }))
            .filter(({ b }) => b.year % 10 === 0)
            .map(({ b, i }) => (
              <text key={b.year} className={s.axis} x={x(i) + (BAR - GAP) / 2} y={HEIGHT - 6} textAnchor="middle">
                {hebrewYearParts(b.year)?.hebrew ?? b.year}
              </text>
            ))}
        </g>
        <g
          className={[s.bar, s.lane, undatedOn ? s.on : ""].filter(Boolean).join(" ")}
          role="button"
          aria-pressed={undatedOn}
          aria-label={et("explore.years.undated", { count: formatNumber(model.undated, ui) })}
          data-year="undated"
          data-count={model.undated}
          {...laneProps}
        >
          {/* a lane, not a bar: its count is written out instead of drawn on the years' scale */}
          <rect className={s.hit} x={laneX} y={0} width={laneW} height={HEIGHT - AXIS} />
          <rect x={laneX} y={0} width={laneW} height={HEIGHT - AXIS} rx={3} />
          <text className={s.laneCount} x={laneX + laneW / 2} y={(HEIGHT - AXIS) / 2} textAnchor="middle" dominantBaseline="middle" aria-hidden="true">
            {formatNumber(model.undated, ui)}
          </text>
        </g>
        <text className={s.axis} x={laneX + laneW / 2} y={HEIGHT - 6} textAnchor="middle" aria-hidden="true">
          ?
        </text>
      </svg>
      <p className={s.muted} data-testid="years-undated">
        {et("explore.years.undatedNote", { count: formatNumber(model.undated, ui) })}
      </p>
      <details className={s.alt}>
        <summary>{et("explore.years.table")}</summary>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">{et("explore.years.colYear")}</th>
              <th scope="col">{et("explore.years.colCount")}</th>
            </tr>
          </thead>
          <tbody>
            {model.bars
              .filter((b) => b.count > 0)
              .map((b) => (
                <tr key={b.year}>
                  <th scope="row">
                    <button type="button" className={s.textButton} aria-pressed={inRange(b.year)} onClick={() => chooseYear(b.year)}>
                      <Text value={yearText(b.year, ui)} shiurLang={null} />
                    </button>
                  </th>
                  <td>{formatNumber(b.count, ui)}</td>
                </tr>
              ))}
            <tr>
              <th scope="row">
                <button type="button" className={s.textButton} aria-pressed={undatedOn} onClick={chooseUndated}>
                  {et("explore.year.unknown")}
                </button>
              </th>
              <td>{formatNumber(model.undated, ui)}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </section>
  );
}
