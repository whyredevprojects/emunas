/**
 * `/:ui/p/:personId`, `/:ui/c/:conceptId`, `/:ui/o/:occasionId` (concept-live §5.7,
 * concept-live-corpus C.5): one template.
 *
 * People and concepts are the corpus layer's merged entities, keyed by corpus id (C2.6):
 * - a person: his names as the data gives them, aliases under "also called", his seforim
 *   (`Work.authorPersonId`), then the three groups: cited as a source, in stories (merged stories),
 *   discussed;
 * - a concept: headed by the Hebrew term, its gloss and generated definition ("as the term is used in
 *   these shiurim"), its example sections as play buttons, then its shiurim;
 * - an occasion lists its shiurim by year and its moments (not a corpus entity: no corpus label).
 *
 * People and concepts carry the corpus label once, under the title (E.3; "Reviewed" when reviewed).
 *
 * The entity file is requested first and alone: an unknown or retired id (no file; the layer already
 * resolved merged ids, and there is no redirect lookup) is the not-found page after that one request.
 * Only then do `corpus.json` (shiur rows) and `facets.json` (related labels) load. Links go only to
 * pages that exist (`resolve.ts`, `chips.tsx`).
 */
import type { Ed } from "@emunas/corpus/public";
import { corpusLabel, formatClock, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useMemo, useState, type JSX } from "react";
import { Link, useParams } from "react-router";
import { CorpusLabel } from "../../components/CorpusLabel.tsx";
import { Text } from "../../components/Text.tsx";
import { tFor, useUi } from "../../i18n/index.ts";
import { readingLang, useSettings } from "../../shell/settings.ts";
import { NotFound } from "../../shell/PageStub.tsx";
import { useLoad } from "../today/use-data.ts";
import {
  AiNote,
  EntityName,
  LoadState,
  MomentGroups,
  QueueActions,
  RelatedEntities,
  ShiurLine,
  ShiurRows,
  YearSpark,
  momentHref,
} from "./common.tsx";
import {
  loadCorpus,
  loadEntity,
  loadFacets,
  notFoundToNull,
  type CorpusFile,
  type EntityFile,
  type EntityKind,
  type MomentRef,
  type PersonDetail,
  type PersonStory,
} from "./live-data.ts";
import { alsoCalled, byYear, groupByShiur, personGroups, personNames, queueItems, rowsById } from "./model.ts";
import { playBackToBack } from "./queue.ts";
import { createResolver, type EntityResolver } from "./resolve.ts";
import { browseT } from "./strings.ts";
import { browseStyles as s } from "./styles.ts";

const paths = livePaths();

interface Loaded {
  entity: EntityFile;
  corpus: CorpusFile;
  resolver: EntityResolver;
}

/** The entity file first; the corpus-wide files only once it exists (one request for a missing id). */
export async function loadEntityPage(kind: EntityKind, key: string): Promise<Loaded | null> {
  const entity = await notFoundToNull(loadEntity(kind, key));
  if (!entity) return null;
  const [corpus, facets] = await Promise.all([loadCorpus(), loadFacets()]);
  return { entity, corpus, resolver: createResolver(facets) };
}

const PAGE_KEY = { p: "page.person", c: "page.concept", o: "page.occasion" } as const;
const KIND_KEY = { p: "entity.person", c: "entity.concept", o: "entity.occasion" } as const;
const PARAM = { p: "personId", c: "conceptId", o: "occasionId" } as const;

export function EntityPage({ kind }: { kind: EntityKind }): JSX.Element {
  const ui = useUi();
  const bt = browseT(ui);
  const key = useParams()[PARAM[kind]] ?? "";
  const read = readingLang({ read: useSettings((x) => x.read) }, ui);
  const loaded = useLoad(() => loadEntityPage(kind, key), [kind, key]);
  const data = loaded.status === "ok" ? loaded.data : null;

  if (loaded.status === "ok" && data === null) return <NotFound ui={ui} />;
  const corpusEntity = kind !== "o";

  return (
    <article className={s.page} aria-busy={loaded.status === "loading"} data-entity-page={`${kind}:${key}`}>
      <p className={s.kicker}>{bt(KIND_KEY[kind])}</p>
      <h1 className={s.title}>{data ? <EntityName label={data.entity.label} kind={kind} ui={ui} /> : tFor(ui)(PAGE_KEY[kind])}</h1>
      {data && corpusEntity ? <CorpusLabel ui={ui} reviewed={data.entity.reviewed === true} className={s.aiNote} /> : null}
      <LoadState load={loaded} ui={ui} />
      {data ? <EntityBody data={data} kind={kind} ui={ui} read={read} /> : null}
    </article>
  );
}

