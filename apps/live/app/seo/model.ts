/**
 * The slice of `.corpus/` that prerendering and SEO need (W4.5), and the pure functions over it:
 * the prerender route list, the `@emunas/links` lookups, and per-page title/description.
 *
 * Text comes only from the catalog (titles, section names, years) and the derived AI data
 * (`oneLiner`, entity names); integration-plan §0. Browser-safe: the Node reader is
 * `corpus.server.ts`.
 */
import type { Ed, L } from "@emunas/corpus/public";
import { formatHebrewYears, type UiLang } from "@emunas/i18n";
import type { CorpusKind, EntityKind, LinkData, OccasionKind, Site } from "@emunas/links";
import { tFor } from "../i18n/index.ts";
import { classifyLivePath, normalizeLivePath, type LivePageKind } from "./policy.ts";
import { seoStrings } from "./strings.ts";

export interface SeoShiur {
  id: string;
  lang: Ed;
  titleOriginal: string;
  subTitle: string | null;
  sectionTitle: string;
  years: number[];
  oneLiner: L | null;
}

export interface SeoLabel {
  en: string;
  yi: string;
}

export interface SeoSeries {
  id: string;
  title: L;
  count: number;
}

export interface SeoOccasion {
  key: string;
  kind: OccasionKind | null;
  label: SeoLabel;
  count: number;
}

export interface SeoEntity {
  /** Corpus id (corpus layer), or the legacy site key without a layer. */
  key: string;
  label: SeoLabel;
  /** Number of visible shiurim (layer recount; entities.json without a layer). */
  count: number;
  /** Has a Live page, which is prerendered (layer page flags, C1.7; entities.json `livePrerender` without a layer). */
  prerender: boolean;
  /** Has a Quiet page (layer page flags): else the Live page has no canonical and is noindex. */
  quietPage?: boolean;
  /** A concept merged into this topic (layer `mergedIntoTopic`). */
  topicId?: string | null;
}

export interface SeoCorpus {
  shiurim: SeoShiur[];
  series: SeoSeries[];
  occasions: SeoOccasion[];
  works: SeoEntity[];
  people: SeoEntity[];
  concepts: SeoEntity[];
  /** Corpus layer (C1.7); empty without one. */
  topics: SeoEntity[];
  stories: SeoEntity[];
  threads: SeoEntity[];
  /** True when the entity lists come from the corpus layer: their page flags are authoritative. */
  layer: boolean;
}

export const EMPTY_CORPUS: SeoCorpus = {
  shiurim: [],
  series: [],
  occasions: [],
  works: [],
  people: [],
  concepts: [],
  topics: [],
  stories: [],
  threads: [],
  layer: false,
};

/** Live entity data files exist from this many shiurim on (W3.6 `EMIT_LIMITS.entityFileMin`). */
export const OCCASION_PRERENDER_MIN = 2;

export const UIS: readonly UiLang[] = ["en", "yi"];

/** Optional filter: the emitted `/data/` file set (relative paths, e.g. `shiur/x.json`). */
export type DataFileSet = ReadonlySet<string> | null;

export interface PrerenderList {
  paths: string[];
  /** Routes left out because their data file is missing from the emitted `/data/` tree. */
  skipped: string[];
}

function seg(s: string): string {
  return encodeURIComponent(s);
}

/** Today, per UI language (prerendered even without a corpus). */
export function todayPaths(): string[] {
  // No trailing slash: React Router matches prerender paths without it (output: /en/index.html).
  return UIS.map((ui) => `/${ui}`);
}

/**
 * Every path to prerender (tech-live §1, W4.5): Today per UI, and per UI every shiur, series,
 * occasion (≥2 shiurim), work and person/concept with `livePrerender` (≥3 shiurim, no genre labels).
 * When the emitted data tree is given, a route whose page data file is missing is skipped (it would
 * prerender a "not found" page).
 *
 * `/` is deliberately not prerendered: the site Worker answers it with a redirect (C20), and without
 * it React Router writes the SPA fallback as `index.html`, the file Cloudflare's
 * `not_found_handling: "single-page-application"` serves for every path without an asset.
 */
