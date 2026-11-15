/**
 * `/:ui/maasios` (concept-live-corpus C.4): the library of merged stories from `stories-index.json`,
 * which has no retellings. Facets: by merged person (`?p=`), by topic through the layer's section join
 * (`?topic=`, labels from the small topic tree `topics.json`), and "told more than once" (`?many=1`).
 * The audio-language setting keeps stories with a telling in that language.
 *
 * Each card plays one telling; stories-only mode queues one telling per listed story, skipping the
 * stories heard in this visit, and never two tellings of one story back to back. Nothing here fetches
 * a story file or a shiur file until the listener opens a telling.
 */
import { formatNumber, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useMemo, useState, type JSX } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { CorpusLabel } from "../../components/CorpusLabel.tsx";
import { Text } from "../../components/Text.tsx";
import { loadStoriesIndex, loadTopics, topicNodes, type StoriesIndexFile, type TopicNode } from "../../data/index.ts";
import { tFor, useUi } from "../../i18n/index.ts";
import { readingLang, useSettings, type AudioFilter } from "../../shell/settings.ts";
import { useLoad } from "../today/use-data.ts";
import { clearHeard, useHeard } from "./heard.ts";
import {
  facetSearch,
  facetsFromQuery,
  filterStories,
  heardCount,
  inAudio,
  personCounts,
  storiesOnlyQueue,
  topicChains,
  topicOptions,
  type StoryFacets,
} from "./model.ts";
import { playStoriesOnly } from "./play.ts";
import { StoryCard } from "./StoryCard.tsx";
import { maasiosT } from "./strings.ts";
import { maasiosStyles as s } from "./styles.ts";

const paths = livePaths();

/** People shown as chips before "More people". */
export const TOP_PEOPLE = 12;
/** Cards per "show more" step. */
export const STEP = 30;

interface Loaded {
  index: StoriesIndexFile;
  /** The topic tree; empty when it could not be loaded (the topic facet is then left out). */
  topics: TopicNode[];
}

async function loadMaasios(): Promise<Loaded> {
  const [index, topics] = await Promise.all([loadStoriesIndex(), loadTopics().then(topicNodes, () => [])]);
  return { index, topics };
}

export function MaasiosPage(): JSX.Element {
  const ui = useUi();
  const mt = maasiosT(ui);
  const loaded = useLoad(loadMaasios, []);
  return (
    <article className={s.page} aria-busy={loaded.status === "loading"}>
      <h1 className={s.title}>{tFor(ui)("page.maasios")}</h1>
      <CorpusLabel ui={ui} reviewed={false} />
      <p className={s.lead}>{mt("lead")}</p>
      {loaded.status === "loading" ? <p className={s.muted}>{mt("loading")}</p> : null}
      {loaded.status === "error" ? (
        <p role="alert" className={s.muted}>
          {mt("error")}
        </p>
      ) : null}
      {loaded.status === "ok" ? <MaasiosBody data={loaded.data} ui={ui} /> : null}
    </article>
  );
}

function MaasiosBody({ data, ui }: { data: Loaded; ui: UiLang }): JSX.Element {
  const mt = maasiosT(ui);
  const { search } = useLocation();
  const read = readingLang({ read: useSettings((x) => x.read) }, ui);
  const audio = useSettings((x) => x.audio);
  const facets = facetsFromQuery(search);
  const rows = data.index.stories;
  const chains = useMemo(() => topicChains(data.topics), [data.topics]);
  const inLang = useMemo(() => rows.filter((r) => inAudio(r, audio)), [rows, audio]);
  const shown = useMemo(() => filterStories(rows, { ...facets, audio }, chains), [rows, facets.person, facets.topic, facets.many, audio, chains]);
  const [step, setStep] = useState(STEP);

  return (
    <>
      <PeopleFacet data={data} rows={inLang} facets={facets} ui={ui} />
      <TopicFacet data={data} rows={inLang} facets={facets} ui={ui} />
      <p className={s.buttons}>
        <Link
          className={s.chip}
          to={{ search: facetSearch(search, { many: !facets.many }) }}
          aria-current={facets.many ? "true" : undefined}
          data-facet="many"
          replace
        >
          {mt("facet.many")}
        </Link>
      </p>

      <p className={s.meta} role="status">
        {mt("count", { shown: shown.length, total: inLang.length })}
      </p>

      <StoriesOnly rows={shown} audio={audio} ui={ui} />

      {shown.length === 0 ? (
        <p className={s.muted}>{mt("none")}</p>
      ) : (
        <>
          <ol className={s.list} aria-label={tFor(ui)("page.maasios")}>
            {shown.slice(0, step).map((row) => (
              <StoryCard key={row.id} row={row} people={data.index.people} ui={ui} read={read} audio={audio} skipPerson={facets.person} />
            ))}
          </ol>
          {shown.length > step ? (
            <button type="button" className={s.button} onClick={() => setStep((n) => n + STEP)}>
              {mt("more", { count: shown.length - step })}
            </button>
          ) : null}
        </>
      )}
    </>
  );
}

