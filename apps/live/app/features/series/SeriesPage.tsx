/**
 * `/:ui/series/:seriesId` (concept-live §5.6): the parts in `seriesOrder` with their one-liners,
 * progress and "continue"; Tanya also by perek (both languages under each perek); where the course
 * exists in the other language, the two side by side. Series overviews (pipeline P10) do not exist
 * yet, so the page uses catalog titles and per-part one-liners only.
 */
import type { Ed } from "@emunas/corpus/public";
import { formatNumber, hebrewNumeral, languageName, notice, type UiLang } from "@emunas/i18n";
import { formatLive, livePaths } from "@emunas/links";
import type { JSX } from "react";
import { Link, useLocation, useParams } from "react-router";
import { Text } from "../../components/Text.tsx";
import { loadSeries, notFoundToNull, type SeriesFile, type SeriesPart } from "../today/live-data.ts";
import { tFor, useUi } from "../../i18n/index.ts";
import { readingLang, useSettings } from "../../shell/settings.ts";
import { readProgress, useProgressSourceVersion, type ProgressRecord } from "../today/personal.ts";
import { ShiurCard, type CardData } from "../today/ShiurCard.tsx";
import { useLoad } from "../today/use-data.ts";
import { INTRO_PEREK, orderParts, perekGroups, seriesProgress, viewFromQuery, type PerekGroup, type SeriesView } from "./model.ts";
import { seriesT, type SeriesT } from "./strings.ts";
import { seriesStyles as s } from "./styles.ts";

const paths = livePaths();

interface Loaded {
  series: SeriesFile;
  sibling: SeriesFile | null;
}

async function loadWithSibling(id: string): Promise<Loaded | null> {
  const series = await notFoundToNull(loadSeries(id));
  if (!series) return null;
  // The sibling is extra: a missing or failing file just means no side-by-side view.
  const sibling = series.sibling ? await loadSeries(series.sibling).catch(() => null) : null;
  return { series, sibling };
}

function cardOf(p: SeriesPart, lang: Ed): CardData {
  return { id: p.shiurId, lang, title: p.title, oneLiner: p.oneLiner, duration: p.duration, years: p.years, status: p.status };
}

function partLabel(p: SeriesPart, st: SeriesT): string {
  return p.order === null ? st("series.part.noOrder") : st("series.part", { n: p.order });
}

export function SeriesPage(): JSX.Element {
  const ui = useUi();
  const st = seriesT(ui);
  const { seriesId = "" } = useParams();
  const location = useLocation();
  const read = readingLang({ read: useSettings((x) => x.read) }, ui);
  const loaded = useLoad(() => loadWithSibling(seriesId), [seriesId]);
  const version = useProgressSourceVersion();
  const progress = useLoad(readProgress, [version]);
  const records = progress.status === "ok" ? progress.data : [];

  const data = loaded.status === "ok" ? loaded.data : null;
  const title = data ? data.series.title[ui] : tFor(ui)("page.seriesOne");

  return (
    <article className={s.page} aria-busy={loaded.status === "loading"} data-series={seriesId}>
      <h1 className={s.title}>{data ? <Text value={data.series.title} lang={ui} /> : title}</h1>
      <p className={s.muted}>
        <Link to={formatLive({ kind: "index", ed: ui, index: "series" })}>{st("series.all")}</Link>
      </p>
      {loaded.status === "error" ? (
        <p role="alert" className={s.muted}>
          {st("series.error")}
        </p>
      ) : loaded.status === "loading" ? (
        <p className={s.muted}>{st("series.loading")}</p>
      ) : data === null ? (
        <p className={s.muted}>{st("series.notFound")}</p>
      ) : (
        <SeriesBody data={data} ui={ui} read={read} search={location.search} records={records} />
      )}
    </article>
  );
}

function SeriesBody({
  data,
  ui,
  read,
  search,
  records,
}: {
  data: Loaded;
  ui: UiLang;
  read: Ed;
  search: string;
  records: readonly ProgressRecord[];
}): JSX.Element {
  const st = seriesT(ui);
  const { series, sibling } = data;
  const groups = perekGroups(sibling ? [series, sibling] : [series]);
  const view = viewFromQuery(search, { hasPerek: groups.length > 0, hasSibling: sibling !== null });
  const parts = orderParts(series.parts);
  const prog = seriesProgress(series.parts, records);
  const heard = new Map(records.map((r) => [r.shiurId, r]));
  const anyNotes = [...series.parts, ...(sibling?.parts ?? [])].some((p) => p.oneLiner !== null);

  const views: SeriesView[] = ["order", ...(groups.length > 0 ? (["perek"] as const) : []), ...(sibling ? (["both"] as const) : [])];

  return (
    <>
      <p className={s.meta}>
        {st("series.lang", { lang: languageName(series.lang, ui) })} · {st("series.parts", { count: parts.length })}
        {sibling ? (
          <>
            {" · "}
            <Link to={paths.series(ui, sibling.id)}>{st("series.alsoIn", { lang: languageName(sibling.lang, ui) })}</Link>
          </>
        ) : null}
      </p>
      <p className={s.lead}>{st("series.overviewGap")}</p>

      {parts.length > 0 ? <Progress ui={ui} done={prog.completed} total={prog.total} next={prog.next} /> : null}

      {views.length > 1 ? (
        <nav className={s.controls} aria-label={st("series.view")}>
          {views.map((v) => (
            <Link key={v} className={s.viewLink} to={{ search: viewSearch(search, v) }} aria-current={v === view ? "true" : undefined} replace>
              {st(`series.view.${v}`)}
            </Link>
          ))}
        </nav>
      ) : null}

      {parts.length === 0 ? (
        <p className={s.muted}>{st("series.noParts")}</p>
      ) : view === "perek" ? (
        <PerekView groups={groups} ui={ui} read={read} heard={heard} />
      ) : view === "both" && sibling ? (
        <div className={s.columns}>
          {[series, sibling].map((x) => (
            <section key={x.id} className={s.column} aria-labelledby={`col-${x.id}`} data-column={x.lang}>
              <h2 id={`col-${x.id}`} className={s.columnTitle}>
                <Link to={paths.series(ui, x.id)}>
                  <Text value={x.title} lang={ui} />
                </Link>{" "}
                <span className={s.meta}>({languageName(x.lang, ui)})</span>
              </h2>
              <PartList parts={orderParts(x.parts)} lang={x.lang} ui={ui} read={read} heard={heard} label={x.title[ui]} />
            </section>
          ))}
        </div>
      ) : (
        <PartList parts={parts} lang={series.lang} ui={ui} read={read} heard={heard} label={series.title[ui]} />
      )}
      {anyNotes ? <p className={s.aiNote}>{notice("aiNotesShort", ui)}</p> : null}
    </>
  );
}

