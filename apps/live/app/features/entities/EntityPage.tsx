/**
 * `/:ui/p/:personId`, `/:ui/c/:conceptId`, `/:ui/o/:occasionId` (concept-live §5.7): one template.
 * Name (Hebrew and English), counts, a year histogram, the entities that often occur with it, and its
 * moments grouped by shiur. A person's page is split into cited as a source / in stories / discussed;
 * a concept is headed by its Hebrew term; an occasion lists its shiurim by year and its moments.
 *
 * Links go only to pages that exist (`resolve.ts`). Data: `entity/<kind>/<key>.json`, `corpus.json`,
 * `facets.json` and, for people, `stories.json`.
 */
import type { Ed } from "@emunas/corpus/public";
import type { UiLang } from "@emunas/i18n";
import { useMemo, type JSX } from "react";
import { Link, useParams } from "react-router";
import { Text } from "../../components/Text.tsx";
import { tFor, useUi } from "../../i18n/index.ts";
import { readingLang, useSettings } from "../../shell/settings.ts";
import { useLoad } from "../today/use-data.ts";
import { StoryList } from "../maasios/StoryList.tsx";
import { AiNote, EntityName, LoadState, MomentGroups, QueueActions, RelatedEntities, ShiurRows, YearSpark } from "./common.tsx";
import {
  loadCorpus,
  loadEntity,
  loadFacets,
  loadStories,
  notFoundToNull,
  type CorpusFile,
  type EntityFile,
  type EntityKind,
  type StoryRow,
} from "./live-data.ts";
import { byYear, groupByShiur, personSplit, queueItems, rowsById } from "./model.ts";
import { createResolver, type EntityResolver } from "./resolve.ts";
import { browseT } from "./strings.ts";
import { browseStyles as s } from "./styles.ts";

interface Loaded {
  entity: EntityFile;
  corpus: CorpusFile;
  resolver: EntityResolver;
  stories: readonly StoryRow[];
}

async function loadEntityPage(kind: EntityKind, key: string): Promise<Loaded | null> {
  const [entity, corpus, facets, stories] = await Promise.all([
    notFoundToNull(loadEntity(kind, key)),
    loadCorpus(),
    loadFacets(),
    kind === "p" ? loadStories().then((x) => x.stories) : Promise.resolve([]),
  ]);
  if (!entity) return null;
  return { entity, corpus, resolver: createResolver(facets), stories };
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

  return (
    <article className={s.page} aria-busy={loaded.status === "loading"} data-entity-page={`${kind}:${key}`}>
      <p className={s.kicker}>{bt(KIND_KEY[kind])}</p>
      <h1 className={s.title}>{data ? <EntityName label={data.entity.label} kind={kind} ui={ui} /> : tFor(ui)(PAGE_KEY[kind])}</h1>
      <LoadState load={loaded} ui={ui} />
      {loaded.status === "ok" && data === null ? <p className={s.muted}>{bt("entity.notFound")}</p> : null}
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
  const other = ui === "en" ? (entity.label.he ?? entity.label.yi) : entity.label.en;
  const showOther = kind !== "c" && other !== "" && other !== (ui === "en" ? entity.label.en : (entity.label.he ?? entity.label.yi));

  return (
    <>
      {showOther ? <p className={s.muted}>{ui === "en" ? <Text value={other} lang="he" /> : <Text value={other} lang="en" />}</p> : null}
      <p className={s.meta}>
        <span>{bt("browse.shiurim", { count: entity.shiurIds.length })}</span>
        {entity.moments.length > 0 ? <span>{bt("browse.moments", { count: entity.moments.length })}</span> : null}
      </p>
      <YearSpark years={entity.years} ui={ui} total={entity.shiurIds.length} />

      {kind === "p" ? (
        <PersonSections data={data} ui={ui} read={read} />
      ) : (
        <>
          {kind === "c" ? <p className={s.lead}>{bt("entity.concept.lead")}</p> : null}
          {groups.length > 0 ? (
            <section className={s.section} aria-labelledby="moments-title">
              <h2 id="moments-title" className={s.sectionTitle}>
                {bt(kind === "c" ? "entity.concept.moments" : "entity.occasion.moments")}
              </h2>
              <QueueActions items={queueItems(entity.moments)} ui={ui} />
              <MomentGroups groups={groups} rows={rows} ui={ui} read={read} label={bt(kind === "c" ? "entity.concept.moments" : "entity.occasion.moments")} />
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

function PersonSections({ data, ui, read }: { data: Loaded; ui: UiLang; read: Ed }): JSX.Element {
  const bt = browseT(ui);
  const { entity, corpus, resolver, stories } = data;
  const split = useMemo(() => personSplit(entity.key, entity, corpus, stories), [entity, corpus, stories]);
  const rows = rowsById(corpus);
  const name = ui === "en" ? entity.label.en : (entity.label.he ?? entity.label.yi);
  const workHref = resolver.href(ui, "w", entity.key);

  return (
    <>
      {split.cited.length > 0 ? (
        <section className={s.section} aria-labelledby="cited-title" data-split="cited">
          <h2 id="cited-title" className={s.sectionTitle}>
            {bt("entity.person.cited")}
          </h2>
          <p className={s.muted}>{bt("entity.person.cited.lead", { name })}</p>
          {workHref ? (
            <p className={s.muted}>
              <Link to={workHref}>{bt("entity.person.cited.work")}</Link>
            </p>
          ) : null}
          <ShiurRows rows={split.cited} ui={ui} read={read} label={bt("entity.person.cited")} />
        </section>
      ) : null}

      {split.inStories.length > 0 ? (
        <section className={s.section} aria-labelledby="stories-title" data-split="stories">
          <h2 id="stories-title" className={s.sectionTitle}>
            {bt("entity.person.stories")}
          </h2>
          <p className={s.meta}>{bt("browse.stories", { count: split.inStories.length })}</p>
          <QueueActions items={queueItems(split.inStories)} ui={ui} />
          <StoryList stories={split.inStories} rows={rows} resolver={resolver} ui={ui} read={read} label={bt("entity.person.stories")} skipPerson={entity.key} />
        </section>
      ) : null}

      {split.discussed.length > 0 ? (
        <section className={s.section} aria-labelledby="discussed-title" data-split="discussed">
          <h2 id="discussed-title" className={s.sectionTitle}>
            {bt("entity.person.discussed")}
          </h2>
          <p className={s.muted}>{bt("entity.person.discussed.lead", { name })}</p>
          <ShiurRows rows={byYear(split.discussed)} ui={ui} read={read} label={bt("entity.person.discussed")} />
        </section>
      ) : null}
    </>
  );
}
