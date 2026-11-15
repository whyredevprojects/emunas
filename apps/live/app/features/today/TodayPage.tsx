/**
 * Today (concept-live §5.1, tech-live §1 `/:ui/`). The frame and `h1` render at once (prerendered
 * per interface language); the date-dependent parts are computed on the client after mount from the
 * visitor's own day, so the page stays current without a rebuild and hydration never mismatches.
 */
import type { Ed } from "@emunas/corpus/public";
import { formatClock, formatNumber, notice, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { Fragment, useEffect, useMemo, useState, type JSX, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Text } from "../../components/Text.tsx";
import { loadCorpus, loadFacets, loadShiur, loadToday, type CorpusFile, type CorpusRow, type FacetsFile, type TodayFile } from "./live-data.ts";
import { tFor, useUi } from "../../i18n/index.ts";
import { readingLang, useSettings } from "../../shell/settings.ts";
import { formatCivilDate, formatHebrewDate, momentContent, occasionLabel } from "./format.ts";
import { useIsrael } from "./israel.ts";
import { buildToday, continueItems, dateFromQuery, localIsoDay, type DayMoment, type TodayView } from "./model.ts";
import { readProgress, useProgressSourceVersion } from "./personal.ts";
import { ShiurCard, type CardData } from "./ShiurCard.tsx";
import { todayT, type TodayKey } from "./strings.ts";
import { todayStyles as s } from "./styles.ts";
import { useLoad } from "./use-data.ts";

interface TodayData {
  today: TodayFile;
  corpus: CorpusFile;
  facets: FacetsFile | null;
}

async function loadTodayData(): Promise<TodayData> {
  const [today, corpus, facets] = await Promise.all([
    loadToday(),
    loadCorpus(),
    // labels only: the page works without them
    loadFacets().catch(() => null),
  ]);
  return { today, corpus, facets };
}

export function cardOf(r: CorpusRow): CardData {
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
    return buildToday({ date, israel, audio, today: data.data.today, corpus: data.data.corpus });
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
          <ThisWeek view={view} facets={data.data.facets} ui={ui} read={read} />
          <MomentOfTheDay moment={view.moment} corpus={data.data.corpus} ui={ui} read={read} />
          <Continue corpus={data.data.corpus} ui={ui} read={read} />
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

function CardRow({ rows, ui, read }: { rows: readonly CorpusRow[]; ui: UiLang; read: Ed }): JSX.Element {
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

function ThisWeek({ view, facets, ui, read }: { view: TodayView; facets: FacetsFile | null; ui: UiLang; read: Ed }): JSX.Element {
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
      {p ? (
        <div className={s.section} data-parsha={p.key}>
          <h3 className={s.occasionTitle}>
            <Link to={paths.occasion(ui, p.key)}>
              <ParshaName parshaKey={p.key} facets={facets} ui={ui} />
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
              <Text value={occasionLabel(o.key, facets, ui)} shiurLang={ui} />
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

function ParshaName({ parshaKey, facets, ui }: { parshaKey: string; facets: FacetsFile | null; ui: UiLang }): JSX.Element {
  const tt = todayT(ui);
  return <>{withSlot(tt("today.parsha"), "name", <Text value={occasionLabel(parshaKey, facets, ui)} shiurLang={ui} />)}</>;
}

function MomentOfTheDay({ moment, corpus, ui, read }: { moment: DayMoment | null; corpus: CorpusFile; ui: UiLang; read: Ed }): JSX.Element | null {
  const tt = todayT(ui);
  const shiur = useLoad(() => (moment ? loadShiur(moment.shiurId) : Promise.resolve(null)), [moment?.shiurId]);
  if (!moment || moment.t === null) return null;
  const row = corpus.shiurim.find((r) => r.id === moment.shiurId);
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

function Continue({ corpus, ui, read }: { corpus: CorpusFile; ui: UiLang; read: Ed }): JSX.Element {
  const tt = todayT(ui);
  const audio = useSettings((st) => st.audio);
  const version = useProgressSourceVersion();
  const progress = useLoad(readProgress, [version]);
  const items = progress.status === "ok" ? continueItems(progress.data, corpus, audio) : [];
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
