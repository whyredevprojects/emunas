/**
 * Today (concept-live §5.1, tech-live §1 `/:ui/`). The frame and `h1` render at once (prerendered
 * per interface language); the date-dependent parts are computed on the client after mount from the
 * visitor's own day, so the page stays current without a rebuild and hydration never mismatches.
 *
 * Loading (corpus-wave-plan §4, C1.7): the page renders from `today.json` alone. The moment of the
 * day then loads its one shiur file for the text, and Continue loads the heard shiurim's files only
 * when the personal store has progress. `corpus.json`, `facets.json` and the corpus layer's
 * corpus-wide files are never requested here. The occasion mix button plays its inline head at once
 * and only then loads the occasion topic's file for the rest (`occasion-mix.ts`).
 */
import type { Ed } from "@emunas/corpus/public";
import { formatClock, formatNumber, notice, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { Fragment, useEffect, useMemo, useState, type JSX, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Text } from "../../components/Text.tsx";
import { loadShiur, loadToday, type TodayFile } from "./live-data.ts";
import { tFor, useUi } from "../../i18n/index.ts";
import { readingLang, useSettings } from "../../shell/settings.ts";
import { formatCivilDate, formatHebrewDate, momentContent, occasionLabel } from "./format.ts";
import { useIsrael } from "./israel.ts";
import { mixT } from "../mix/strings.ts";
import { playOccasionMix } from "./occasion-mix.ts";
import { loadContinueRows } from "./continue.ts";
import {
  buildToday,
  continueItems,
  dateFromQuery,
  localIsoDay,
  rowsById,
  type DayMoment,
  type TodayRow,
  type TodayView,
  type WeekMix,
} from "./model.ts";
import { readProgress, useProgressSourceVersion } from "./personal.ts";
import { ShiurCard, type CardData } from "./ShiurCard.tsx";
import { todayT, type TodayKey } from "./strings.ts";
import { todayStyles as s } from "./styles.ts";
import { useLoad } from "./use-data.ts";

interface TodayData {
  today: TodayFile;
}

async function loadTodayData(): Promise<TodayData> {
  return { today: await loadToday() };
}

export function cardOf(r: TodayRow): CardData {
  return { id: r.id, lang: r.lang, title: r.title, oneLiner: r.oneLiner, duration: r.duration, years: r.years, status: r.status };
}

const paths = livePaths();

/**
 * Fills one `{slot}` of a UI template (called without params, so `t()` leaves it in place) with a
 * node, so data strings inside UI sentences stay direction-isolated.
 */
export function withSlot(template: string, slot: string, node: ReactNode): ReactNode[] {
  const parts = template.split(`{${slot}}`);
  return parts.flatMap((part, i) => (i === 0 ? [part] : [<Fragment key={i}>{node}</Fragment>, part]));
}

export function TodayPage(): JSX.Element {
  const ui = useUi();
  const tt = todayT(ui);
  const location = useLocation();
  const audio = useSettings((st) => st.audio);
  const read = readingLang({ read: useSettings((st) => st.read) }, ui);
  const [israel, setIsrael] = useIsrael();

  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    setDate(dateFromQuery(location.search) ?? localIsoDay());
  }, [location.search]);

  const data = useLoad(loadTodayData, []);
  const view = useMemo<TodayView | null>(() => {
    if (date === null || data.status !== "ok") return null;
    return buildToday({ date, israel, audio, today: data.data.today });
  }, [date, israel, audio, data]);

  return (
    <article className={s.page} aria-busy={view === null && data.status !== "error"}>
      <header className={s.header}>
        <div>
          <h1 className={s.title}>{tFor(ui)("page.today")}</h1>
          {view?.hebrewDate ? (
            <p className={s.date}>
              <Text value={formatHebrewDate(view.hebrewDate, ui)} lang={ui === "en" ? "en" : "he"} />
            </p>
          ) : null}
        </div>
        <button type="button" className={s.toggle} aria-pressed={israel} onClick={() => setIsrael(!israel)}>
          {tt("today.israel")}
        </button>
      </header>

      {data.status === "error" ? (
        <p role="alert" className={s.muted}>
          {tt("today.error")}
        </p>
      ) : view === null || data.status !== "ok" ? (
        <p className={s.muted}>{tt("today.loading")}</p>
      ) : (
        <>
          <ThisWeek view={view} today={data.data.today} ui={ui} read={read} />
          <MomentOfTheDay moment={view.moment} today={data.data.today} ui={ui} read={read} />
          <Continue ui={ui} read={read} />
          {view.stillArriving && view.newly.length > 0 ? (
            <section className={s.section} aria-labelledby="today-newly">
              <h2 id="today-newly" className={s.sectionTitle}>
                {tt("today.newly")}
              </h2>
              <p className={s.sectionLead}>{tt("today.newly.lead")}</p>
              <CardRow rows={view.newly.map((n) => n.row)} ui={ui} read={read} />
              <p className={s.aiNote}>{notice("aiNotesShort", ui)}</p>
            </section>
          ) : null}
          <p className={s.counter} data-testid="corpus-counter">
            {tt("today.counter", { full: formatNumber(view.counts.full, ui), total: formatNumber(view.counts.total, ui) })}
          </p>
        </>
      )}
    </article>
  );
}

