/**
 * Which Live pages search engines may index (integration-plan §2.3, W4.5).
 *
 * Live is never the indexable copy of a shiur: every page carries `<link rel="canonical">` to the
 * Quiet equivalent. Content pages (shiur, series, occasion, work, person, concept) are left
 * indexable so the canonical can consolidate them; app-only pages (Today, Explore, search, shelf,
 * playlists, the listings and anything unknown) are `noindex`. Pure and browser-safe.
 *
 * Corpus entries (corpus-wave-plan §3.5, C1.7): a topic, story, person, concept or sefer page whose
 * Quiet equivalent has no page has no canonical and is `noindex` (`@emunas/links` `noindexFor`); a
 * thread page is always `noindex` with no canonical (D8).
 */
import { isUiLang, type UiLang } from "@emunas/i18n";

export type LivePageKind =
  | "root"
  | "today"
  | "shiur"
  | "series"
  | "series-index"
  | "occasion"
  | "work"
  | "work-chapter"
  | "works-index"
  | "person"
  | "concept"
  | "topic"
  | "story"
  | "thread"
  | "maasios"
  | "explore"
  | "search"
  | "shelf"
  | "playlist"
  | "unknown";

export interface LivePage {
  kind: LivePageKind;
  /** The `:ui` segment; null for `/` and paths outside `/en/`, `/yi/`. */
  ui: UiLang | null;
  /** The id or key in the path (decoded), for single-thing pages. */
  key: string | null;
}

/** Pages that may be indexed (they still canonicalize to Quiet). Everything else is `noindex`. */
export const INDEXABLE_KINDS: ReadonlySet<LivePageKind> = new Set<LivePageKind>([
  "shiur",
  "series",
  "occasion",
  "work",
  "work-chapter",
  "person",
  "concept",
  "topic",
  "story",
]);

/**
 * Corpus-entry kinds: indexable, but `noindex` with no canonical when Quiet has no page for the
 * entity (the build decides from the layer's page flags). Threads are never indexable.
 */
export const ENTRY_KINDS: ReadonlySet<LivePageKind> = new Set<LivePageKind>([
  "work",
  "work-chapter",
  "person",
  "concept",
  "topic",
  "story",
]);

/** The app-only pages the brief names explicitly (§2.3): always `noindex`. */
export const APP_ONLY_KINDS: ReadonlySet<LivePageKind> = new Set<LivePageKind>([
  "today",
  "explore",
  "search",
  "shelf",
  "playlist",
]);

function decode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/** Path segments of a Live pathname (query and hash ignored), decoded; null when malformed. */
function segments(pathname: string): string[] | null {
  const path = pathname.split(/[?#]/u, 1)[0] ?? "";
  if (!path.startsWith("/")) return null;
  const out: string[] = [];
  for (const raw of path.split("/")) {
    if (raw === "") continue;
    const s = decode(raw);
    if (s === null || s === "" || s.includes("/")) return null;
    out.push(s);
  }
  return out;
}

/** Classifies a Live pathname against the route table in `app/routes.ts`. */
export function classifyLivePath(pathname: string): LivePage {
  const s = segments(pathname);
  if (s === null) return { kind: "unknown", ui: null, key: null };
  if (s.length === 0) return { kind: "root", ui: null, key: null };
  const [ui, a, b, c] = s;
  if (!isUiLang(ui)) return { kind: "unknown", ui: null, key: null };
  const page = (kind: LivePageKind, key: string | null = null): LivePage => ({ kind, ui, key });
  if (a === undefined) return page("today");
  const n = s.length;
  switch (a) {
    case "s":
      return n === 3 && b !== undefined ? page("shiur", b) : page("unknown");
    case "series":
      if (n === 2) return page("series-index");
      return n === 3 && b !== undefined ? page("series", b) : page("unknown");
    case "o":
      return n === 3 && b !== undefined ? page("occasion", b) : page("unknown");
    case "seforim":
      if (n === 2) return page("works-index");
      if (n === 3 && b !== undefined) return page("work", b);
      return n === 4 && b !== undefined && c !== undefined ? page("work-chapter", b) : page("unknown");
    case "p":
      return n === 3 && b !== undefined ? page("person", b) : page("unknown");
    case "c":
      return n === 3 && b !== undefined ? page("concept", b) : page("unknown");
    case "maasios":
      if (n === 2) return page("maasios");
      return n === 3 && b !== undefined ? page("story", b) : page("unknown");
    case "t":
      return n === 3 && b !== undefined ? page("topic", b) : page("unknown");
    case "th":
      return n === 3 && b !== undefined ? page("thread", b) : page("unknown");
    case "explore":
      return n === 2 ? page("explore") : page("unknown");
    case "search":
      return n === 2 ? page("search") : page("unknown");
    case "shelf":
      return n <= 3 ? page("shelf") : page("unknown");
    case "pl":
      return n === 2 ? page("playlist") : page("unknown");
    default:
      return page("unknown");
  }
}

export function isIndexable(kind: LivePageKind): boolean {
  return INDEXABLE_KINDS.has(kind);
}

/** `/en/s/x/` → `/en/s/x`; the UI homes keep their slash (`/en/`); `/` stays. Query/hash dropped. */
export function normalizeLivePath(pathname: string): string {
  const path = pathname.split(/[?#]/u, 1)[0] ?? "/";
  const trimmed = path.replace(/\/+$/u, "");
  if (trimmed === "") return "/";
  return isUiLang(trimmed.slice(1)) ? `${trimmed}/` : trimmed;
}
