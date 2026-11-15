/**
 * Pieces shared by the seforim, maasios and entity pages: load states, shiur lists with "show more",
 * moments grouped by shiur (with their text loaded on request from the shiur file), queue buttons,
 * the year histogram and the "often together with" list.
 */
import type { Ed, L } from "@emunas/corpus/public";
import { formatClock, formatNumber, languageName, notice, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useState, type JSX, type ReactNode } from "react";
import { Link } from "react-router";
import { Text } from "../../components/Text.tsx";
import type { MomentInput } from "../../store/index.ts";
import { momentContent, yearLabel } from "../today/format.ts";
import { ShiurCard, type CardData } from "../today/ShiurCard.tsx";
import type { Load } from "../today/use-data.ts";
import { loadShiur, type CorpusRow, type EntityFile, type MomentKind, type MomentRef } from "./live-data.ts";
import { yearHistogram, type ShiurMoments } from "./model.ts";
import { addToQueue, playBackToBack } from "./queue.ts";
import type { EntityResolver } from "./resolve.ts";
import { browseT } from "./strings.ts";
import { browseStyles as s } from "./styles.ts";

const paths = livePaths();

// ------------------------------------------------------------------------------------- load state

export function LoadState({ load, ui }: { load: Load<unknown>; ui: UiLang }): JSX.Element | null {
  const bt = browseT(ui);
  if (load.status === "loading") return <p className={s.muted}>{bt("browse.loading")}</p>;
  if (load.status === "error") {
    return (
      <p role="alert" className={s.muted}>
        {bt("browse.error")}
      </p>
    );
  }
  return null;
}

export function AiNote({ ui }: { ui: UiLang }): JSX.Element {
  return <p className={s.aiNote}>{notice("aiNotesShort", ui)}</p>;
}

// ------------------------------------------------------------------------------------- show more

export function useShowMore(total: number, step: number): { shown: number; more: (() => void) | null; left: number } {
  const [shown, setShown] = useState(step);
  const visible = Math.min(shown, total);
  return { shown: visible, left: total - visible, more: visible < total ? () => setShown((n) => n + step) : null };
}

export function MoreButton({ more, left, ui }: { more: (() => void) | null; left: number; ui: UiLang }): JSX.Element | null {
  if (!more) return null;
  return (
    <button type="button" className={s.button} onClick={more}>
      {browseT(ui)("browse.more", { count: left })}
    </button>
  );
}

// ------------------------------------------------------------------------------------- shiurim

export function cardOf(r: CorpusRow): CardData {
  return { id: r.id, lang: r.lang, title: r.title, oneLiner: r.oneLiner, duration: r.duration, years: r.years, status: r.status };
}

export function ShiurRows({
  rows,
  ui,
  read,
  label,
  step = 20,
}: {
  rows: readonly CorpusRow[];
  ui: UiLang;
  read: Ed;
  label: string;
  step?: number;
}): JSX.Element {
  const { shown, more, left } = useShowMore(rows.length, step);
  return (
    <>
      <ul className={s.list} aria-label={label}>
        {rows.slice(0, shown).map((r) => (
          <li key={r.id}>
            <ShiurCard shiur={cardOf(r)} ui={ui} read={read} />
          </li>
        ))}
      </ul>
      <MoreButton more={more} left={left} ui={ui} />
    </>
  );
}

/** The shiur line above a group of moments: catalog title, year and language. */
export function ShiurLine({ row, ui }: { row: CorpusRow; ui: UiLang }): JSX.Element {
  const year = yearLabel(row.years);
  return (
    <span className={s.meta}>
      <Link className={s.rowLink} to={paths.shiur(ui, row.id)} data-shiur={row.id}>
        <Text value={row.title} shiurLang={row.lang} />
      </Link>
      {year ? <Text value={year.hebrew} lang="he" /> : null}
      <span lang={ui}>{languageName(row.lang, ui)}</span>
    </span>
  );
}

// ------------------------------------------------------------------------------------- moments

/** Link to a moment in the listening room: `?t=` plus `&m=` when the id is a listening-room moment. */
export function momentHref(ui: UiLang, m: { id: string; shiurId: string; t: number | null }): string {
  const t = m.t ?? undefined;
  try {
    return paths.shiur(ui, m.shiurId, { t, m: m.id });
  } catch {
    // not a moment id the listening room understands (e.g. a source `~src3`): the time is enough
    return paths.shiur(ui, m.shiurId, { t });
  }
}

