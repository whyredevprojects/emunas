/**
 * `/:ui/explore` (concept-live §5.2, tech-live §4.3; concept-live-corpus C.2, D, G): Explore opens on
 * the topic map (`TopicMap.tsx`, from `topics.json`). One tap behind it are the facet column, a
 * result list (shiurim or moments) and three alternate lenses over the same result set. All state is
 * in the URL (`url.ts`); the shiur-language facet is the shell's audio filter. Facet counts come from
 * the facet worker (`facet-client.ts`).
 *
 * Loading (plan §4): opening Explore loads the topic tree and Explore's entity file
 * (`explore/entities.json`: merged topic, person, concept and sefer ids per shiur); `corpus.json` and
 * `facets.json` load when the facet view opens.
 */
import type { Ed } from "@emunas/corpus/public";
import { formatNumber, type UiLang } from "@emunas/i18n";
import { useEffect, useId, useMemo, useState, type JSX } from "react";
import { Link, useSearchParams } from "react-router";
import { tFor, useUi } from "../../i18n/index.ts";
import { readingLang, settingsStore, useSettings } from "../../shell/settings.ts";
import { useLoad } from "../today/use-data.ts";
import { Connections } from "./Connections.tsx";
import { createFacetService, type FacetService, type TimedResult } from "./facet-client.ts";
import { FacetPanel } from "./FacetPanel.tsx";
import { valueLabel } from "./labels.ts";
import { droppedConcepts, exploreRows, type ExploreRow } from "./entities.ts";
import { loadCorpus, loadExploreEntities, loadFacets, loadTopics, topicNodes, type MomentKind } from "./live-data.ts";
import { Luach } from "./Luach.tsx";
import { TopicMap } from "./TopicMap.tsx";
import type { ExploreFilters } from "./model.ts";
import { filterMoments, useMomentStream } from "./moments.ts";
import { countLabel, MomentList, ShiurList } from "./ResultList.tsx";
import { exploreT, type ExploreKey } from "./strings.ts";
import { exploreStyles as s } from "./styles.ts";
import {
  DEFAULT_STATE,
  exploreToQuery,
  LENSES,
  MOMENT_KINDS,
  parseExploreQuery,
  SORTS,
  UNITS,
  withSet,
  type ConnectionsCenter,
  type ExploreState,
} from "./url.ts";
import { Years } from "./Years.tsx";

/** Shiurim by first year, undated last; ties keep corpus order. */
export function sortByYear<R extends Pick<ExploreRow, "years">>(rows: readonly R[]): R[] {
  const first = (r: R) => (r.years.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...r.years));
  return rows
    .map((r, i) => ({ r, i, y: first(r) }))
    .sort((a, b) => a.y - b.y || a.i - b.i)
    .map((x) => x.r);
}