export function prerenderPaths(corpus: SeoCorpus, dataFiles: DataFileSet = null): PrerenderList {
  const paths: string[] = [];
  const skipped: string[] = [];
  const has = (file: string) => dataFiles === null || dataFiles.has(file);
  for (const ui of UIS) {
    paths.push(`/${ui}`);
    const add = (path: string, file: string) => (has(file) ? paths.push(path) : skipped.push(path));
    for (const s of corpus.shiurim) add(`/${ui}/s/${seg(s.id)}`, `shiur/${s.id}.json`);
    for (const s of corpus.series) add(`/${ui}/series/${seg(s.id)}`, `series/${s.id}.json`);
    for (const o of corpus.occasions) {
      if (o.count >= OCCASION_PRERENDER_MIN) add(`/${ui}/o/${seg(o.key)}`, `entity/o/${o.key}.json`);
    }
    for (const w of corpus.works) if (w.prerender) add(`/${ui}/seforim/${seg(w.key)}`, `work/${w.key}.json`);
    for (const p of corpus.people) if (p.prerender) add(`/${ui}/p/${seg(p.key)}`, `entity/p/${p.key}.json`);
    for (const c of corpus.concepts) if (c.prerender) add(`/${ui}/c/${seg(c.key)}`, `entity/c/${c.key}.json`);
    // Corpus layer (C1.7): every topic, threads of ≥3 shiurim, stories told at least twice.
    for (const t of corpus.topics) if (t.prerender) add(`/${ui}/t/${seg(t.key)}`, `topic/${t.key}.json`);
    for (const t of corpus.threads) if (t.prerender) add(`/${ui}/th/${seg(t.key)}`, `thread/${t.key}.json`);
    for (const s of corpus.stories) if (s.prerender) add(`/${ui}/maasios/${seg(s.key)}`, `story/${s.key}.json`);
  }
  return { paths, skipped };
}

/** `@emunas/links` lookups (entity counts for the Quiet page thresholds, parsha vs zman). */
export function linkDataFor(corpus: SeoCorpus): LinkData {
  const counts: Record<EntityKind, Map<string, number>> = {
    work: new Map(corpus.works.map((e) => [e.key, e.count])),
    person: new Map(corpus.people.map((e) => [e.key, e.count])),
    concept: new Map(corpus.concepts.map((e) => [e.key, e.count])),
  };
  const kinds = new Map<string, OccasionKind>();
  for (const o of corpus.occasions) if (o.kind !== null) kinds.set(o.key, o.kind);
  const base: LinkData = {
    // Unknown key: 0 (no Quiet page), so the canonical falls back to the index, never a 404.
    entityCount: (entity, key) => counts[entity].get(key) ?? 0,
    occasionKind: (key) => kinds.get(key),
  };
  if (!corpus.layer) return base;
  // Corpus layer: page flags per site decide canonicals, noindex and links (plan §3.5).
  const flags = (xs: readonly SeoEntity[]) => new Map(xs.map((e) => [e.key, e]));
  const by: Record<CorpusKind, Map<string, SeoEntity>> = {
    topic: flags(corpus.topics),
    concept: flags(corpus.concepts),
    person: flags(corpus.people),
    work: flags(corpus.works),
    story: flags(corpus.stories),
    thread: flags(corpus.threads),
  };
  return {
    ...base,
    hasPage: (site: Site, kind: CorpusKind, id: string) => {
      if (kind === "thread" && site === "quiet") return false;
      const e = by[kind].get(id);
      return e ? (site === "live" ? e.prerender : e.quietPage === true) : false;
    },
    conceptTopic: (id) => by.concept.get(id)?.topicId ?? undefined,
  };
}

export interface PageText {
  kind: LivePageKind;
  title: string;
  description: string;
  /** Language of `title` when it is data in another language (a Yiddish title on the English UI). */
  titleLang: Ed | null;
  /** A corpus entry without a Quiet page: no canonical, noindex (C1.7). */
  noindex?: boolean;
}