const KIND_KEY = {
  i: "browse.kind.i",
  q: "browse.kind.q",
  st: "browse.kind.st",
  kp: "browse.kind.kp",
  tk: "browse.kind.tk",
  s: "browse.kind.s",
} as const satisfies Record<MomentKind, string>;

export function TimeLink({
  ui,
  moment,
  children,
}: {
  ui: UiLang;
  moment: { id: string; shiurId: string; t: number | null };
  children?: ReactNode;
}): JSX.Element {
  const bt = browseT(ui);
  if (moment.t === null) return <span className={s.momentKind}>{children ?? bt("browse.time.none")}</span>;
  const clock = formatClock(moment.t);
  return (
    <Link to={momentHref(ui, moment)} data-moment={moment.id} aria-label={children ? undefined : bt("browse.listen", { time: clock })}>
      {children ?? <bdi dir="ltr">{clock}</bdi>}
    </Link>
  );
}

type Titles = { status: "idle" } | { status: "loading" } | { status: "error" } | { status: "ok"; text: Map<string, L> };

/**
 * One shiur and its moments. Moment text (chapter titles, insights, questions) is in the shiur file,
 * loaded only when the listener asks; `known` supplies texts already at hand (story titles).
 */
export function ShiurMomentGroup({
  group,
  row,
  ui,
  read,
  known,
}: {
  group: ShiurMoments;
  row: CorpusRow | undefined;
  ui: UiLang;
  read: Ed;
  known?: ReadonlyMap<string, L>;
}): JSX.Element {
  const bt = browseT(ui);
  const [titles, setTitles] = useState<Titles>({ status: "idle" });
  const needsTitles = group.moments.some((m) => !known?.has(m.id));
  const show = async () => {
    setTitles({ status: "loading" });
    try {
      const shiur = await loadShiur(group.shiurId);
      const text = new Map<string, L>();
      for (const m of group.moments) {
        const c = momentContent(shiur, m.id);
        if (c) text.set(m.id, c.text);
      }
      setTitles({ status: "ok", text });
    } catch {
      setTitles({ status: "error" });
    }
  };
  const textOf = (id: string): L | undefined => known?.get(id) ?? (titles.status === "ok" ? titles.text.get(id) : undefined);
  return (
    <div className={s.shiur} data-group={group.shiurId}>
      {row ? <ShiurLine row={row} ui={ui} /> : null}
      <ul className={s.moments}>
        {group.moments.map((m) => {
          const text = textOf(m.id);
          return (
            <li key={m.id} className={s.moment}>
              <span className={s.momentKind}>{bt(KIND_KEY[m.kind])}</span>
              <TimeLink ui={ui} moment={m} />
              {text ? <Text value={text} lang={read} /> : null}
            </li>
          );
        })}
      </ul>
      {needsTitles && titles.status !== "ok" ? (
        <p className={s.status}>
          {titles.status === "error" ? (
            <span role="alert">{bt("browse.titles.error")} </span>
          ) : null}
          <button type="button" className={s.button} onClick={() => void show()} disabled={titles.status === "loading"}>
            {titles.status === "loading" ? bt("browse.loading") : bt("browse.titles.show")}
          </button>
        </p>
      ) : null}
    </div>
  );
}

export function MomentGroups({
  groups,
  rows,
  ui,
  read,
  known,
  label,
  step = 15,
}: {
  groups: readonly ShiurMoments[];
  rows: ReadonlyMap<string, CorpusRow>;
  ui: UiLang;
  read: Ed;
  known?: ReadonlyMap<string, L>;
  label: string;
  step?: number;
}): JSX.Element {
  const { shown, more, left } = useShowMore(groups.length, step);
  return (
    <>
      <ul className={s.list} aria-label={label}>
        {groups.slice(0, shown).map((g) => (
          <li key={g.shiurId}>
            <ShiurMomentGroup group={g} row={rows.get(g.shiurId)} ui={ui} read={read} {...(known ? { known } : {})} />
          </li>
        ))}
      </ul>
      <MoreButton more={more} left={left} ui={ui} />
    </>
  );
}

// ------------------------------------------------------------------------------------- queue

type QueueStatus = { kind: "idle" } | { kind: "playing" | "added"; count: number } | { kind: "failed" };

