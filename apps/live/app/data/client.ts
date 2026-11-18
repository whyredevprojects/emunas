/**
 * Typed fetch helpers for `/data/*`, meant to be called from route `clientLoader`s:
 *
 * ```ts
 * export async function clientLoader({ params }: Route.ClientLoaderArgs) {
 *   return { shiur: await loadShiur(params.shiurId) };
 * }
 * ```
 *
 * - One in-flight request per path; small shared files (`build`, `corpus`, `facets`, `today.<lang>`, `works`,
 *   `topics`, `stories-index`, glossary shards, `explore/entities`) are
 *   memoized for the session, per-item files are not (the HTTP cache handles those:
 *   `/data/*` is `max-age=300, stale-while-revalidate`).
 * - A 404 becomes a `DataError` with `status: 404`; `notFoundToNull` turns it into `null` for pages that
 *   render "not found" themselves.
 * - The fetch implementation and base URL are configurable (`configureData`) so tests and the dev
 *   fixture mode (`VITE_LIVE_DATA=fixtures`) can serve files without a network.
 */
import type { UiLang } from "@emunas/i18n";
import { dataPaths } from "./paths.ts";
import {
  LIVE_DATA_SCHEMA_VERSION,
  type BuildFile,
  type CorpusFile,
  type EntityFile,
  type EntityKind,
  type ExploreEntitiesFile,
  type GlossaryShardFile,
  type StoriesIndexFile,
  type StoryFile,
  type ThreadFile,
  type TopicFile,
  type TopicMomentsFile,
  type TopicShiurimFile,
  type TopicsFile,
  type FacetsFile,
  type MomentShardFile,
  type QuickIndexFile,
  type SeriesFile,
  type ShiurFile,
  type TodayFile,
  type WorkFile,
  type WorksFile,
  type WriteupFile,
} from "./types.ts";

export type DataFetch = (input: string, init?: { signal?: AbortSignal | null }) => Promise<Response>;

export interface DataConfig {
  /** Origin or prefix prepended to `/data/...` (empty = same origin). */
  base: string;
  fetch: DataFetch;
}