function CardRow({ rows, ui, read }: { rows: readonly TodayRow[]; ui: UiLang; read: Ed }): JSX.Element {
  return (
    <ul className={s.row}>
      {rows.map((r) => (
        <li key={r.id}>
          <ShiurCard shiur={cardOf(r)} ui={ui} read={read} />
        </li>
      ))}
    </ul>
  );
}

function ThisWeek({ view, today, ui, read }: { view: TodayView; today: TodayFile; ui: UiLang; read: Ed }): JSX.Element {
  const tt = todayT(ui);
  if (!view.week) {
    return (
      <section className={s.section} aria-labelledby="today-week">
        <h2 id="today-week" className={s.sectionTitle}>
          {tt("today.week")}
        </h2>
        <p className={s.muted}>{tt("today.outOfRange")}</p>
      </section>
    );
  }
  const p = view.parsha;
  const anyNotes = (p?.shiurim ?? []).concat(view.occasions.flatMap((o) => o.shiurim)).some((r) => r.oneLiner !== null);
  return (
    <section className={s.section} aria-labelledby="today-week">
      <h2 id="today-week" className={s.sectionTitle}>
        {tt("today.week")}
      </h2>
      {view.mix ? <OccasionMix mix={view.mix} ui={ui} /> : null}
      {p ? (
        <div className={s.section} data-parsha={p.key}>
          <h3 className={s.occasionTitle}>
            <Link to={paths.occasion(ui, p.key)}>
              <ParshaName parshaKey={p.key} today={today} ui={ui} />
            </Link>
            {p.shiurim.length > 0 ? <span className={s.badge}>{tt("today.count", { count: p.shiurim.length })}</span> : null}
          </h3>
          {p.deferred && p.date ? <p className={s.sectionLead}>{tt("today.parsha.deferred", { date: formatCivilDate(p.date, ui) })}</p> : null}
          {p.shiurim.length > 0 ? <CardRow rows={p.shiurim} ui={ui} read={read} /> : <p className={s.muted}>{tt("today.parsha.empty")}</p>}
        </div>
      ) : null}
      {view.occasions.map((o) => (
        <div key={o.key} className={s.section} data-occasion={o.key}>
          <h3 className={s.occasionTitle}>
            <Link to={paths.occasion(ui, o.key)}>
              <Text value={occasionLabel(o.key, today, ui)} shiurLang={ui} />
            </Link>
            <span className={s.badge}>{o.active ? tt("today.occasion.active") : tt("today.occasion.soon", { count: o.daysUntil })}</span>
          </h3>
          <CardRow rows={o.shiurim} ui={ui} read={read} />
        </div>
      ))}
      {anyNotes ? <p className={s.aiNote}>{notice("aiNotesShort", ui)}</p> : null}
    </section>
  );
}

type MixStatus = "idle" | "loading" | "playing" | "error";

/**
 * The occasion mix button (concept-live-corpus C.3): one per week. It plays the inline head at once;
 * the rest of the mix joins the queue when the topic's moment list arrives. Labelled once as
 * assembled automatically from AI tags.
 */