/** "Play N back to back" (replaces the queue) and "Add to queue". Nothing renders without timed items. */
export function QueueActions({ items, ui, lead }: { items: readonly MomentInput[]; ui: UiLang; lead?: string }): JSX.Element | null {
  const bt = browseT(ui);
  const [status, setStatus] = useState<QueueStatus>({ kind: "idle" });
  if (items.length === 0) return null;
  const run = async (kind: "playing" | "added") => {
    try {
      const count = kind === "playing" ? await playBackToBack(items) : await addToQueue(items);
      setStatus({ kind, count });
    } catch {
      setStatus({ kind: "failed" });
    }
  };
  const count = formatNumber(items.length, ui);
  return (
    <div className={s.section}>
      {lead ? <p className={s.muted}>{lead}</p> : null}
      <div className={s.buttons}>
        <button type="button" className={`${s.button} ${s.primary}`} onClick={() => void run("playing")} data-action="play-all">
          {bt("browse.queue.play", { count })}
        </button>
        <button type="button" className={s.button} onClick={() => void run("added")} data-action="queue-all">
          {bt("browse.queue.add")}
        </button>
        <span className={s.status}>{bt("browse.queue.replaces")}</span>
      </div>
      <p className={s.status} role="status">
        {status.kind === "playing"
          ? bt("browse.queue.playing", { count: status.count })
          : status.kind === "added"
            ? bt("browse.queue.added", { count: status.count })
            : status.kind === "failed"
              ? bt("browse.queue.failed")
              : ""}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------------------------- years

/** A small bar chart of shiurim per Hebrew year, with the same facts as text for assistive tech. */
export function YearSpark({ years, ui, total }: { years: EntityFile["years"]; ui: UiLang; total: number }): JSX.Element {
  const bt = browseT(ui);
  const h = yearHistogram(years);
  const first = h.bars[0];
  const last = h.bars[h.bars.length - 1];
  const yearText = (y: number) => yearLabel([y])?.hebrew ?? String(y);
  const summary =
    first && last
      ? bt("browse.years.summary", { count: total, from: yearText(first.year), to: yearText(last.year) })
      : bt("browse.years.none");
  const undated = h.unknown > 0 ? bt("browse.years.undated", { count: h.unknown }) : "";
  const label = undated ? `${summary}; ${undated}` : summary;
  const span = first && last ? last.year - first.year + 1 : 0;
  const slots = span + (h.unknown > 0 ? 2 : 0);
  const W = 320;
  const H = 48;
  const bw = slots > 0 ? W / slots : W;
  const barH = (n: number) => (h.max > 0 ? Math.max(2, (n / h.max) * H) : 0);
  return (
    <div className={s.spark}>
      <svg className={s.sparkSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
        <title>{label}</title>
        {first
          ? h.bars.map((b) => (
              <rect
                key={b.year}
                className={s.sparkBar}
                x={(b.year - first.year) * bw}
                y={H - barH(b.count)}
                width={Math.max(1, bw * 0.8)}
                height={barH(b.count)}
              />
            ))
          : null}
        {h.unknown > 0 ? (
          <rect className={s.sparkUnknown} x={(slots - 1) * bw} y={H - barH(h.unknown)} width={Math.max(1, bw * 0.8)} height={barH(h.unknown)} />
        ) : null}
      </svg>
      <p className={s.status} aria-hidden="true">
        {label}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------------------------- related

export function EntityName({ label, kind, ui }: { label: { en: string; yi: string; he?: string }; kind: "p" | "c" | "o" | "w"; ui: UiLang }): JSX.Element {
  // Concepts are headed by the Hebrew term (concept-live §5.7); others in the interface language.
  if (kind === "c") return <Text value={label.he ?? label.yi} lang="he" />;
  return ui === "en" ? <Text value={label.en} lang="en" /> : <Text value={label.he ?? label.yi} shiurLang="yi" />;
}

export function RelatedEntities({
  related,
  resolver,
  ui,
}: {
  related: EntityFile["related"];
  resolver: EntityResolver;
  ui: UiLang;
}): JSX.Element | null {
  const bt = browseT(ui);
  const links = related.flatMap((r) => {
    const href = resolver.href(ui, r.kind, r.key);
    const label = resolver.label(r.kind, r.key);
    return href && label ? [{ ...r, href, label }] : [];
  });
  if (links.length === 0) return null;
  return (
    <section className={s.section} aria-labelledby="related-title">
      <h2 id="related-title" className={s.sectionTitle}>
        {bt("browse.related")}
      </h2>
      <ul className={s.chips}>
        {links.map((r) => (
          <li key={`${r.kind}:${r.key}`}>
            <Link className={s.chip} to={r.href} data-entity={`${r.kind}:${r.key}`}>
              <EntityName label={r.label} kind={r.kind} ui={ui} />
              <span className={s.momentKind}>{bt("browse.related.shared", { count: r.shared })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type { MomentRef };