export function ExplorePage(): JSX.Element {
  const ui = useUi();
  const et = exploreT(ui);
  const [params, setParams] = useSearchParams();
  const audio = useSettings((st) => st.audio);
  const read = useSettings((st) => readingLang(st, ui));
  const parsed = useMemo(() => parseExploreQuery(params), [params]);
  // The language facet is the shell's audio filter, which may come from the store rather than the URL.
  const state: ExploreState = useMemo(
    () => ({ ...parsed, filters: withSet(parsed.filters, "lang", audio === "both" ? [] : [audio]) }),
    [parsed, audio],
  );
  const filtersKey = JSON.stringify(state.filters);

  const browse = state.view === "browse";
  // Opening Explore: the topic tree and Explore's entity file (neither blocks the other's view).
  const treeLoad = useLoad(() => loadTopics().then(topicNodes), []);
  const tree = treeLoad.status === "ok" ? treeLoad.data : null;
  const entitiesLoad = useLoad(() => loadExploreEntities().catch(() => null), []);
  // The facet view: corpus rows and facet labels, once it is opened.
  const [wantRows, setWantRows] = useState(browse);
  useEffect(() => {
    if (browse) setWantRows(true);
  }, [browse]);
  const data = useLoad(() => (wantRows ? Promise.all([loadCorpus(), loadFacets()]) : new Promise<never>(() => {})), [wantRows]);
  const facets = data.status === "ok" ? data.data[1] : null;
  const entityFile = entitiesLoad.status === "ok" ? entitiesLoad.data : null;
  const rows: ExploreRow[] | null = useMemo(
    () =>
      data.status === "ok" && entitiesLoad.status !== "loading" && treeLoad.status !== "loading"
        ? exploreRows(data.data[0].shiurim, entityFile, tree ?? [], data.data[1])
        : null,
    [data, entitiesLoad.status, entityFile, treeLoad.status, tree],
  );
  const dropped = useMemo(() => (rows ? droppedConcepts(rows) : new Set<string>()), [rows]);

  const [service, setService] = useState<FacetService | null>(null);
  useEffect(() => {
    if (!rows) return;
    const svc = createFacetService(rows);
    setService(svc);
    return () => {
      svc.dispose();
      setService(null);
    };
  }, [rows]);

  const [result, setResult] = useState<TimedResult | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!service) return;
    let live = true;
    service.query(state.filters).then(
      (r) => {
        if (live) {
          setResult(r);
          setFailed(false);
        }
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
    // filtersKey stands for state.filters (a new object on every render)
  }, [service, filtersKey]);

  const go = (next: ExploreState) => {
    const lang = next.filters.sets.lang ?? [];
    const nextAudio = lang.length === 1 ? (lang[0] as Ed) : "both";
    if (nextAudio !== audio) settingsStore.getState().setAudio(nextAudio);
    setParams((prev) => exploreToQuery(next, prev), { preventScrollReset: true });
  };
  const setFilters = (filters: ExploreFilters) => go({ ...state, filters });
  const hrefFor = (patch: Partial<ExploreState>) => `?${exploreToQuery({ ...state, ...patch }, params).toString()}`;
  // Back to the map: every Explore setting dropped except the shell's audio filter.
  const mapHref = `?${exploreToQuery({ ...DEFAULT_STATE, filters: withSet(DEFAULT_STATE.filters, "lang", state.filters.sets.lang ?? []) }, params).toString()}`;

  const matched: ExploreRow[] = useMemo(() => {
    if (!rows || !result) return [];
    return Array.from(result.matches, (i) => rows[i]!).filter(Boolean);
  }, [rows, result]);
  const rowsById = useMemo(() => new Map((rows ?? []).map((r) => [r.id, r])), [rows]);
  const singleOccasion = state.lens === "luach" && state.filters.sets.occasion?.length === 1 ? state.filters.sets.occasion[0]! : null;
  const ordered = useMemo(
    () => (state.sort === "year" || state.lens === "luach" ? sortByYear(matched) : matched),
    [matched, state.sort, state.lens],
  );

  const momentsOn = state.unit === "moments" && (state.lens === "list" || state.lens === "years");
  const stream = useMomentStream(read, momentsOn);
  const moments = useMemo(() => {
    if (!momentsOn || !result) return [];
    return filterMoments(stream.moments, new Set(matched.map((r) => r.id)), state.kinds);
  }, [momentsOn, result, stream.moments, matched, state.kinds]);

  const total = rows?.length ?? 0;
  const shownCount = momentsOn ? moments.length : matched.length;
  const status = result
    ? `${countLabel(ui, momentsOn ? "moments" : "shiurim", shownCount)}${momentsOn ? "" : ` ${et("explore.results.of", { total: formatNumber(total, ui) })}`}`
    : "";

  if (!browse) {
    return (
      <article className={s.page} aria-busy={treeLoad.status === "loading"}>
        <h1 className={s.title}>{tFor(ui)("page.explore")}</h1>
        <p className={s.lead}>{tFor(ui)("page.explore.lead")}</p>
        {treeLoad.status === "error" ? (
          <p role="alert" className={s.muted}>
            {et("explore.map.error")}
          </p>
        ) : null}
        {treeLoad.status === "loading" ? <p className={s.muted}>{et("explore.loading")}</p> : null}
        {tree ? (
          <TopicMap
            tree={tree}
            ui={ui}
            browseHref={hrefFor({ view: "browse" })}
            filterHref={(id) => hrefFor({ view: "browse", filters: withSet(state.filters, "topic", [id]) })}
          />
        ) : null}
        {treeLoad.status === "error" ? (
          <p>
            <Link className={s.pill} to={hrefFor({ view: "browse" })} data-testid="explore-browse">
              {et("explore.map.browse")}
            </Link>
          </p>
        ) : null}
      </article>
    );
  }

  return (
    <article className={s.page} aria-busy={data.status === "loading" || (rows !== null && result === null)}>
      <h1 className={s.title}>{tFor(ui)("page.explore")}</h1>
      <p className={s.lead}>{tFor(ui)("page.explore.lead")}</p>
      <p>
        <Link className={s.textButton} to={mapHref} data-testid="explore-map-link" preventScrollReset>
          {et("explore.map.back")}
        </Link>
      </p>
      {data.status === "error" || failed ? (
        <p role="alert" className={s.muted}>
          {et("explore.error")}
        </p>
      ) : data.status === "loading" || !facets || !rows ? (
        <p className={s.muted}>{et("explore.loading")}</p>
      ) : (
        <div className={s.layout}>
          <FacetPanel
            filters={state.filters}
            counts={result?.counts ?? null}
            facets={facets}
            ui={ui}
            onChange={setFilters}
            topics={tree ?? []}
            hidden={{ concept: dropped }}
          />
          <section className={s.results} aria-label={et("explore.view")}>
            <Controls
              state={state}
              ui={ui}
              hrefFor={hrefFor}
              momentsAvailable={state.lens === "list" || state.lens === "years"}
              onKinds={(kinds) => go({ ...state, kinds })}
            />
            <p role="status" className={s.status} data-testid="explore-status" data-total={result?.total ?? ""} data-ms={result ? result.ms.toFixed(2) : ""}>
              {status}
            </p>
            {result && state.lens === "luach" ? (
              <Luach
                counts={result.counts.occasion}
                facets={facets}
                ui={ui}
                selected={state.filters.sets.occasion ?? []}
                onChoose={(key) => {
                  const cur = state.filters.sets.occasion ?? [];
                  setFilters(withSet(state.filters, "occasion", cur.length === 1 && cur[0] === key ? [] : [key]));
                }}
              />
            ) : null}
            {result && state.lens === "years" ? (
              <Years counts={result.counts.year} ui={ui} year={state.filters.year} onYear={(year) => setFilters({ ...state.filters, year })} />
            ) : null}
            {state.lens === "connections" ? (
              <Connections
                center={state.center}
                rows={rows}
                facets={facets}
                counts={result?.counts ?? null}
                selected={{
                  p: state.filters.sets.person ?? [],
                  c: state.filters.sets.concept ?? [],
                  o: state.filters.sets.occasion ?? [],
                }}
                ui={ui}
                centerHref={(center: ConnectionsCenter) => hrefFor({ center })}
              />
            ) : null}
            {result && state.lens !== "connections" ? (
              <>
                {singleOccasion ? (
                  <h2 className={s.lensTitle}>
                    {et("explore.luach.stack", { name: valueLabel("occasion", singleOccasion, facets, ui).text })}
                  </h2>
                ) : null}
                {shownCount === 0 && (!momentsOn || stream.done) ? <p className={s.muted}>{et("explore.noResults")}</p> : null}
                {momentsOn ? (
                  <>
                    <p className={s.muted}>{et("explore.moments.lead")}</p>
                    {!stream.done && stream.totalShards !== null ? (
                      <p className={s.muted} data-testid="moments-progress">
                        {et("explore.moments.loading", { loaded: stream.loadedShards, total: stream.totalShards })}
                      </p>
                    ) : null}
                    {stream.error ? (
                      <p role="alert" className={s.muted}>
                        {et("explore.moments.error")}
                      </p>
                    ) : null}
                    <MomentList moments={moments} rowsById={rowsById} ui={ui} lang={read} label={status} />
                  </>
                ) : (
                  <ShiurList rows={ordered} ui={ui} read={read} label={status} />
                )}
              </>
            ) : null}
          </section>
        </div>
      )}
    </article>
  );
}

