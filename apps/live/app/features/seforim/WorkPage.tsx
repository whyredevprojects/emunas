/**
 * `/:ui/seforim/:workId` and `/:ui/seforim/:workId/:chapter` (concept-live §5.4): where a sefer is
 * cited, in the sefer's own order, with every moment under each place.
 *
 * The places are ordered by their parsed Sefaria ref and grouped by chapter (daf for Shas). For
 * Chumash this is the pasuk view: `/seforim/bereishis/12` lists the pesukim of Bereishis 12 that are
 * cited, in order, each with the shiurim and times that discuss it. A work with many places opens on
 * a chapter index; a small one lists everything on one page. Places that could not be ordered and
 * mentions without a place follow.
 */
import { RESOLUTION_LABELS, formatClock, type UiLang } from "@emunas/i18n";
import { formatLive, livePaths } from "@emunas/links";
import { sefariaUrl } from "@emunas/normalize";
import { useMemo, type JSX } from "react";
import { Link, useParams } from "react-router";
import { Text } from "../../components/Text.tsx";
import { tFor, useUi } from "../../i18n/index.ts";
import { useLoad } from "../today/use-data.ts";
import { yearLabel } from "../today/format.ts";
import { EntityName, LoadState, MoreButton, momentHref, useShowMore } from "../entities/common.tsx";
import {
  loadCorpus,
  loadWork,
  notFoundToNull,
  type CorpusFile,
  type CorpusRow,
  type WorkCitation,
  type WorkFile,
} from "../entities/live-data.ts";
import { rowsById } from "../entities/model.ts";
import { browseT } from "../entities/strings.ts";
import { browseStyles as s } from "../entities/styles.ts";
import { chapterLabel, isGenreWork, layoutWork, placeLabel, shiurimIn, wantsChapterIndex, type ChapterGroup, type Place } from "./model.ts";

const paths = livePaths();

interface Loaded {
  work: WorkFile;
  corpus: CorpusFile;
}

async function loadWorkPage(key: string): Promise<Loaded | null> {
  const [work, corpus] = await Promise.all([notFoundToNull(loadWork(key)), loadCorpus()]);
  return work ? { work, corpus } : null;
}

export function chapterHref(ui: UiLang, workKey: string, chapter: string): string {
  return `${paths.work(ui, workKey)}/${encodeURIComponent(chapter)}`;
}

export function WorkPage(): JSX.Element {
  const ui = useUi();
  const bt = browseT(ui);
  const { workId = "", chapter } = useParams();
  const loaded = useLoad(() => loadWorkPage(workId), [workId]);
  const data = loaded.status === "ok" ? loaded.data : null;
  const layout = useMemo(() => (data ? layoutWork(data.work) : null), [data]);
  const group = chapter !== undefined && layout ? (layout.chapters.find((c) => c.key === chapter) ?? null) : null;

  const heading = data ? (
    group ? (
      <Text value={chapterLabel(group, ui)} lang={ui === "en" ? "en" : "he"} />
    ) : (
      <EntityName label={data.work.label} kind="w" ui={ui} />
    )
  ) : (
    tFor(ui)(chapter === undefined ? "page.work" : "page.workChapter")
  );

  return (
    <article className={s.page} aria-busy={loaded.status === "loading"} data-work-page={workId}>
      <p className={s.kicker}>
        <Link to={formatLive({ kind: "index", ed: ui, index: "sources" })}>{bt("seforim.all")}</Link>
        {data && chapter !== undefined ? (
          <>
            {" · "}
            <Link to={paths.work(ui, data.work.key)}>
              <EntityName label={data.work.label} kind="w" ui={ui} />
            </Link>
          </>
        ) : null}
      </p>
      <h1 className={s.title}>{heading}</h1>
      <LoadState load={loaded} ui={ui} />
      {loaded.status === "ok" && data === null ? <p className={s.muted}>{bt("seforim.notFound")}</p> : null}
      {data && layout ? (
        chapter !== undefined ? (
          group ? (
            <ChapterView data={data} chapters={layout.chapters} group={group} ui={ui} />
          ) : (
            <p className={s.muted}>{bt("seforim.chapter.notFound")}</p>
          )
        ) : (
          <WorkBody data={data} ui={ui} />
        )
      ) : null}
    </article>
  );
}

