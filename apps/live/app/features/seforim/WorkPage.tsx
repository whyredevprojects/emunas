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
import { EntityName, LoadState, MoreButton, ShiurRows, momentHref, useShowMore } from "../entities/common.tsx";
import { PersonChip } from "../entities/chips.tsx";
import { byYear } from "../entities/model.ts";
import { CorpusLabel } from "../../components/CorpusLabel.tsx";
import { NotFound } from "../../shell/PageStub.tsx";
import { readingLang, useSettings } from "../../shell/settings.ts";
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
import {
  chapterLabel,
  layoutWork,
  offersSefaria,
  placeLabel,
  shiurimIn,
  wantsChapterIndex,
  type ChapterGroup,
  type Place,
} from "./model.ts";
import { latinEdition, hebrewFormLang } from "../../i18n/content.ts";

const paths = livePaths();

interface Loaded {
  work: WorkFile;
  corpus: CorpusFile;
}

export async function loadWorkPage(key: string): Promise<Loaded | null> {
  const work = await notFoundToNull(loadWork(key));
  if (!work) return null;
  return { work, corpus: await loadCorpus() };
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

  if (loaded.status === "ok" && data === null) return <NotFound ui={ui} />;

  const heading = data ? (
    group ? (
      <Text value={chapterLabel(group, ui)} lang={hebrewFormLang(ui)} />
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
      {data && chapter === undefined ? <CorpusLabel ui={ui} reviewed={data.work.reviewed} className={s.aiNote} /> : null}
      <LoadState load={loaded} ui={ui} />
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
  const read = readingLang({ read: useSettings((x) => x.read) }, ui);
  const { work, corpus } = data;
  const layout = useMemo(() => layoutWork(work), [work]);
  const rows = rowsById(corpus);
  const shiurim = new Set([...work.shiurIds, ...[...work.locations.flatMap((l) => l.citations), ...work.unlocated].map((c) => c.shiurId)]);
  const index = wantsChapterIndex(layout);
  return (
    <>
      {latinEdition(ui) && work.label.he ? (
        <p className={s.muted}>
          <Text value={work.label.he} lang="he" />
        </p>
      ) : null}
      <p className={s.meta}>
        <span>{bt("browse.shiurim", { count: shiurim.size })}</span>
        <span>{bt("browse.mentions", { count: layout.momentCount })}</span>
      </p>
      <WorkLinks work={work} ui={ui} />
      {work.children.length > 0 ? <Family work={work} rows={rows} ui={ui} read={read} /> : null}

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
                  <Text value={chapterLabel(g, ui)} lang={hebrewFormLang(ui)} />
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
              <Text value={chapterLabel(g, ui)} lang={hebrewFormLang(ui)} />
            </h2>
            <PlaceList places={g.places} rows={rows} ui={ui} sefaria={offersSefaria(work)} />
          </section>
        ))
      )}

      {layout.unordered.length > 0 ? (
        <section className={s.section} aria-labelledby="unordered-title" data-testid="unordered">
          <h2 id="unordered-title" className={s.sectionTitle}>
            {bt("seforim.unordered")}
          </h2>
          <p className={s.muted}>{bt("seforim.unordered.lead")}</p>
          <PlaceList places={layout.unordered} rows={rows} ui={ui} sefaria={offersSefaria(work)} />
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
  const lang = hebrewFormLang(ui);
  return (
    <>
      <p className={s.meta}>
        <span>{bt("seforim.chapter.places", { count: group.places.length })}</span>
        <span>{bt("browse.shiurim", { count: shiurimIn(group.places).length })}</span>
      </p>
      <PlaceList places={group.places} rows={rows} ui={ui} sefaria={offersSefaria(data.work)} />
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

function PlaceList({
  places,
  rows,
  ui,
  sefaria,
}: {
  places: readonly Place[];
  rows: ReadonlyMap<string, CorpusRow>;
  ui: UiLang;
  /** The work has a Sefaria index title: places may link to Sefaria. */
  sefaria: boolean;
}): JSX.Element {
  const bt = browseT(ui);
  return (
    <ol className={s.list}>
      {places.map((pl, i) => {
        const label = placeLabel(pl, ui);
        const resolved = sefaria && pl.location.sefariaRef !== null && pl.location.citations.some((c) => c.resolution === "resolved");
        return (
          <li key={`${pl.location.ref}|${i}`} className={s.place} data-place={pl.location.sefariaRef ?? pl.location.ref}>
            <span className={s.moment}>
              {label.script === "cited" ? (
                <Text as="strong" className={s.placeLabel} value={label.text} shiurLang={null} />
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

/** Author, family and the Sefaria link, under the title. */
function WorkLinks({ work, ui }: { work: WorkFile; ui: UiLang }): JSX.Element | null {
  const bt = browseT(ui);
  if (!work.author && !work.parent && !offersSefaria(work)) return null;
  return (
    <div className={s.chips} data-testid="work-links">
      {work.author ? (
        <span className={s.chips} data-testid="work-author">
          <span className={s.momentKind}>{bt("seforim.author")}</span>
          <PersonChip chip={work.author} ui={ui} />
        </span>
      ) : null}
      {work.parent ? (
        <span className={s.chips} data-testid="work-parent">
          <span className={s.momentKind}>{bt("seforim.partOf")}</span>
          {work.parent.page ? (
            <Link className={s.chip} to={paths.work(ui, work.parent.id)}>
              <EntityName label={work.parent.label} kind="w" ui={ui} />
            </Link>
          ) : (
            <EntityName label={work.parent.label} kind="w" ui={ui} />
          )}
        </span>
      ) : null}
      {work.sefariaIndexTitle ? (
        <a className={s.chip} href={sefariaUrl(work.sefariaIndexTitle)} rel="noopener noreferrer" target="_blank" data-testid="work-sefaria">
          {bt("seforim.sefaria.work")}
        </a>
      ) : null}
    </div>
  );
}

/** A family hub: its child works in data order with counts, then every shiur citing the family. */
function Family({ work, rows, ui, read }: { work: WorkFile; rows: ReadonlyMap<string, CorpusRow>; ui: UiLang; read: UiLang }): JSX.Element {
  const bt = browseT(ui);
  const familyRows = byYear(work.shiurIds.flatMap((id) => rows.get(id) ?? []));
  return (
    <>
      <section className={s.section} aria-labelledby="family-title" data-testid="family">
        <h2 id="family-title" className={s.sectionTitle}>
          {bt("seforim.family")}
        </h2>
        <p className={s.muted}>{bt("seforim.family.lead")}</p>
        <ul className={s.shelf}>
          {work.children.map((c) => (
            <li key={c.id} className={s.row} data-child={c.id}>
              {c.page ? (
                <Link className={s.rowLink} to={paths.work(ui, c.id)}>
                  <EntityName label={c.label} kind="w" ui={ui} />
                </Link>
              ) : (
                <EntityName label={c.label} kind="w" ui={ui} />
              )}
              <span className={s.momentKind}>{bt("browse.shiurim", { count: c.count })}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className={s.section} aria-labelledby="family-shiurim-title" data-testid="family-shiurim">
        <h2 id="family-shiurim-title" className={s.sectionTitle}>
          {bt("seforim.family.shiurim")}
        </h2>
        <ShiurRows rows={familyRows} ui={ui} read={read} label={bt("seforim.family.shiurim")} />
      </section>
    </>
  );
}