function Controls({
  state,
  ui,
  hrefFor,
  momentsAvailable,
  onKinds,
}: {
  state: ExploreState;
  ui: UiLang;
  hrefFor(patch: Partial<ExploreState>): string;
  momentsAvailable: boolean;
  onKinds(kinds: readonly MomentKind[]): void;
}): JSX.Element {
  const et = exploreT(ui);
  const lensId = useId();
  const unitId = useId();
  const sortId = useId();
  const kindsId = useId();
  const toggleKind = (k: MomentKind): readonly MomentKind[] => {
    const cur = state.kinds.length === 0 ? MOMENT_KINDS : state.kinds;
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    return next.length === 0 || next.length === MOMENT_KINDS.length ? [] : next;
  };
  const kindOn = (k: MomentKind) => state.kinds.length === 0 || state.kinds.includes(k);
  return (
    <div className={s.controls}>
      <nav aria-labelledby={lensId} className={s.controlRow}>
        <span id={lensId} className={s.controlLabel}>
          {et("explore.lens")}
        </span>
        {LENSES.map((lens) => (
          <Link key={lens} className={s.pill} to={hrefFor({ lens })} aria-current={state.lens === lens ? "true" : undefined} data-lens-link={lens} preventScrollReset>
            {et(`explore.lens.${lens}` as ExploreKey)}
          </Link>
        ))}
      </nav>
      {momentsAvailable ? (
        <nav aria-labelledby={unitId} className={s.controlRow}>
          <span id={unitId} className={s.controlLabel}>
            {et("explore.unit")}
          </span>
          {UNITS.map((unit) => (
            <Link key={unit} className={s.pill} to={hrefFor({ unit })} aria-current={state.unit === unit ? "true" : undefined} data-unit-link={unit} preventScrollReset>
              {et(`explore.unit.${unit}` as ExploreKey)}
            </Link>
          ))}
        </nav>
      ) : null}
      {state.lens === "list" && state.unit === "shiurim" ? (
        <nav aria-labelledby={sortId} className={s.controlRow}>
          <span id={sortId} className={s.controlLabel}>
            {et("explore.sort")}
          </span>
          {SORTS.map((sort) => (
            <Link key={sort} className={s.pill} to={hrefFor({ sort })} aria-current={state.sort === sort ? "true" : undefined} preventScrollReset>
              {et(`explore.sort.${sort}` as ExploreKey)}
            </Link>
          ))}
        </nav>
      ) : null}
      {momentsAvailable && state.unit === "moments" ? (
        <div role="group" aria-labelledby={kindsId} className={s.controlRow}>
          <span id={kindsId} className={s.controlLabel}>
            {et("explore.kinds")}
          </span>
          {MOMENT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={s.pill}
              aria-pressed={kindOn(k)}
              data-kind-button={k}
              onClick={() => onKinds(toggleKind(k))}
            >
              {et(`explore.kind.${k}` as ExploreKey)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
