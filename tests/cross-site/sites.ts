/**
 * Cross-site test harness (integration-plan §2.2, W5.1): where the two built sites are, the test
 * hosts they were built for, the `@emunas/links` instance over them, and file-level resolvers that
 * say whether a URL of either site lands on a page that exists in the build output.
 *
 * Inputs (all built from the same `data/` before the tests run; CI's e2e job does this):
 *   CROSS_SITE_CORPUS       `.corpus/` (default `<repo>/.corpus`)
 *   CROSS_SITE_QUIET_DIST   Quiet `dist/` built with EMUNAS_DOMAIN=emunas.example
 *                           (default `apps/quiet/dist`)
 *   CROSS_SITE_LIVE_CLIENT  Live `build/client/` (with `data/`) built with the same domain
 *                           (default `apps/live/build/client`)
 *
 * The test domain `emunas.example` (RFC 2606) never resolves; the browser tests route both hosts to
 * the build outputs.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLinks, isEd, pageLookupFromLayer, type LayerPagesInput, type LinkData, type Links, type OccasionKind } from "@emunas/links";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DOMAIN = "emunas.example";
export const QUIET = `https://library.${DOMAIN}`;
export const LIVE = `https://listen.${DOMAIN}`;

export interface SitePaths {
  corpus: string;
  quietDist: string;
  liveClient: string;
}

export function sitePaths(env: Readonly<Record<string, string | undefined>> = process.env): SitePaths {
  const at = (v: string | undefined, def: string) => resolve(REPO, v && v.trim() !== "" ? v : def);
  return {
    corpus: at(env["CROSS_SITE_CORPUS"], ".corpus"),
    quietDist: at(env["CROSS_SITE_QUIET_DIST"], "apps/quiet/dist"),
    liveClient: at(env["CROSS_SITE_LIVE_CLIENT"], "apps/live/build/client"),
  };
}

/** Why the outputs cannot be used, or null. */
export function missingOutputs(p: SitePaths): string | null {
  const need: [string, string][] = [
    [join(p.corpus, "build.json"), "run `npm run corpus:build`"],
    [join(p.corpus, "layer", "layer.json"), "run `npm run corpus:build` (the corpus layer)"],
    [join(p.quietDist, "en", "index.html"), "build Quiet with EMUNAS_DOMAIN=emunas.example"],
    [join(p.liveClient, "data", "build.json"), "run `npm run data:build -w @emunas/live` and build Live with EMUNAS_DOMAIN=emunas.example"],
  ];
  const miss = need.filter(([f]) => !existsSync(f)).map(([f, how]) => `${f} (${how})`);
  return miss.length === 0 ? null : `cross-site outputs missing: ${miss.join("; ")}`;
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

// ---------------------------------------------------------------------------------------------
// The corpus facts the link builders need (same sources as the apps: the corpus layer for entity
// pages, the catalog aggregates for occasions and series)

interface OccasionRow {
  key: string;
  en: string;
  yi: string;
  he?: string;
  count: number;
  shiurim: { id: string }[];
}
export interface OccasionsFile {
  parshiyos: OccasionRow[];
  zmanim: OccasionRow[];
}
export interface SeriesRow {
  id: string;
  title: { en: string; yi: string };
  lang: "en" | "yi";
  count: number;
  parts: { id: string; order: number }[];
}
export interface IndexRow {
  id: string;
  lang: "en" | "yi";
  status: "full" | "catalog-only";
  catalog: { titleOriginal: string };
}

interface LayerPages {
  quiet?: boolean;
  live?: boolean;
}
interface LayerLabel {
  en?: string;
  yi?: string;
  he?: string;
}
/** The parts of the corpus layer (`.corpus/layer/*.json`) the cross-site suite reads. */
export interface LayerFacts {
  topics: { id: string; parentId: string | null; label: LayerLabel; count: number; pages?: LayerPages; gateway?: boolean }[];
  concepts: {
    id: string;
    canonicalHe?: string;
    label?: LayerLabel;
    shiurIds?: string[];
    pages?: LayerPages;
    mergedIntoTopic?: string | null;
    /** "Throughout": the Quiet page shows examples, not every shiur. */
    passim?: boolean;
  }[];
  people: { id: string; nameHe?: string | null; nameEn?: string | null; nameYi?: string | null; count?: number; pages?: LayerPages }[];
  works: { id: string; titleHe?: string | null; titleEn?: string | null; count?: number; pages?: LayerPages }[];
  stories: { id: string; title: { en: string; yi: string }; tellings?: { shiurId: string }[]; pages?: LayerPages }[];
}

export interface CorpusFacts {
  layer: LayerFacts;
  occasions: OccasionsFile;
  series: SeriesRow[];
  index: IndexRow[];
  data: LinkData;
}

function readLayer(corpus: string): { facts: LayerFacts; input: LayerPagesInput } {
  const dir = join(corpus, "layer");
  const opt = <T>(name: string): T | null => (existsSync(join(dir, name)) ? readJson<T>(join(dir, name)) : null);
  const topics = opt<{ tree: LayerFacts["topics"] }>("topics.json");
  const concepts = opt<{ concepts: LayerFacts["concepts"] }>("concepts.json");
  const people = opt<{ people: LayerFacts["people"] }>("people.json");
  const works = opt<{ works: LayerFacts["works"] }>("works.json");
  const stories = opt<{ stories: LayerFacts["stories"] }>("stories.json");
  const threads = opt<{ threads: { id: string; page?: boolean }[] }>("threads.json");
  return {
    facts: {
      topics: topics?.tree ?? [],
      concepts: concepts?.concepts ?? [],
      people: people?.people ?? [],
      works: works?.works ?? [],
      stories: stories?.stories ?? [],
    },
    input: { topics, concepts, people, works, stories, threads },
  };
}

export function readCorpusFacts(corpus: string): CorpusFacts {
  const occasions = readJson<OccasionsFile>(join(corpus, "occasions.json"));
  const series = readJson<{ series: SeriesRow[] }>(join(corpus, "series.json")).series;
  const index = readJson<{ shiurim: IndexRow[] }>(join(corpus, "index.json")).shiurim;
  const layer = readLayer(corpus);
  const kinds = new Map<string, OccasionKind>();
  for (const o of occasions.parshiyos) kinds.set(o.key, "parsha");
  for (const o of occasions.zmanim) kinds.set(o.key, "zman");
  return {
    layer: layer.facts,
    occasions,
    series,
    index,
    data: {
      ...pageLookupFromLayer(layer.input),
      occasionKind: (k) => kinds.get(k),
    },
  };
}

export function siteLinks(data: LinkData = {}): Links {
  return createLinks({ hosts: { quiet: QUIET, live: LIVE }, data });
}

// ---------------------------------------------------------------------------------------------
// File-level resolvers

const ID_CACHE = new Map<string, Set<string>>();

/** The `id` attributes of a built HTML file (cached). */
function idsIn(file: string): Set<string> {
  let ids = ID_CACHE.get(file);
  if (!ids) {
    ids = new Set([...readFileSync(file, "utf8").matchAll(/\sid="([^"]+)"/gu)].map((m) => m[1]!));
    ID_CACHE.set(file, ids);
  }
  return ids;
}

function decodePath(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

/** The built Quiet file a pathname serves (directory index), or null. */
export function quietFile(dist: string, pathname: string): string | null {
  const p = decodePath(pathname);
  if (p === null || p.includes("..")) return null;
  const direct = join(dist, p);
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  const index = join(dist, p, "index.html");
  return existsSync(index) ? index : null;
}

/**
 * Whether a Quiet URL lands on a built page (and, for a fragment other than `#t=`, on an element
 * with that id). Returns the reason when it does not.
 */
export function checkQuietUrl(dist: string, url: string): string | null {
  const u = new URL(url);
  if (u.origin !== QUIET) return `not a Quiet URL: ${url}`;
  const file = quietFile(dist, u.pathname);
  if (!file) return `no Quiet page for ${u.pathname}`;
  const frag = decodePath(u.hash.slice(1)) ?? "";
  if (frag === "" || frag.startsWith("t=")) return null;
  return idsIn(file).has(frag) ? null : `no #${frag} on ${u.pathname}`;
}

const LIVE_STATIC = new Set(["", "explore", "seforim", "maasios", "series", "search", "shelf", "pl"]);

/**
 * Whether a Live URL lands on content: Live is a SPA, so a page "exists" when its route is in the
 * route table and the data file it renders is in `build/client/data/` (a shiur, entity, work or
 * series file). Returns the reason when it does not.
 */
export function checkLiveUrl(client: string, url: string): string | null {
  const u = new URL(url);
  if (u.origin !== LIVE) return `not a Live URL: ${url}`;
  const p = decodePath(u.pathname);
  if (p === null) return `undecodable path ${u.pathname}`;
  const parts = p.split("/").filter(Boolean);
  const [ui, kind, key, extra] = parts;
  if (parts.length === 0) return null;
  if (!isEd(ui)) return `no UI language in ${u.pathname}`;
  if (parts.length === 1 || (parts.length === 2 && LIVE_STATIC.has(kind!))) return null;
  if (kind === "shelf" && parts.length === 3) return null;
  const data = join(client, "data");
  const has = (rel: string) => existsSync(join(data, rel));
  switch (kind) {
    case "s":
      return parts.length === 3 && has(`shiur/${key}.json`) ? null : `no Live shiur data for ${u.pathname}`;
    case "p":
    case "c":
    case "o":
      return parts.length === 3 && has(`entity/${kind}/${key}.json`) ? null : `no Live entity data for ${u.pathname}`;
    case "seforim":
      return parts.length <= 4 && has(`work/${key}.json`) && (extra === undefined || /^\d+$/u.test(extra))
        ? null
        : `no Live work data for ${u.pathname}`;
    case "series":
      return parts.length === 3 && has(`series/${key}.json`) ? null : `no Live series data for ${u.pathname}`;
    // Corpus layer (corpus-wave-plan §3.5): topic, thread and story pages render their own file.
    case "t":
      return parts.length === 3 && has(`topic/${key}.json`) ? null : `no Live topic data for ${u.pathname}`;
    case "th":
      return parts.length === 3 && has(`thread/${key}.json`) ? null : `no Live thread data for ${u.pathname}`;
    case "maasios":
      return parts.length === 3 && has(`story/${key}.json`) ? null : `no Live story data for ${u.pathname}`;
    default:
      return `not a Live route: ${u.pathname}`;
  }
}

// ---------------------------------------------------------------------------------------------
// Scanning the outputs for cross-site links

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

const decodeEntities = (s: string) => s.replace(/&amp;/gu, "&").replace(/&#38;/gu, "&").replace(/&quot;/gu, '"');

/** Every `href="…"` (and `<link href>`) value in a file that points at `origin`. */
export function hrefsTo(html: string, origin: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/\shref="([^"]*)"/gu)) {
    const v = decodeEntities(m[1]!);
    if (v === origin || v.startsWith(`${origin}/`)) out.add(v);
  }
  return [...out];
}

export interface Finding {
  file: string;
  url: string;
  reason: string;
}

/**
 * All cross-site links in both outputs that do not resolve:
 *  - Quiet → Live ("Open in the listening app" and friends) against the Live route table + data;
 *  - Live → Quiet (canonical, "Printable page" in prerendered HTML) against Quiet's built pages.
 * `limitPerSite` caps the number of files read per site (0 = all).
 */
export function scanCrossLinks(p: SitePaths, limitPerSite = 0): { checked: number; findings: Finding[] } {
  const findings: Finding[] = [];
  let checked = 0;
  const cap = <T>(xs: T[]) => (limitPerSite > 0 ? xs.slice(0, limitPerSite) : xs);
  for (const file of cap(walk(p.quietDist))) {
    const html = readFileSync(file, "utf8");
    for (const url of hrefsTo(html, LIVE)) {
      checked++;
      const why = checkLiveUrl(p.liveClient, url);
      if (why) findings.push({ file: file.slice(p.quietDist.length), url, reason: why });
    }
  }
  const liveHtml = walk(p.liveClient).filter((f) => !f.startsWith(join(p.liveClient, "data")));
  for (const file of cap(liveHtml)) {
    const html = readFileSync(file, "utf8");
    for (const url of hrefsTo(html, QUIET)) {
      checked++;
      const why = checkQuietUrl(p.quietDist, url);
      if (why) findings.push({ file: file.slice(p.liveClient.length), url, reason: why });
    }
  }
  return { checked, findings };
}
