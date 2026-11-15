/**
 * Explore's two result units (concept-live §5.2): shiurim and moments, both virtualized
 * (`virtual.ts`). Rows have a fixed height; long one-liners and titles are clamped by the CSS.
 */
import type { Ed } from "@emunas/corpus/public";
import { formatClock, formatDuration, formatNumber, languageName, notice, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useId, useRef, type JSX, type ReactNode } from "react";
import { Link } from "react-router";
import { Text } from "../../components/Text.tsx";
import { yearLabel } from "../today/format.ts";
import type { CorpusRow, MomentRow } from "./live-data.ts";
import { exploreT, type ExploreKey } from "./strings.ts";
import { exploreStyles as s } from "./styles.ts";
import { remPx, useVirtualWindow } from "./virtual.ts";

const paths = livePaths();

/** Row heights in rem (kept in step with `.shiurRow` / `.momentRow` in the stylesheet). */
export const SHIUR_ROW_REM = 7.5;
export const MOMENT_ROW_REM = 7.5;

interface VirtualListProps<T> {
  items: readonly T[];
  rowRem: number;
  label: string;
  itemKey(item: T): string;
  render(item: T, labelId: string): ReactNode;
  testId: string;
}

function VirtualList<T>({ items, rowRem, label, itemKey, render, testId }: VirtualListProps<T>): JSX.Element {
  const ref = useRef<HTMLUListElement>(null);
  const h = rowRem * remPx();
  const { start, end } = useVirtualWindow(ref, items.length, h);
  const base = useId();
  return (
    // `list-style: none` drops list semantics in Safari, so the role is explicit.
    <ul ref={ref} role="list" aria-label={label} className={s.vlist} style={{ blockSize: `${items.length * h}px` }} data-testid={testId} data-count={items.length}>
      {items.slice(start, end).map((item, i) => {
        const n = start + i;
        return (
          <li
            key={itemKey(item)}
            className={s.vrow}
            style={{ insetBlockStart: `${n * h}px`, blockSize: `${h}px` }}
            aria-setsize={items.length}
            aria-posinset={n + 1}
          >
            {render(item, `${base}-${n}`)}
          </li>
        );
      })}
    </ul>
  );
}

function YearMeta({ years, ui }: { years: readonly number[]; ui: UiLang }): JSX.Element {
  const y = yearLabel(years);
  if (!y) return <span>{exploreT(ui)("explore.year.unknown")}</span>;
  return (
    <span>
      <Text value={y.hebrew} lang="he" />
      {y.civil ? (
        <>
          {" "}
          <bdi dir="ltr">({y.civil})</bdi>
        </>
      ) : null}
    </span>
  );
}

export function ShiurList({ rows, ui, read, label }: { rows: readonly CorpusRow[]; ui: UiLang; read: Ed; label: string }): JSX.Element {
  const et = exploreT(ui);
  return (
    <VirtualList
      items={rows}
      rowRem={SHIUR_ROW_REM}
      label={label}
      testId="explore-shiurim"
      itemKey={(r) => r.id}
      render={(r) => (
        <Link className={s.shiurRow} to={paths.shiur(ui, r.id)} data-shiur={r.id}>
          <Text as="span" className={s.rowTitle} value={r.title} shiurLang={r.lang} />
          <span className={s.rowMeta}>
            <YearMeta years={r.years} ui={ui} />
            <span>{formatDuration(r.duration, ui)}</span>
            <span lang={ui}>{languageName(r.lang, ui)}</span>
            {r.derived !== "catalog" ? <span className={s.badge}>{et("explore.uncatalogued")}</span> : null}
          </span>
          {r.oneLiner ? (
            <Text as="span" className={s.rowText} value={r.oneLiner} lang={read} />
          ) : (
            <span className={s.muted}>{et("explore.notesPending")}</span>
          )}
        </Link>
      )}
    />
  );
}

export function MomentList({
  moments,
  rowsById,
  ui,
  lang,
  label,
}: {
  moments: readonly MomentRow[];
  rowsById: ReadonlyMap<string, CorpusRow>;
  ui: UiLang;
  /** Language of the moment titles (the shard's language). */
  lang: Ed;
  label: string;
}): JSX.Element {
  const et = exploreT(ui);
  return (
    <>
      <p className={s.aiNote}>{notice("aiNotesShort", ui)}</p>
      <VirtualList
        items={moments}
        rowRem={MOMENT_ROW_REM}
        label={label}
        testId="explore-moments"
        itemKey={(m) => m.id}
        render={(m, labelId) => {
          const shiur = rowsById.get(m.shiurId);
          const href = m.t === null ? paths.shiur(ui, m.shiurId) : paths.shiur(ui, m.shiurId, { t: m.t, m: m.id });
          return (
            <div className={s.momentRow} data-moment={m.id}>
              <span className={s.kind}>{et(`explore.kind.one.${m.kind}` as ExploreKey)}</span>
              <Text as="span" id={labelId} className={s.rowTitle} value={m.title} lang={lang} />
              {shiur ? (
                <span className={s.rowMeta}>
                  <Text value={shiur.title} shiurLang={shiur.lang} />
                  <YearMeta years={shiur.years} ui={ui} />
                  <span lang={ui}>{languageName(shiur.lang, ui)}</span>
                </span>
              ) : null}
              <Link className={s.play} to={href} aria-describedby={labelId}>
                {m.t === null ? et("explore.open") : et("explore.play", { time: formatClock(m.t) })}
              </Link>
            </div>
          );
        }}
      />
    </>
  );
}

export function countLabel(ui: UiLang, unit: "shiurim" | "moments", n: number): string {
  const et = exploreT(ui);
  return et(unit === "shiurim" ? "explore.results" : "explore.results.moments", { count: n, n: formatNumber(n, ui) });
}
