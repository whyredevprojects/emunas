/**
 * Live (`listen.<domain>`) paths: parse into and format from a site-neutral Route.
 * Live paths have no trailing slash except the UI home `/{ui}/`.
 * Only `t` and `m` (shiur) and `q` (search) survive parsing; Live-only state such as
 * `audio`, `read`, `lens` and Explore facets is dropped (integration-plan §2.2).
 */
import { momentId, parseMomentId } from "./moment.ts";
import { parseAudio } from "./quiet.ts";
import { isEd, type EntityKind, type IndexName, type LinkData, type Route } from "./types.ts";
import { buildQuery, formatSeconds, parseSeconds, pathSegments, queryGet, seg, splitUrl } from "./url.ts";

const ENTITY_SEG: Readonly<Record<EntityKind, string>> = { work: "seforim", person: "p", concept: "c" };
const SEG_ENTITY: ReadonlyMap<string, EntityKind> = new Map([
  ["seforim", "work"],
  ["p", "person"],
  ["c", "concept"],
]);

const INDEX_PATH: Readonly<Record<IndexName, string | null>> = {
  sources: "seforim",
  stories: "maasios",
  series: "series",
  explore: "explore",
  shelf: "shelf",
  // Quiet-only listings → UI home
  contents: null,
  "calendar-parsha": null,
  "calendar-zman": null,
  years: null,
  about: null,
  people: null,
  concepts: null,
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
    case "entity":
      return `/${route.ed}/${ENTITY_SEG[route.entity]}/${seg(route.key)}`;
    case "index": {
      const p = INDEX_PATH[route.index];
      return p === null ? `/${route.ed}/` : `/${route.ed}/${p}`;
    }
    case "search":
      return `/${route.ed}/search${buildQuery([["q", route.q === "" ? undefined : route.q]])}`;
    case "audio":
      return `/audio/${seg(route.recordingId)}.mp3${route.download ? "?download=1" : ""}`;
  }
}

/** Parses a Live path or URL (origin ignored). Null for paths that are not Live pages. */
export function parseLive(url: string, data: LinkData = {}): Route | null {
  const u = splitUrl(url);
  if (!u) return null;
  const s = pathSegments(u.path);
  if (!s) return null;
  if (s.length === 0) return { kind: "root" };
  const audio = parseAudio(s, u.query);
  if (audio) return audio;
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
      return s.length <= 4 && b !== undefined ? { kind: "entity", ed, entity: "work", key: b } : null;
    case "maasios":
      return s.length === 2 ? { kind: "index", ed, index: "stories" } : null;
    case "explore":
      return s.length === 2 ? { kind: "index", ed, index: "explore" } : null;
    case "shelf":
    case "pl":
      return { kind: "index", ed, index: "shelf" };
    case "search": {
      if (s.length !== 2) return null;
      const q = queryGet(u.query, "q");
      return q ? { kind: "search", ed, q } : { kind: "search", ed };
    }
    default: {
      const entity = a === undefined ? undefined : SEG_ENTITY.get(a);
      if (entity && s.length === 3 && b !== undefined) return { kind: "entity", ed, entity, key: b };
      return null;
    }
  }
}
