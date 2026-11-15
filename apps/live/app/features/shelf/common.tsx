/**
 * Pieces shared by the My Shelf sections and the shared playlist page: shiur titles from
 * `corpus.json`, one row per moment, time labels, and the play / add-to-queue helpers.
 */
import { formatClock, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useEffect, useState, type JSX, type ReactNode } from "react";
import { Link } from "react-router";
import { Text } from "../../components/Text.tsx";
// eslint-disable-next-line no-restricted-imports -- app/data is the Live data contract (W2.4), not the pipeline data folder
import { loadCorpus, type CorpusRow } from "../../data/index.ts";
import { getPersonal, getQueuePlayer, type MomentInput } from "../../store/index.ts";
import type { ShelfT } from "./strings.ts";
import { css, cx } from "./styles.ts";

const paths = livePaths();

/** Listening-room path for a shiur at a time; never throws on odd ids from imported data. */
export function shiurHref(ui: UiLang, shiurId: string, t?: number): string {
  try {
    return paths.shiur(ui, shiurId, t !== undefined && t > 0 ? { t } : {});
  } catch {
    return `/${ui}/s/${encodeURIComponent(shiurId)}`;
  }
}

/** Shiur rows by id from `corpus.json` (memoized by the data client); empty until loaded or on error. */
export function useCorpusRows(): ReadonlyMap<string, CorpusRow> {
  const [rows, setRows] = useState<ReadonlyMap<string, CorpusRow>>(() => new Map());
  useEffect(() => {
    let live = true;
    loadCorpus()
      .then((c) => {
        if (live) setRows(new Map(c.shiurim.map((r) => [r.id, r])));
      })
      .catch(() => undefined); // titles fall back to ids
    return () => {
      live = false;
    };
  }, []);
  return rows;
}

export function ShiurTitle({ id, rows }: { id: string; rows: ReadonlyMap<string, CorpusRow> }): JSX.Element {
  const row = rows.get(id);
  if (!row) return <Text value={id} lang="en" />;
  return <Text value={row.title} shiurLang={row.lang} />;
}

/** "from 12:34", "12:34–15:00". */
export function spanLabel(t: ShelfT, start: number, end: number | null): string {
  return end === null
    ? t("item.from", { start: formatClock(start) })
    : t("item.range", { start: formatClock(start), end: formatClock(end) });
}

export interface MomentRowProps {
  ui: UiLang;
  rows: ReadonlyMap<string, CorpusRow>;
  shiurId: string;
  /** Global seconds the link opens at. */
  t: number;
  meta?: ReactNode;
  badge?: ReactNode;
  current?: boolean;
  children?: ReactNode;
  testId?: string;
}

/** One list item: the shiur title (linking to the listening room at `t`), a meta line and actions. */
export function MomentRow({ ui, rows, shiurId, t, meta, badge, current, children, testId }: MomentRowProps): JSX.Element {
  return (
    <li className={css.item} aria-current={current ? "true" : undefined} data-testid={testId}>
      <div className={css.itemMain}>
        <Link className={css.itemTitle} to={shiurHref(ui, shiurId, t)}>
          <ShiurTitle id={shiurId} rows={rows} />
        </Link>
        {meta !== undefined || badge !== undefined ? (
          <span className={css.itemMeta}>
            {badge !== undefined ? <span className={css.badge}>{badge} </span> : null}
            {meta}
          </span>
        ) : null}
      </div>
      {children ? <div className={css.actions}>{children}</div> : null}
    </li>
  );
}

export function Button({
  onClick,
  children,
  primary,
  label,
  disabled,
  type = "button",
}: {
  onClick?: () => void;
  children: ReactNode;
  primary?: boolean;
  /** Accessible name when the visible text alone is ambiguous in a list. */
  label?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}): JSX.Element {
  return (
    <button
      type={type}
      className={cx(css.button, primary && css.primary)}
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/** Plays a single moment now: it goes into the queue right after the current entry and starts. */
export async function playNow(m: MomentInput): Promise<void> {
  const [key] = await getPersonal().enqueue([m], "next");
  if (key !== undefined) await getQueuePlayer().play(key);
}

/** Replaces the queue with these moments and plays from the first ("play all"). */
export async function playAll(items: readonly MomentInput[]): Promise<void> {
  const [first] = await getPersonal().replaceQueue(items);
  if (first !== undefined) await getQueuePlayer().play(first);
}

export async function addToQueue(items: readonly MomentInput[]): Promise<void> {
  await getPersonal().enqueue(items, "end");
}
