/**
 * Quiet (`<domain>`) paths: parse into and format from a site-neutral Route.
 * Every path ends in a slash (`html_handling: "auto-trailing-slash"`).
 */
import { isEd, type Ed, type EntityKind, type IndexName, type LinkData, type Route } from "./types.ts";
import { buildQuery, formatSeconds, parseSeconds, pathSegments, queryGet, seg, splitUrl } from "./url.ts";

/** Quiet creates entity pages only at ≥2 shiurim (concepts ≥3), integration-plan §2.2. */
export const ENTITY_PAGE_THRESHOLD: Readonly<Record<EntityKind, number>> = { work: 2, person: 2, concept: 3 };

const ENTITY_DIR: Readonly<Record<EntityKind, string>> = { work: "sources", person: "people", concept: "inyanim" };
const DIR_ENTITY: ReadonlyMap<string, EntityKind> = new Map([
  ["sources", "work"],
  ["people", "person"],
  ["inyanim", "concept"],
]);
const ENTITY_INDEX: Readonly<Record<EntityKind, IndexName>> = { work: "sources", person: "people", concept: "concepts" };

const INDEX_PATH: Readonly<Record<IndexName, string | null>> = {
  contents: "contents/",
  "calendar-parsha": "calendar/parsha/",
  "calendar-zman": "calendar/zman/",
  years: "years/",
  about: "about/",
  sources: "sources/",
  stories: "stories/",
  people: "people/",
  concepts: "inyanim/",
  series: "contents/", // Quiet has no series index; series are listed in the contents
  explore: null, // Live only → edition home
  shelf: null, // Live only → edition home
};

/** True when Quiet has a page of its own for this entity (unknown count: assume yes). */
export function quietHasEntityPage(entity: EntityKind, count: number | undefined): boolean {
  return count === undefined || count >= ENTITY_PAGE_THRESHOLD[entity];
}

export interface FormatOptions {
  /** Drop fragments (`#s3`, `#t=…`, index anchors stay): for canonical and hreflang. */
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
      if (route.moment?.kind === "s") return `${base}#s${route.moment.index}`;
      const t = formatSeconds(route.t);
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
    case "entity": {
      const dir = ENTITY_DIR[route.entity];
      const count = data.entityCount?.(route.entity, route.key);
      if (quietHasEntityPage(route.entity, count)) return `/${route.ed}/${dir}/${seg(route.key)}/`;
      return `/${route.ed}/${dir}/#${seg(route.key)}`;
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
        const entity = DIR_ENTITY.get(a as string);
        if (entity) return { kind: "entity", ed, entity, key: b as string };
      }
      return null;
    case 4:
      if (a === "calendar" && (b === "parsha" || b === "zman")) return { kind: "occasion", ed, key: c as string, occasion: b };
      return null;
    default:
      return null;
  }
}

function parseQuietTwo(ed: Ed, a: string, hash: string, query: Parameters<typeof queryGet>[0]): Route | null {
  const entity = DIR_ENTITY.get(a);
  if (entity) {
    // `/{ed}/people/#{key}`: the index anchor for an entity below the page threshold.
    const key = hash === "" ? null : decodeAnchor(hash);
    return key ? { kind: "entity", ed, entity, key } : { kind: "index", ed, index: ENTITY_INDEX[entity] };
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
    case "stories":
      return { kind: "index", ed, index: "stories" };
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
  const sec = /^s(\d{1,5})$/.exec(hash);
  if (sec) return { kind: "shiur", ed, id, moment: { kind: "s", index: Number(sec[1]) } };
  const tm = /^t=(.*)$/.exec(hash);
  const t = tm ? parseSeconds(tm[1]) : undefined;
  return t === undefined ? { kind: "shiur", ed, id } : { kind: "shiur", ed, id, t };
}
