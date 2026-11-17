/**
 * Quiet (`<domain>`) paths: parse into and format from a site-neutral Route.
 * Every path ends in a slash (`html_handling: "auto-trailing-slash"`).
 *
 * Corpus entries (corpus-wave-plan §3.5): topics at `/{ed}/inyanim/{id}/`, glossary entries at
 * `/{ed}/erachim/{id}/`, people at `/{ed}/people/{id}/`, works at `/{ed}/sources/{id}/`, stories
 * at `/{ed}/stories/{id}/`; `all/` continues a topic or person. An entry without a Quiet page
 * links to its index anchor. Threads have no Quiet page in this cut: the edition home's
 * `#indexes`.
 */
import { allowsAll, hasPageOn, resolveEntry } from "./pages.ts";
import { isEd, type CorpusKind, type Ed, type IndexName, type LinkData, type Route } from "./types.ts";
import { buildQuery, formatExactSeconds, parseExactSeconds, pathSegments, queryGet, seg, splitUrl } from "./url.ts";

/** Corpus entry directories; null: no Quiet page of this kind. */
export const QUIET_ENTRY_DIR: Readonly<Record<CorpusKind, string | null>> = {
  topic: "inyanim",
  concept: "erachim",
  person: "people",
  work: "sources",
  story: "stories",
  thread: null,
};
const DIR_ENTRY: ReadonlyMap<string, CorpusKind> = new Map([
  ["inyanim", "topic"],
  ["erachim", "concept"],
  ["people", "person"],
  ["sources", "work"],
  ["stories", "story"],
]);
const ENTRY_INDEX: Readonly<Record<string, IndexName>> = {
  inyanim: "topics",
  erachim: "glossary",
  people: "people",
  sources: "sources",
  stories: "stories",
};

/** The anchor on the edition home that lists the indexes (threads point here in this cut). */
export const INDEXES_ANCHOR = "indexes";

const INDEX_PATH: Readonly<Record<IndexName, string | null>> = {
  contents: "contents/",
  "calendar-parsha": "calendar/parsha/",
  "calendar-zman": "calendar/zman/",
  years: "years/",
  about: "about/",
  sources: "sources/",
  stories: "stories/",
  people: "people/",
  topics: "inyanim/",
  glossary: "erachim/",
  series: "contents/", // Quiet has no series index; series are listed in the contents
  explore: null, // Live only → edition home
  shelf: null, // Live only → edition home
};

export interface FormatOptions {
  /** Drop fragments (`#t=…`; index anchors stay): for canonical and hreflang. */
  readonly bare?: boolean;
}

export function formatQuiet(route: Route, data: LinkData = {}, opts: FormatOptions = {}): string {
  switch (route.kind) {
    case "root":
      return "/";
    case "home":
      return `/${route.ed}/`;
    case "shiur": {
      const base = `/${route.ed}/shiur/${seg(route.id)}/`;
      if (opts.bare) return base;
      // A Quiet shiur page has one place to point at: a time. Moments (Live's `m=`) are not kept.
      const t = formatExactSeconds(route.t);
      return t === undefined ? base : `${base}#t=${t}`;
    }
    case "series":
      return `/${route.ed}/series/${seg(route.id)}/`;
    case "occasion": {
      const kind = route.occasion ?? data.occasionKind?.(route.key);
      // Unknown parsha/zman: the edition home rather than a guessed URL that may 404.
      if (kind === undefined) return `/${route.ed}/`;
      return `/${route.ed}/calendar/${kind}/${seg(route.key)}/`;
    }
    case "entry": {
      const r = resolveEntry(route, data);
      const dir = QUIET_ENTRY_DIR[r.entry];
      if (dir === null) return opts.bare ? `/${r.ed}/` : `/${r.ed}/#${INDEXES_ANCHOR}`;
      if (!hasPageOn("quiet", r.entry, r.id, data)) return `/${r.ed}/${dir}/#${seg(r.id)}`;
      const all = r.all === true && allowsAll(r.entry) ? "all/" : "";
      return `/${r.ed}/${dir}/${seg(r.id)}/${all}`;
    }
    case "index": {
      const p = INDEX_PATH[route.index];
      return p === null ? `/${route.ed}/` : `/${route.ed}/${p}`;
    }
    case "search":
      return `/${route.ed}/search/${buildQuery([["q", route.q === "" ? undefined : route.q]])}`;
  }
}

/** Parses a Quiet path or URL (origin ignored). Null for paths that are not Quiet pages. */
export function parseQuiet(url: string): Route | null {
  const u = splitUrl(url);
  if (!u) return null;
  const s = pathSegments(u.path);
  if (!s) return null;
  if (s.length === 0) return { kind: "root" };
  const [ed, a, b, c] = s;
  if (!isEd(ed)) return null;
  const hash = u.hash;
  switch (s.length) {
    case 1:
      return { kind: "home", ed };
    case 2:
      return parseQuietTwo(ed, a as string, hash, u.query);
    case 3:
      if (a === "shiur") return shiurFromHash(ed, b as string, hash);
      if (a === "series") return { kind: "series", ed, id: b as string };
      if (a === "section") return { kind: "index", ed, index: "contents" };
      if (a === "years") return { kind: "index", ed, index: "years" };
      if (a === "calendar" && b === "parsha") return { kind: "index", ed, index: "calendar-parsha" };
      if (a === "calendar" && b === "zman") return { kind: "index", ed, index: "calendar-zman" };
      {
        const entry = DIR_ENTRY.get(a as string);
        if (entry) return { kind: "entry", ed, entry, id: b as string };
      }
      return null;
    case 4: {
      if (a === "calendar" && (b === "parsha" || b === "zman")) return { kind: "occasion", ed, key: c as string, occasion: b };
      const entry = DIR_ENTRY.get(a as string);
      if (entry && allowsAll(entry) && c === "all") return { kind: "entry", ed, entry, id: b as string, all: true };
      return null;
    }
    default:
      return null;
  }
}

function parseQuietTwo(ed: Ed, a: string, hash: string, query: Parameters<typeof queryGet>[0]): Route | null {
  const entry = DIR_ENTRY.get(a);
  if (entry) {
    // `/{ed}/people/#{id}`: the index anchor of an entry without a page of its own.
    const id = hash === "" ? null : decodeAnchor(hash);
    return id ? { kind: "entry", ed, entry, id } : { kind: "index", ed, index: ENTRY_INDEX[a] as IndexName };
  }
  switch (a) {
    case "search": {
      const q = queryGet(query, "q");
      return q ? { kind: "search", ed, q } : { kind: "search", ed };
    }
    case "contents":
      return { kind: "index", ed, index: "contents" };
    case "calendar":
      return { kind: "index", ed, index: "calendar-parsha" };
    case "years":
      return { kind: "index", ed, index: "years" };
    case "about":
      return { kind: "index", ed, index: "about" };
    default:
      return null;
  }
}

function decodeAnchor(hash: string): string | null {
  try {
    const v = decodeURIComponent(hash);
    return v === "" ? null : v;
  } catch {
    return null;
  }
}

function shiurFromHash(ed: Ed, id: string, hash: string): Route {
  const tm = /^t=(.*)$/.exec(hash);
  const t = tm ? parseExactSeconds(tm[1]) : undefined;
  return t === undefined ? { kind: "shiur", ed, id } : { kind: "shiur", ed, id, t };
}