function OccasionMix({ mix, ui }: { mix: WeekMix; ui: UiLang }): JSX.Element {
  const tt = todayT(ui);
  const mt = mixT(ui);
  const audio = useSettings((st) => st.audio);
  const [status, setStatus] = useState<MixStatus>("idle");
  async function play(): Promise<void> {
    setStatus("loading");
    try {
      setStatus((await playOccasionMix(mix, audio)) > 0 ? "playing" : "error");
    } catch {
      setStatus("error");
    }
  }
  return (
    <div className={s.mix} data-testid="occasion-mix" data-occasion={mix.key} data-topic={mix.topicId}>
      <button type="button" className={s.mixPlay} data-testid="occasion-mix-play" disabled={status === "loading"} onClick={() => void play()}>
        {status === "loading" && mix.head.length === 0
          ? mt("mix.preparing")
          : withSlot(tt("today.mix.play"), "name", <Text value={mix.label[ui]} lang={ui} />)}
      </button>
      <p className={s.sectionLead}>
        {tt("today.mix.lead")}
        {audio === "both"
          ? ` ${mt("mix.header", { sections: mt("mix.sections", { count: mix.sections }), shiurim: mt("mix.shiurim", { count: mix.shiurim }) })}`
          : ""}
      </p>
      <p className={s.aiNote} data-mix-label="auto">
        {mt("mix.auto")}
      </p>
      <p role="status" className={s.muted}>
        {status === "error" ? mt("mix.error") : ""}
      </p>
    </div>
  );
}

function ParshaName({ parshaKey, today, ui }: { parshaKey: string; today: TodayFile; ui: UiLang }): JSX.Element {
  const tt = todayT(ui);
  return <>{withSlot(tt("today.parsha"), "name", <Text value={occasionLabel(parshaKey, today, ui)} shiurLang={ui} />)}</>;
}

function MomentOfTheDay({ moment, today, ui, read }: { moment: DayMoment | null; today: TodayFile; ui: UiLang; read: Ed }): JSX.Element | null {
  const tt = todayT(ui);
  const shiur = useLoad(() => (moment ? loadShiur(moment.shiurId) : Promise.resolve(null)), [moment?.shiurId]);
  if (!moment || moment.t === null) return null;
  const row = rowsById(today).get(moment.shiurId);
  const content = shiur.status === "ok" && shiur.data ? momentContent(shiur.data, moment.id) : null;
  if (shiur.status === "error" || (shiur.status === "ok" && !content)) return null;
  const href = paths.shiur(ui, moment.shiurId, { t: moment.t, m: moment.id });
  return (
    <section className={s.section} aria-labelledby="today-moment">
      <h2 id="today-moment" className={s.sectionTitle}>
        {tt("today.moment")}
      </h2>
      <div className={s.moment} data-moment={moment.id}>
        {content ? (
          <>
            <p className={s.momentKind}>{tt(`today.moment.kind.${content.kind}` as TodayKey)}</p>
            <Text as="p" className={s.momentText} value={content.text} lang={read} />
          </>
        ) : (
          <p className={s.muted}>{tt("today.loading")}</p>
        )}
        {row ? (
          <p className={s.muted}>
            {withSlot(tt("today.moment.from"), "title", <Text value={row.title} shiurLang={row.lang} />)}
          </p>
        ) : null}
        <Link className={s.play} to={href}>
          {tt("today.moment.play", { time: formatClock(moment.t) })}
        </Link>
        <p className={s.aiNote}>{notice("aiNotesShort", ui)}</p>
      </div>
    </section>
  );
}

async function loadContinue(): Promise<{ progress: Awaited<ReturnType<typeof readProgress>>; rows: Awaited<ReturnType<typeof loadContinueRows>> }> {
  const progress = await readProgress();
  // Nothing heard yet: no shiur file is requested.
  return { progress, rows: progress.length > 0 ? await loadContinueRows(progress) : new Map() };
}

function Continue({ ui, read }: { ui: UiLang; read: Ed }): JSX.Element {
  const tt = todayT(ui);
  const audio = useSettings((st) => st.audio);
  const version = useProgressSourceVersion();
  const loaded = useLoad(loadContinue, [version]);
  const items = loaded.status === "ok" ? continueItems(loaded.data.progress, loaded.data.rows, audio) : [];
  return (
    <section className={s.section} aria-labelledby="today-continue">
      <h2 id="today-continue" className={s.sectionTitle}>
        {tt("today.continue")}
      </h2>
      {items.length === 0 ? (
        <p className={s.muted}>{tt("today.continue.empty")}</p>
      ) : (
        <ul className={s.row}>
          {items.map((it) => (
            <li key={`${it.kind}:${it.row.id}`}>
              <ShiurCard
                shiur={cardOf(it.row)}
                ui={ui}
                read={read}
                {...(it.kind === "resume" ? { t: it.t } : {})}
                kicker={it.kind === "resume" ? tt("today.continue.resume", { time: formatClock(it.t) }) : tt("today.continue.next")}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