function EntityBody({ data, kind, ui, read }: { data: Loaded; kind: EntityKind; ui: UiLang; read: Ed }): JSX.Element {
  const bt = browseT(ui);
  const { entity, corpus, resolver } = data;
  const rows = rowsById(corpus);
  const entityRows = useMemo(() => byYear(entity.shiurIds.flatMap((id) => rows.get(id) ?? [])), [entity, rows]);
  const groups = useMemo(() => groupByShiur(entity.moments), [entity]);

  return (
    <>
      {kind === "p" && entity.person ? <PersonHead person={entity.person} ui={ui} /> : null}
      {kind === "c" && entity.concept ? <ConceptHead entity={entity} ui={ui} /> : null}
      <p className={s.meta}>
        <span>{bt("browse.shiurim", { count: entity.shiurIds.length })}</span>
        {kind === "o" && entity.moments.length > 0 ? <span>{bt("browse.moments", { count: entity.moments.length })}</span> : null}
      </p>
      <YearSpark years={entity.years} ui={ui} total={entity.shiurIds.length} />

      {kind === "p" ? (
        <PersonSections data={data} ui={ui} read={read} />
      ) : kind === "c" ? (
        <>
          <ConceptExamples entity={entity} corpus={corpus} ui={ui} />
          <section className={s.section} aria-labelledby="shiurim-title">
            <h2 id="shiurim-title" className={s.sectionTitle}>
              {bt("entity.shiurim")}
            </h2>
            <ShiurRows rows={entityRows} ui={ui} read={read} label={bt("entity.shiurim")} />
          </section>
        </>
      ) : (
        <>
          {groups.length > 0 ? (
            <section className={s.section} aria-labelledby="moments-title">
              <h2 id="moments-title" className={s.sectionTitle}>
                {bt("entity.occasion.moments")}
              </h2>
              <QueueActions items={queueItems(entity.moments)} ui={ui} />
              <MomentGroups groups={groups} rows={rows} ui={ui} read={read} label={bt("entity.occasion.moments")} />
            </section>
          ) : null}
          <section className={s.section} aria-labelledby="shiurim-title">
            <h2 id="shiurim-title" className={s.sectionTitle}>
              {bt("entity.shiurim")}
            </h2>
            <ShiurRows rows={entityRows} ui={ui} read={read} label={bt("entity.shiurim")} />
          </section>
        </>
      )}

      <RelatedEntities related={entity.related} resolver={resolver} ui={ui} />
      <AiNote ui={ui} />
    </>
  );
}

// ------------------------------------------------------------------------------------- person