function PeopleFacet({
  data,
  rows,
  facets,
  ui,
}: {
  data: Loaded;
  rows: StoriesIndexFile["stories"];
  facets: StoryFacets;
  ui: UiLang;
}): JSX.Element | null {
  const mt = maasiosT(ui);
  const { search } = useLocation();
  const [all, setAll] = useState(false);
  const counts = useMemo(() => personCounts(rows).filter((p) => data.index.people[p.id]), [rows, data.index.people]);
  if (counts.length === 0) return null;
  const chips = all ? counts : counts.slice(0, TOP_PEOPLE);
  const selected = facets.person !== null && !chips.some((p) => p.id === facets.person) ? counts.find((p) => p.id === facets.person) : undefined;
  const label = facets.person !== null ? data.index.people[facets.person] : undefined;
  return (
    <nav className={s.section} aria-labelledby="maasios-people">
      <h2 id="maasios-people" className={s.groupTitle}>
        {mt("facet.people")}
      </h2>
      <ul className={s.chips}>
        <li>
          <Link className={s.chip} to={{ search: facetSearch(search, { person: null }) }} aria-current={facets.person === null ? "true" : undefined} replace>
            {mt("facet.people.all")}
          </Link>
        </li>
        {[...chips, ...(selected ? [selected] : [])].map((p) => (
          <li key={p.id}>
            <Link
              className={s.chip}
              to={{ search: facetSearch(search, { person: p.id }) }}
              aria-current={facets.person === p.id ? "true" : undefined}
              data-person={p.id}
              replace
            >
              <Text value={data.index.people[p.id]![ui]} lang={ui} />
              <span className={s.status}>{formatNumber(p.count, ui)}</span>
            </Link>
          </li>
        ))}
        {!all && counts.length > TOP_PEOPLE ? (
          <li>
            <button type="button" className={s.button} onClick={() => setAll(true)}>
              {mt("facet.people.more")}
            </button>
          </li>
        ) : null}
      </ul>
      {facets.person !== null && label ? (
        <p className={s.muted}>
          <Link to={paths.person(ui, facets.person)} data-entity={`p:${facets.person}`}>
            <Text value={label[ui]} lang={ui} />
          </Link>
        </p>
      ) : null}
    </nav>
  );
}

function TopicFacet({
  data,
  rows,
  facets,
  ui,
}: {
  data: Loaded;
  rows: StoriesIndexFile["stories"];
  facets: StoryFacets;
  ui: UiLang;
}): JSX.Element | null {
  const mt = maasiosT(ui);
  const { search } = useLocation();
  const navigate = useNavigate();
  const options = useMemo(() => topicOptions(rows, data.topics), [rows, data.topics]);
  const labels = useMemo(() => new Map(data.topics.map((n) => [n.id, n.label])), [data.topics]);
  if (options.length === 0) return null;
  const selectedMissing = facets.topic !== null && !options.some((o) => o.id === facets.topic) && labels.has(facets.topic);
  return (
    <div className={s.field}>
      <label htmlFor="maasios-topic" className={s.groupTitle}>
        {mt("facet.topic")}
      </label>
      <select
        id="maasios-topic"
        className={s.select}
        value={facets.topic ?? ""}
        data-facet="topic"
        onChange={(e) => {
          const v = e.currentTarget.value;
          void navigate({ search: facetSearch(search, { topic: v === "" ? null : v }) }, { replace: true });
        }}
      >
        <option value="">{mt("facet.topic.all")}</option>
        {selectedMissing ? <option value={facets.topic!}>{labels.get(facets.topic!)![ui]}</option> : null}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {`${"  ".repeat(o.level - 1)}${labels.get(o.id)?.[ui] ?? o.id} (${formatNumber(o.count, ui)})`}
          </option>
        ))}
      </select>
    </div>
  );
}

type OnlyStatus = { kind: "idle" } | { kind: "playing"; count: number } | { kind: "failed" };

function StoriesOnly({ rows, audio, ui }: { rows: StoriesIndexFile["stories"]; audio: AudioFilter; ui: UiLang }): JSX.Element | null {
  const mt = maasiosT(ui);
  const heard = useHeard();
  const [status, setStatus] = useState<OnlyStatus>({ kind: "idle" });
  const items = useMemo(() => storiesOnlyQueue(rows, audio, heard), [rows, audio, heard]);
  const skipped = heardCount(rows, heard);
  if (items.length === 0 && skipped === 0) return null;
  return (
    <section className={s.section} aria-labelledby="maasios-only">
      <h2 id="maasios-only" className={s.groupTitle}>
        {mt("only.title")}
      </h2>
      <p className={s.muted}>{mt("only.lead")}</p>
      <div className={s.buttons}>
        <button
          type="button"
          className={`${s.button} ${s.primary}`}
          data-action="stories-only"
          disabled={items.length === 0}
          onClick={() => {
            playStoriesOnly(items).then(
              (count) => setStatus({ kind: "playing", count }),
              () => setStatus({ kind: "failed" }),
            );
          }}
        >
          {mt("only.play", { count: items.length })}
        </button>
        <span className={s.status}>{mt("only.replaces")}</span>
      </div>
      {skipped > 0 ? (
        <p className={s.status} data-testid="heard-skipped">
          {mt("only.skipped", { count: skipped })}{" "}
          <button type="button" className={s.button} onClick={clearHeard} data-action="heard-reset">
            {mt("only.reset")}
          </button>
        </p>
      ) : null}
      <p className={s.status} role="status">
        {status.kind === "playing" ? mt("only.playing", { count: status.count }) : status.kind === "failed" ? mt("only.failed") : ""}
      </p>
    </section>
  );
}