function count(ui: UiLang, n: number): string {
  return seoStrings[ui].shiurim(n);
}

/** A finder over the corpus (built once per build; lookups are by key). */
export function createPageText(corpus: SeoCorpus): (pathname: string) => PageText | null {
  const by = <T extends { key: string }>(xs: readonly T[]) => new Map(xs.map((x) => [x.key, x]));
  const shiurim = new Map(corpus.shiurim.map((s) => [s.id, s]));
  const series = new Map(corpus.series.map((s) => [s.id, s]));
  const occasions = by(corpus.occasions);
  const works = by(corpus.works);
  const people = by(corpus.people);
  const concepts = by(corpus.concepts);
  const topics = by(corpus.topics);
  const stories = by(corpus.stories);
  const threads = by(corpus.threads);
  /** Layer entries: noindex when Quiet has no page for them. */
  const entry = (e: SeoEntity) => (corpus.layer && e.quietPage !== true ? { noindex: true } : {});

  return (pathname) => {
    const page = classifyLivePath(normalizeLivePath(pathname));
    const ui = page.ui ?? "en";
    const t = tFor(ui);
    const str = seoStrings[ui];
    const key = page.key ?? "";
    switch (page.kind) {
      case "root":
      case "today":
        return { kind: page.kind, title: t("site.name"), description: t("site.tagline"), titleLang: null };
      case "shiur": {
        const s = shiurim.get(key);
        if (!s) return null;
        const title = s.subTitle ? `${s.titleOriginal} — ${s.subTitle}` : s.titleOriginal;
        const years = s.years.length ? formatHebrewYears(s.years, ui) : null;
        const fallback = str.shiurFallback(s.lang, s.sectionTitle, years);
        const description = s.oneLiner?.[ui]?.trim() || fallback;
        return { kind: page.kind, title, description, titleLang: s.lang === ui ? null : s.lang };
      }
      case "series": {
        const s = series.get(key);
        if (!s) return null;
        const title = s.title[ui];
        return { kind: page.kind, title, description: str.series(title, count(ui, s.count)), titleLang: null };
      }
      case "occasion": {
        const o = occasions.get(key);
        if (!o) return null;
        const title = o.label[ui];
        return { kind: page.kind, title, description: str.occasion(title, count(ui, o.count)), titleLang: null };
      }
      case "work":
      case "work-chapter": {
        const w = works.get(key);
        if (!w) return null;
        const title = w.label[ui];
        return { kind: page.kind, title, description: str.work(title, count(ui, w.count)), titleLang: null, ...entry(w) };
      }
      case "person": {
        const p = people.get(key);
        if (!p) return null;
        const title = p.label[ui];
        return { kind: page.kind, title, description: str.person(title, count(ui, p.count)), titleLang: null, ...entry(p) };
      }
      case "concept": {
        const c = concepts.get(key);
        if (!c) return null;
        const title = c.label[ui];
        return { kind: page.kind, title, description: str.concept(title, count(ui, c.count)), titleLang: null, ...entry(c) };
      }
      case "topic": {
        const t = topics.get(key);
        if (!t) return null;
        const title = t.label[ui];
        return { kind: page.kind, title, description: str.topic(title, count(ui, t.count)), titleLang: null, ...entry(t) };
      }
      case "story": {
        const s = stories.get(key);
        if (!s) return null;
        const title = s.label[ui];
        return { kind: page.kind, title, description: str.story(title, s.count), titleLang: null, ...entry(s) };
      }
      case "thread": {
        // Never indexed (D8); the share preview names the thread and its count, never the summary (E.5).
        const t = threads.get(key);
        if (!t) return null;
        const title = t.label[ui];
        return { kind: page.kind, title, description: str.thread(count(ui, t.count)), titleLang: null, noindex: true };
      }
      default:
        return null;
    }
  };
}