function PersonHead({ person, ui }: { person: PersonDetail; ui: UiLang }): JSX.Element {
  const bt = browseT(ui);
  const names = personNames(person.names);
  const aliases = alsoCalled(person);
  return (
    <>
      {names.length > 0 ? (
        <p className={s.names} data-testid="person-names">
          {names.map((n) => (
            <Text key={n.lang} value={n.text} lang={n.lang} />
          ))}
        </p>
      ) : null}
      {aliases.length > 0 ? (
        <p className={s.muted} data-testid="also-called">
          {bt("entity.person.alsoCalled")}:{" "}
          {aliases.map((a, i) => (
            <span key={a}>
              {i > 0 ? ", " : null}
              <Text value={a} shiurLang={ui} />
            </span>
          ))}
        </p>
      ) : null}
      {person.description ? <Text as="p" className={s.lead} value={person.description[ui]} lang={ui} /> : null}
      {person.works.length > 0 ? (
        <section className={s.section} aria-labelledby="works-title" data-testid="his-seforim">
          <h2 id="works-title" className={s.groupTitle}>
            {bt("entity.person.works")}
          </h2>
          <ul className={s.chips}>
            {person.works.map((w) => (
              <li key={w.id}>
                {w.page ? (
                  <Link className={s.chip} to={paths.work(ui, w.id)} data-work={w.id}>
                    <EntityName label={w.label} kind="w" ui={ui} />
                  </Link>
                ) : (
                  <span data-work-text={w.id}>
                    <EntityName label={w.label} kind="w" ui={ui} />
                  </span>
                )}
                <span className={s.momentKind}> {bt("browse.shiurim", { count: w.count })}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** Where a merged story links: its page when told twice, else its first telling in the room. */
export function storyHref(ui: UiLang, st: PersonStory): string {
  if (st.page) return paths.story(ui, st.id);
  const { shiurId, momentId, t } = st.first;
  try {
    return paths.shiur(ui, shiurId, { ...(t === null ? {} : { t }), m: momentId });
  } catch {
    return paths.shiur(ui, shiurId, t === null ? {} : { t });
  }
}

function PersonSections({ data, ui, read }: { data: Loaded; ui: UiLang; read: Ed }): JSX.Element {
  const bt = browseT(ui);
  const { entity, corpus } = data;
  const groups = useMemo(() => personGroups(entity, corpus), [entity, corpus]);
  const name = ui === "en" ? entity.label.en : (entity.label.he ?? entity.label.yi);

  return (
    <>
      {groups.cited.length > 0 ? (
        <section className={s.section} aria-labelledby="cited-title" data-split="cited">
          <h2 id="cited-title" className={s.sectionTitle}>
            {bt("entity.person.cited")}
          </h2>
          <p className={s.muted}>{bt("entity.person.cited.lead", { name })}</p>
          <ShiurRows rows={groups.cited} ui={ui} read={read} label={bt("entity.person.cited")} />
        </section>
      ) : null}

      {groups.stories.length > 0 ? (
        <section className={s.section} aria-labelledby="stories-title" data-split="stories">
          <h2 id="stories-title" className={s.sectionTitle}>
            {bt("entity.person.stories")}
          </h2>
          <p className={s.meta}>{bt("browse.stories", { count: groups.stories.length })}</p>
          <QueueActions items={queueItems(entity.moments)} ui={ui} />
          <ul className={s.list} aria-label={bt("entity.person.stories")}>
            {groups.stories.map((st) => (
              <li key={st.id} className={s.row} data-story={st.id}>
                <Link className={s.rowLink} to={storyHref(ui, st)}>
                  <Text value={st.title} lang={ui} />
                </Link>
                <span className={s.momentKind}>{bt("entity.person.story.tellings", { count: st.tellings })}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groups.discussed.length > 0 ? (
        <section className={s.section} aria-labelledby="discussed-title" data-split="discussed">
          <h2 id="discussed-title" className={s.sectionTitle}>
            {bt("entity.person.discussed")}
          </h2>
          <p className={s.muted}>{bt("entity.person.discussed.lead", { name })}</p>
          <ShiurRows rows={groups.discussed} ui={ui} read={read} label={bt("entity.person.discussed")} />
        </section>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------------------------- concept

function ConceptHead({ entity, ui }: { entity: EntityFile; ui: UiLang }): JSX.Element | null {
  const c = entity.concept;
  if (!c) return null;
  return (
    <section className={s.section} aria-labelledby="definition-title" data-testid="definition">
      <h2 id="definition-title" className={s.groupTitle}>
        {corpusLabel("glossary.asUsed", ui)}
      </h2>
      {c.label[ui] ? <Text as="p" className={s.muted} value={c.label[ui]} lang={ui} /> : null}
      {c.definition[ui] ? <Text as="p" className={s.definition} value={c.definition[ui]} lang={ui} /> : null}
    </section>
  );
}

type PlayState = { id: string; status: "playing" | "failed" } | null;

/** The concept's example sections, each a play button for that section ("hear it explained"). */
function ConceptExamples({ entity, corpus, ui }: { entity: EntityFile; corpus: CorpusFile; ui: UiLang }): JSX.Element | null {
  const bt = browseT(ui);
  const rows = rowsById(corpus);
  const [state, setState] = useState<PlayState>(null);
  const examples = entity.moments.filter((m): m is MomentRef & { t: number } => m.t !== null);
  if (examples.length === 0) return null;
  const play = async (m: MomentRef & { t: number }) => {
    try {
      await playBackToBack([{ shiurId: m.shiurId, start: m.t, end: m.end, momentId: m.id }]);
      setState({ id: m.id, status: "playing" });
    } catch {
      setState({ id: m.id, status: "failed" });
    }
  };
  return (
    <section className={s.section} aria-labelledby="examples-title" data-testid="examples">
      <h2 id="examples-title" className={s.sectionTitle}>
        {bt("entity.concept.examples")}
      </h2>
      <ul className={s.list}>
        {examples.map((m) => {
          const row = rows.get(m.shiurId);
          return (
            <li key={m.id} className={s.shiur} data-example={m.id}>
              {row ? <ShiurLine row={row} ui={ui} /> : null}
              <span className={s.buttons}>
                <button type="button" className={`${s.button} ${s.primary}`} onClick={() => void play(m)} data-action="play-example">
                  {bt("entity.concept.play")} <bdi dir="ltr">{formatClock(m.t)}</bdi>
                </button>
                <Link to={momentHref(ui, m)}>{bt("browse.listen", { time: formatClock(m.t) })}</Link>
              </span>
            </li>
          );
        })}
      </ul>
      <p className={s.status} role="status">
        {state?.status === "playing" ? bt("browse.queue.playing", { count: 1 }) : state?.status === "failed" ? bt("browse.queue.failed") : ""}
      </p>
    </section>
  );
}