export class DataError extends Error {
  override name = "DataError";
  constructor(
    readonly path: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Dev only: `VITE_LIVE_DATA=fixtures npm run dev` serves the committed fixtures instead of
 * `public/data/`. Vite replaces both conditions at build time, so production drops this branch and the
 * fixture chunks entirely.
 */
export const FIXTURE_MODE: boolean = import.meta.env.DEV && import.meta.env["VITE_LIVE_DATA"] === "fixtures";

const defaultFetch: DataFetch = FIXTURE_MODE
  ? async (input, init) => (await import("./fixtures/fetch.ts")).fixtureFetch(input, init)
  : (input, init) => globalThis.fetch(input, init ?? undefined);

let config: DataConfig = { base: "", fetch: defaultFetch };
const memo = new Map<string, Promise<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/** Replaces the fetch implementation and/or base. Clears all caches. */
export function configureData(next: Partial<DataConfig>): void {
  config = { ...config, ...next };
  clearDataCache();
}

export function resetDataConfig(): void {
  configureData({ base: "", fetch: defaultFetch });
}

export function clearDataCache(): void {
  memo.clear();
  inflight.clear();
}

export interface LoadOptions {
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: LoadOptions): Promise<T> {
  let res: Response;
  try {
    res = await config.fetch(`${config.base}${path}`, { signal: opts.signal ?? null });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new DataError(path, 0, `network error loading ${path}: ${String(e)}`);
  }
  if (!res.ok) throw new DataError(path, res.status, `HTTP ${res.status} loading ${path}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch (e) {
    throw new DataError(path, res.status, `invalid JSON in ${path}: ${String(e)}`);
  }
  checkSchema(path, body);
  return body as T;
}

/** Every data file carries `schemaVersion`; a mismatch means the client and the deployed data disagree. */
function checkSchema(path: string, body: unknown): void {
  const v = typeof body === "object" && body !== null ? (body as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (v !== LIVE_DATA_SCHEMA_VERSION) {
    throw new DataError(path, 200, `${path}: schemaVersion ${String(v)}, expected ${LIVE_DATA_SCHEMA_VERSION}`);
  }
}

/** Fetches and parses one data file. Concurrent calls for the same path share one request. */
export function fetchData<T>(path: string, opts: LoadOptions = {}): Promise<T> {
  // Aborting one caller must not cancel a request others share: only unshared calls pass the signal.
  if (opts.signal) return request<T>(path, opts);
  const existing = inflight.get(path);
  if (existing) return existing as Promise<T>;
  const p = request<T>(path, {}).finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}

function memoized<T>(path: string, opts: LoadOptions): Promise<T> {
  if (opts.signal) return fetchData<T>(path, opts);
  const hit = memo.get(path);
  if (hit) return hit as Promise<T>;
  const p = fetchData<T>(path).catch((e: unknown) => {
    memo.delete(path); // do not cache failures
    throw e;
  });
  memo.set(path, p);
  return p;
}

export const loadBuild = (o: LoadOptions = {}) => memoized<BuildFile>(dataPaths.build(), o);
export const loadCorpus = (o: LoadOptions = {}) => memoized<CorpusFile>(dataPaths.corpus(), o);
export const loadFacets = (o: LoadOptions = {}) => memoized<FacetsFile>(dataPaths.facets(), o);
/** Today's file for readers of `lang` (the reading language); a language switch loads the other file. */
export const loadToday = (lang: UiLang, o: LoadOptions = {}) => memoized<TodayFile>(dataPaths.today(lang), o);
export const loadWorks = (o: LoadOptions = {}) => memoized<WorksFile>(dataPaths.works(), o);
export const loadShiur = (id: string, o: LoadOptions = {}) => fetchData<ShiurFile>(dataPaths.shiur(id), o);
export const loadWriteup = (id: string, lang: UiLang, o: LoadOptions = {}) =>
  fetchData<WriteupFile>(dataPaths.writeup(id, lang), o);
export const loadSeries = (id: string, o: LoadOptions = {}) => fetchData<SeriesFile>(dataPaths.series(id), o);
export const loadWork = (key: string, o: LoadOptions = {}) => fetchData<WorkFile>(dataPaths.work(key), o);
export const loadEntity = (kind: EntityKind, key: string, o: LoadOptions = {}) =>
  fetchData<EntityFile>(dataPaths.entity(kind, key), o);
export const loadMomentShard = (lang: UiLang, shard: number, o: LoadOptions = {}) =>
  fetchData<MomentShardFile>(dataPaths.moments(lang, shard), o);
export const loadQuickIndex = (lang: UiLang, o: LoadOptions = {}) =>
  fetchData<QuickIndexFile>(dataPaths.quickIndex(lang), o);

// Corpus layer (C1.7). None of these is needed for the first paint of Today or a shiur (plan §4).
export const loadTopics = (o: LoadOptions = {}) => memoized<TopicsFile>(dataPaths.topics(), o);
export const loadTopic = (id: string, o: LoadOptions = {}) => fetchData<TopicFile>(dataPaths.topic(id), o);
export const loadTopicMoments = (id: string, page: number, o: LoadOptions = {}) =>
  fetchData<TopicMomentsFile>(dataPaths.topicMoments(id, page), o);
export const loadTopicShiurim = (id: string, page: number, o: LoadOptions = {}) =>
  fetchData<TopicShiurimFile>(dataPaths.topicShiurim(id, page), o);
export const loadThread = (id: string, o: LoadOptions = {}) => fetchData<ThreadFile>(dataPaths.thread(id), o);
export const loadStory = (id: string, o: LoadOptions = {}) => fetchData<StoryFile>(dataPaths.story(id), o);
export const loadStoriesIndex = (o: LoadOptions = {}) => memoized<StoriesIndexFile>(dataPaths.storiesIndex(), o);
export const loadGlossaryShard = (shard: string, o: LoadOptions = {}) =>
  memoized<GlossaryShardFile>(dataPaths.glossary(shard), o);
export const loadExploreEntities = (o: LoadOptions = {}) =>
  memoized<ExploreEntitiesFile>(dataPaths.exploreEntities(), o);

/** `null` for a 404, the value otherwise; other errors propagate. */
export async function notFoundToNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof DataError && e.status === 404) return null;
    throw e;
  }
}