/** The current query with `view` set (or removed for the default). */
export function viewSearch(search: string, view: SeriesView): string {
  const q = new URLSearchParams(search);
  if (view === "order") q.delete("view");
  else q.set("view", view);
  const out = q.toString();
  return out === "" ? "" : `?${out}`;
}

function Progress({ ui, done, total, next }: { ui: UiLang; done: number; total: number; next: SeriesPart | null }): JSX.Element {
  const st = seriesT(ui);
  if (done === 0 && next === null) return <p className={s.muted}>{st("series.progress.none")}</p>;
  const label = st("series.progress", { done: formatNumber(done, ui), total: formatNumber(total, ui) });
  return (
    <div className={s.progress} data-testid="series-progress">
      <span id="series-progress-label">{label}</span>
      <progress className={s.bar} max={total} value={done} aria-labelledby="series-progress-label" />
      {next ? (
        <Link className={s.continue} to={paths.shiur(ui, next.shiurId)}>
          {st("series.continue", { n: next.order ?? "" })}
        </Link>
      ) : null}
    </div>
  );
}

function PartState({ record, ui }: { record: ProgressRecord | undefined; ui: UiLang }): JSX.Element | null {
  const st = seriesT(ui);
  if (!record) return null;
  if (record.completed) return <span className={s.state}>{st("series.heard")}</span>;
  if (record.t > 0) return <span className={s.state}>{st("series.started")}</span>;
  return null;
}

function PartList({
  parts,
  lang,
  ui,
  read,
  heard,
  label,
}: {
  parts: readonly SeriesPart[];
  lang: Ed;
  ui: UiLang;
  read: Ed;
  heard: Map<string, ProgressRecord>;
  label: string;
}): JSX.Element {
  const st = seriesT(ui);
  return (
    <ol className={s.parts} aria-label={label}>
      {parts.map((p) => {
        const r = heard.get(p.shiurId);
        return (
          <li key={p.shiurId} data-order={p.order ?? ""}>
            <ShiurCard
              shiur={cardOf(p, lang)}
              ui={ui}
              read={read}
              {...(r && !r.completed && r.t > 0 ? { t: r.t } : {})}
              kicker={
                <>
                  <span>{partLabel(p, st)}</span>
                  <PartState record={r} ui={ui} />
                </>
              }
            />
          </li>
        );
      })}
    </ol>
  );
}

function perekTitle(g: PerekGroup, st: SeriesT): string {
  if (g.perek === null) return st("series.perek.other");
  if (g.perek === INTRO_PEREK) return st("series.perek.intro");
  return st("series.perek", { n: hebrewNumeral(g.perek, "hebrew") });
}

function PerekView({
  groups,
  ui,
  read,
  heard,
}: {
  groups: readonly PerekGroup[];
  ui: UiLang;
  read: Ed;
  heard: Map<string, ProgressRecord>;
}): JSX.Element {
  const st = seriesT(ui);
  return (
    <div className={s.column}>
      {groups.map((g) => {
        const id = `perek-${g.perek ?? "other"}`;
        return (
          <section key={id} className={s.group} aria-labelledby={id} data-perek={g.perek ?? "other"}>
            <h2 id={id} className={s.groupTitle} lang={g.perek === null ? ui : "he"}>
              {perekTitle(g, st)}
            </h2>
            <ul className={s.parts}>
              {g.parts.map(({ part, lang, seriesId }) => (
                <li key={`${seriesId}:${part.shiurId}`} data-lang={lang}>
                  <ShiurCard
                    shiur={cardOf(part, lang)}
                    ui={ui}
                    read={read}
                    kicker={
                      <>
                        <span>{partLabel(part, st)}</span>
                        <span>{languageName(lang, ui)}</span>
                        {part.perek !== null ? <Text value={part.perek} lang="he" /> : null}
                        <PartState record={heard.get(part.shiurId)} ui={ui} />
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
