/**
 * `/:ui/maasios` (concept-live §5.5): the stories as their own library. Faceted by person (`?p=`),
 * filtered by the audio-language setting, each story playable from its start, and a "stories only"
 * mode that queues the listed stories back to back (each plays from its start to its end, then the
 * next, across shiurim).
 *
 * Retellings are in each shiur's file, not in `stories.json`; the listening room shows them. Likely
 * retellings of the same story are not grouped yet (pipeline P9).
 */
import { formatNumber, type UiLang } from "@emunas/i18n";
import { useMemo, useState, type JSX } from "react";
import { Link, useLocation } from "react-router";
import { tFor, useUi } from "../../i18n/index.ts";
import { readingLang, useSettings } from "../../shell/settings.ts";
import { useLoad } from "../today/use-data.ts";
import { AiNote, EntityName, LoadState, QueueActions } from "../entities/common.tsx";
import { loadCorpus, loadFacets, loadStories, type CorpusFile, type StoryRow } from "../entities/live-data.ts";
import { queueItems, rowsById } from "../entities/model.ts";
import { createResolver, type EntityResolver } from "../entities/resolve.ts";
import { browseT } from "../entities/strings.ts";
import { browseStyles as s } from "../entities/styles.ts";
import { filterStories, personFromQuery, personSearch, playableStories, storyPeople } from "./model.ts";
import { StoryList } from "./StoryList.tsx";

interface Loaded {
  stories: readonly StoryRow[];
  corpus: CorpusFile;
  resolver: EntityResolver;
}

async function loadMaasios(): Promise<Loaded> {
  const [stories, corpus, facets] = await Promise.all([loadStories(), loadCorpus(), loadFacets()]);
  return { stories: stories.stories, corpus, resolver: createResolver(facets) };
}

/** People shown as chips before "More people". */
export const TOP_PEOPLE = 12;

export function MaasiosPage(): JSX.Element {
  const ui = useUi();
  const bt = browseT(ui);
  const loaded = useLoad(loadMaasios, []);
  return (
    <article className={s.page} aria-busy={loaded.status === "loading"}>
      <h1 className={s.title}>{tFor(ui)("page.maasios")}</h1>
      <p className={s.lead}>{bt("maasios.lead")}</p>
      <LoadState load={loaded} ui={ui} />
      {loaded.status === "ok" ? <MaasiosBody data={loaded.data} ui={ui} /> : null}
    </article>
  );
}

function MaasiosBody({ data, ui }: { data: Loaded; ui: UiLang }): JSX.Element {
  const bt = browseT(ui);
  const { search } = useLocation();
  const read = readingLang({ read: useSettings((x) => x.read) }, ui);
  const audio = useSettings((x) => x.audio);
  const person = personFromQuery(search);
  const [allPeople, setAllPeople] = useState(false);

  const inLang = useMemo(() => filterStories(data.stories, { person: null, audio }), [data.stories, audio]);
  const people = useMemo(() => storyPeople(inLang), [inLang]);
  const shown = useMemo(() => filterStories(inLang, { person, audio: "both" }), [inLang, person]);
  const rows = rowsById(data.corpus);
  const chips = allPeople ? people : people.slice(0, TOP_PEOPLE);
  // The selected person stays visible even when outside the top list.
  const selected = person !== null && !chips.some((p) => p.key === person) ? people.find((p) => p.key === person) : undefined;

  return (
    <>
      <nav className={s.section} aria-label={bt("maasios.people")}>
        <h2 className={s.groupTitle}>{bt("maasios.people")}</h2>
        <ul className={s.chips}>
          <li>
            <Link className={s.chip} to={{ search: personSearch(search, null) }} aria-current={person === null ? "true" : undefined} replace>
              {bt("maasios.people.all")}
            </Link>
          </li>
          {[...chips, ...(selected ? [selected] : [])].map((p) => {
            const label = data.resolver.label("p", p.key);
            return (
              <li key={p.key}>
                <Link
                  className={s.chip}
                  to={{ search: personSearch(search, p.key) }}
                  aria-current={person === p.key ? "true" : undefined}
                  data-person={p.key}
                  replace
                >
                  {label ? <EntityName label={label} kind="p" ui={ui} /> : <bdi>{p.key}</bdi>}
                  <span className={s.momentKind}>{formatNumber(p.count, ui)}</span>
                </Link>
              </li>
            );
          })}
          {!allPeople && people.length > TOP_PEOPLE ? (
            <li>
              <button type="button" className={s.button} onClick={() => setAllPeople(true)}>
                {bt("maasios.people.more")}
              </button>
            </li>
          ) : null}
        </ul>
        {person !== null ? <PersonPageLink person={person} resolver={data.resolver} ui={ui} /> : null}
      </nav>

      <p className={s.meta} role="status">
        {bt("maasios.count", { shown: shown.length, total: inLang.length })}
      </p>

      <section className={s.section} aria-labelledby="stories-only-title">
        <h2 id="stories-only-title" className={s.groupTitle}>
          {bt("maasios.storiesOnly")}
        </h2>
        <QueueActions items={queueItems(playableStories(shown))} ui={ui} lead={bt("maasios.storiesOnly.lead")} />
      </section>

      {shown.length === 0 ? (
        <p className={s.muted}>{bt("maasios.none")}</p>
      ) : (
        <StoryList
          key={`${person ?? ""}|${audio}`}
          stories={shown}
          rows={rows}
          resolver={data.resolver}
          ui={ui}
          read={read}
          label={tFor(ui)("page.maasios")}
          {...(person !== null ? { skipPerson: person } : {})}
        />
      )}
      <AiNote ui={ui} />
    </>
  );
}

function PersonPageLink({ person, resolver, ui }: { person: string; resolver: EntityResolver; ui: UiLang }): JSX.Element | null {
  const href = resolver.href(ui, "p", person);
  const label = resolver.label("p", person);
  if (!href || !label) return null;
  return (
    <p className={s.muted}>
      <Link to={href} data-entity={`p:${person}`}>
        <EntityName label={label} kind="p" ui={ui} />
      </Link>
    </p>
  );
}