function WorkBody({ data, ui }: { data: Loaded; ui: UiLang }): JSX.Element {
  const bt = browseT(ui);
  const { work, corpus } = data;
  const layout = useMemo(() => layoutWork(work), [work]);
  const rows = rowsById(corpus);
  const shiurim = new Set([...work.locations.flatMap((l) => l.citations), ...work.unlocated].map((c) => c.shiurId));
  const index = wantsChapterIndex(layout);
  return (
    <>
      {ui === "en" && work.label.he ? (
        <p className={s.muted}>
          <Text value={work.label.he} lang="he" />
        </p>
      ) : null}
      <p className={s.meta}>
        <span>{bt("browse.shiurim", { count: shiurim.size })}</span>
        <span>{bt("browse.mentions", { count: layout.momentCount })}</span>
      </p>
      {isGenreWork(work.key) ? <p className={s.lead}>{bt("seforim.genre")}</p> : null}

      {index ? (
        <section className={s.section} aria-labelledby="chapters-title">
          <h2 id="chapters-title" className={s.sectionTitle}>
            {bt("seforim.chapters")}
          </h2>
          <p className={s.muted}>{bt("seforim.chapters.lead")}</p>
          <ul className={s.chapters} data-testid="chapter-index">
            {layout.chapters.map((g) => (
              <li key={g.key}>
                <Link className={s.chapterLink} to={chapterHref(ui, work.key, g.key)} data-chapter={g.key}>
                  <Text value={chapterLabel(g, ui)} lang={ui === "en" ? "en" : "he"} />
                  <span className={s.momentKind}>
                    {bt("seforim.chapter.places", { count: g.places.length })} · {bt("browse.shiurim", { count: shiurimIn(g.places).length })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        layout.chapters.map((g) => (
          <section key={g.key} className={s.section} aria-labelledby={`ch-${g.key}`} data-chapter={g.key}>
            <h2 id={`ch-${g.key}`} className={s.sectionTitle}>
              <Text value={chapterLabel(g, ui)} lang={ui === "en" ? "en" : "he"} />
            </h2>
            <PlaceList places={g.places} rows={rows} ui={ui} />
          </section>
        ))
      )}

      {layout.unordered.length > 0 ? (
        <section className={s.section} aria-labelledby="unordered-title" data-testid="unordered">
          <h2 id="unordered-title" className={s.sectionTitle}>
            {bt("seforim.unordered")}
          </h2>
          <p className={s.muted}>{bt("seforim.unordered.lead")}</p>
          <PlaceList places={layout.unordered} rows={rows} ui={ui} />
        </section>
      ) : null}

      {layout.unlocated.length > 0 ? (
        <section className={s.section} aria-labelledby="unlocated-title" data-testid="unlocated">
          <h2 id="unlocated-title" className={s.sectionTitle}>
            {bt("seforim.unlocated")}
          </h2>
          <p className={s.muted}>{bt("seforim.unlocated.lead")}</p>
          <Citations citations={layout.unlocated} rows={rows} ui={ui} step={30} />
        </section>
      ) : null}
    </>
  );
}

function ChapterView({ data, chapters, group, ui }: { data: Loaded; chapters: readonly ChapterGroup[]; group: ChapterGroup; ui: UiLang }): JSX.Element {
  const bt = browseT(ui);
  const rows = rowsById(data.corpus);
  const i = chapters.indexOf(group);
  const prev = chapters[i - 1];
  const next = chapters[i + 1];
  const lang = ui === "en" ? "en" : "he";
  return (
    <>
      <p className={s.meta}>
        <span>{bt("seforim.chapter.places", { count: group.places.length })}</span>
        <span>{bt("browse.shiurim", { count: shiurimIn(group.places).length })}</span>
      </p>
      <PlaceList places={group.places} rows={rows} ui={ui} />
      <nav className={s.pager} aria-label={bt("seforim.chapters")}>
        {prev ? (
          <Link to={chapterHref(ui, data.work.key, prev.key)} rel="prev">
            {bt("seforim.chapter.prev", { label: "" })}
            <Text value={chapterLabel(prev, ui)} lang={lang} />
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={chapterHref(ui, data.work.key, next.key)} rel="next">
            {bt("seforim.chapter.next", { label: "" })}
            <Text value={chapterLabel(next, ui)} lang={lang} />
          </Link>
        ) : null}
      </nav>
    </>
  );
}

function PlaceList({ places, rows, ui }: { places: readonly Place[]; rows: ReadonlyMap<string, CorpusRow>; ui: UiLang }): JSX.Element {
  const bt = browseT(ui);
  return (
    <ol className={s.list}>
      {places.map((pl, i) => {
        const label = placeLabel(pl, ui);
        const resolved = pl.location.sefariaRef !== null && pl.location.citations.some((c) => c.resolution === "resolved");
        return (
          <li key={`${pl.location.ref}|${i}`} className={s.place} data-place={pl.location.sefariaRef ?? pl.location.ref}>
            <span className={s.moment}>
              {label.script === "cited" ? (
                <Text as="strong" className={s.placeLabel} value={label.text} shiurLang={ui} />
              ) : (
                <Text as="strong" className={s.placeLabel} value={label.text} lang={label.script} />
              )}
              {resolved && pl.location.sefariaRef ? (
                <a href={sefariaUrl(pl.location.sefariaRef)} rel="noopener noreferrer" target="_blank" className={s.momentKind}>
                  {bt("seforim.sefaria")}
                </a>
              ) : null}
            </span>
            <Citations citations={pl.location.citations} rows={rows} ui={ui} step={10} />
          </li>
        );
      })}
    </ol>
  );
}

function Citations({
  citations,
  rows,
  ui,
  step,
}: {
  citations: readonly WorkCitation[];
  rows: ReadonlyMap<string, CorpusRow>;
  ui: UiLang;
  step: number;
}): JSX.Element {
  const bt = browseT(ui);
  const { shown, more, left } = useShowMore(citations.length, step);
  return (
    <>
      <ul className={s.moments}>
        {citations.slice(0, shown).map((c) => {
          const row = rows.get(c.shiurId);
          const year = row ? yearLabel(row.years) : null;
          const qualifier = c.resolution === "inferred" ? RESOLUTION_LABELS.inferred[ui] : "";
          return (
            <li key={c.sourceId} className={s.moment} data-citation={c.sourceId}>
              <Link to={momentHref(ui, { id: c.sourceId, shiurId: c.shiurId, t: c.t })} data-shiur={c.shiurId}>
                {row ? <Text value={row.title} shiurLang={row.lang} /> : <bdi>{c.shiurId}</bdi>}
              </Link>
              {year ? <Text value={year.hebrew} lang="he" /> : null}
              {c.t !== null ? <bdi dir="ltr">{formatClock(c.t)}</bdi> : <span className={s.momentKind}>{bt("browse.time.none")}</span>}
              <span className={s.momentKind}>
                {qualifier ? `${qualifier} ` : ""}
                {bt(`seforim.mention.${c.mention}`)}
              </span>
            </li>
          );
        })}
      </ul>
      <MoreButton more={more} left={left} ui={ui} />
    </>
  );
}
