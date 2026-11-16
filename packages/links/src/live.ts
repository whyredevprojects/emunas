/**
 * Live (`listen.<domain>`) paths: parse into and format from a site-neutral Route.
 * Live paths have no trailing slash except the UI home `/{ui}/`.
 * Only `t` and `m` (shiur) and `q` (search) survive parsing; Live-only state such as
 * `audio`, `read`, `lens` and Explore facets is dropped (integration-plan §2.2).
 *
 * Corpus entries (corpus-wave-plan §3.5): `/{ui}/t/{topicId}`, `/{ui}/c/{conceptId}` (a concept
 * merged into a topic goes to `/t/`), `/{ui}/p/{personId}`, `/{ui}/seforim/{workId}`,
 * `/{ui}/maasios/{storyId}`, `/{ui}/th/{threadId}`. The topic tree is the Explore map.
 */
import { momentId, parseMomentId } from "./moment.ts";
import { resolveEntry } from "./pages.ts";
import { isEd, type CorpusKind, type IndexName, type LinkData, type Route } from "./types.ts";
import { buildQuery, formatSeconds, parseSeconds, pathSegments, queryGet, seg, splitUrl } from "./url.ts";


/** Corpus entry segments. */
export const LIVE_ENTRY_SEG: Readonly<Record<CorpusKind, string>> = {
  topic: "t",
  concept: "c",
  person: "p",
  work: "seforim",
  story: "maasios",
  thread: "th",
};
const SEG_ENTRY: ReadonlyMap<string, CorpusKind> = new Map([
  ["t", "topic"],
  ["c", "concept"],
  ["p", "person"],
  ["th", "thread"],
]);

const INDEX_PATH: Readonly<Record<IndexName, string | null>> = {
  sources: "seforim",
  stories: "maasios",
  series: "series",
  explore: "explore",
  topics: "explore", // the topic map is the front of Explore
  shelf: "shelf",
  // Quiet-only listings → UI home
  contents: null,
  "calendar-parsha": null,
  "calendar-zman": null,
  years: null,
  about: null,
  people: null,
  glossary: null,
};

export function formatLive(route: Route, data: LinkData = {}, opts: { readonly bare?: boolean } = {}): string {
  switch (route.kind) {
    case "root":
      return "/";
    case "home":
      return `/${route.ed}/`;
    case "shiur": {
      const base = `/${route.ed}/s/${seg(route.id)}`;
      if (opts.bare) return base;
      let t = route.t;
      if (route.moment?.kind === "s") t = data.sectionStart?.(route.id, route.moment.index) ?? t;
      const m = route.moment ? momentId(route.id, route.moment.kind, route.moment.index) : undefined;
      return base + buildQuery([["t", formatSeconds(t)], ["m", m]]);
    }
    case "series":
      return `/${route.ed}/series/${seg(route.id)}`;
    case "occasion":
      return `/${route.ed}/o/${seg(route.key)}`;
    case "entry": {
      const r = resolveEntry(route, data);
      return `/${r.ed}/${LIVE_ENTRY_SEG[r.entry]}/${seg(r.id)}`;
    }
    case "index": {
      const p = INDEX_PATH[route.index];
      return p === null ? `/${route.ed}/` : `/${route.ed}/${p}`;
    }
    case "search":
      return `/${route.ed}/search${buildQuery([["q", route.q === "" ? undefined : route.q]])}`;
  }
}

/** Parses a Live path or URL (origin ignored). Null for paths that are not Live pages. */
export function parseLive(url: string, data: LinkData = {}): Route | null {
  const u = splitUrl(url);
  if (!u) return null;
  const s = pathSegments(u.path);
  if (!s) return null;
  if (s.length === 0) return { kind: "root" };
  const [ed, a, b] = s;
  if (!isEd(ed)) return null;
  if (s.length === 1) return { kind: "home", ed };
  switch (a) {
    case "s": {
      if (s.length !== 3 || b === undefined) return null;
      const t = parseSeconds(queryGet(u.query, "t"));
      const parsed = parseMomentId(queryGet(u.query, "m") ?? "");
      const moment = parsed && parsed.shiurId === b ? { kind: parsed.kind, index: parsed.index } : undefined;
      return {
        kind: "shiur",
        ed,
        id: b,
        ...(t === undefined ? {} : { t }),
        ...(moment === undefined ? {} : { moment }),
      };
    }
    case "series":
      if (s.length === 2) return { kind: "index", ed, index: "series" };
      return s.length === 3 && b !== undefined ? { kind: "series", ed, id: b } : null;
    case "o": {
      if (s.length !== 3 || b === undefined) return null;
      const occasion = data.occasionKind?.(b);
      return occasion === undefined ? { kind: "occasion", ed, key: b } : { kind: "occasion", ed, key: b, occasion };
    }
    case "seforim":
      // `/seforim/:workId/:chapter` still names the work.
      if (s.length === 2) return { kind: "index", ed, index: "sources" };
      return s.length <= 4 && b !== undefined ? { kind: "entry", ed, entry: "work", id: b } : null;
    case "maasios":
      if (s.length === 2) return { kind: "index", ed, index: "stories" };
      return s.length === 3 && b !== undefined ? { kind: "entry", ed, entry: "story", id: b } : null;
    case "explore":
      // Explore opens on the topic map (Live C.2); its lenses and facets are Live-only state.
      return s.length === 2 ? { kind: "index", ed, index: "topics" } : null;
    case "shelf":
    case "pl":
      return { kind: "index", ed, index: "shelf" };
    case "search": {
      if (s.length !== 2) return null;
      const q = queryGet(u.query, "q");
      return q ? { kind: "search", ed, q } : { kind: "search", ed };
    }
    default: {
      const entry = a === undefined ? undefined : SEG_ENTRY.get(a);
      if (entry && s.length === 3 && b !== undefined) return { kind: "entry", ed, entry, id: b };
      return null;
    }
  }
}
