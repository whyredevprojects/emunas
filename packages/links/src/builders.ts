/**
 * Root-relative path builders for each site (same-site links). For cross-site, absolute
 * links use `createLinks(...).quiet` / `.live`, which wrap these with the site origin.
 */
import { parseMomentId } from "./moment.ts";
import { formatLive } from "./live.ts";
import { formatQuiet } from "./quiet.ts";
import { quietSectionPath, type SectionRef } from "./section.ts";
import { badEdition, isEd, type CorpusKind, type Ed, type LinkData, type MomentRef, type Route } from "./types.ts";

function ed(value: Ed): Ed {
  if (!isEd(value)) throw new TypeError(badEdition(value));
  return value;
}

function key(what: string, value: string): string {
  if (typeof value !== "string" || value === "" || value.includes("/")) {
    throw new TypeError(`@emunas/links: bad ${what}: ${JSON.stringify(value)}`);
  }
  return value;
}

function sectionIndex(i: number): number {
  if (!Number.isInteger(i) || i < 0) throw new TypeError(`@emunas/links: bad section index ${i}`);
  return i;
}

export interface QuietShiurOptions {
  /** Section index → `#s{i}`. Wins over `t` (a page has one fragment). */
  readonly section?: number | undefined;
  /** Global seconds → `#t={t}` (kept to the millisecond; ignored if not a finite non-negative number). */
  readonly t?: number | undefined;
}

export interface LiveShiurOptions {
  /** Global seconds → `?t=` (kept to the millisecond; ignored if not a finite non-negative number). */
  readonly t?: number | undefined;
  /** Moment to focus: a moment id `<shiurId>~<kind><index>` or `{kind, index}` → `&m=`. */
  readonly m?: string | MomentRef | undefined;
}

export interface EntryOptions {
  /** Quiet only: the `all/` continuation page (topics and people). Ignored elsewhere. */
  readonly all?: boolean | undefined;
}

function shiurRoute(e: Ed, id: string, t: number | undefined, moment: MomentRef | undefined): Route {
  return { kind: "shiur", ed: e, id, ...(t === undefined ? {} : { t }), ...(moment === undefined ? {} : { moment }) };
}

function liveMoment(id: string, m: string | MomentRef | undefined): MomentRef | undefined {
  if (m === undefined) return undefined;
  if (typeof m !== "string") return { kind: m.kind, index: sectionIndex(m.index) };
  const parsed = parseMomentId(m);
  if (!parsed || parsed.shiurId !== id) throw new TypeError(`@emunas/links: moment ${JSON.stringify(m)} is not in shiur ${id}`);
  return { kind: parsed.kind, index: parsed.index };
}

function entryRoute(e: Ed, entry: CorpusKind, id: string, all?: boolean): Route {
  return { kind: "entry", ed: ed(e), entry, id: key(`${entry} id`, id), ...(all ? { all: true } : {}) };
}

export function quietPaths(data: LinkData = {}) {
  const f = (r: Route) => formatQuiet(r, data);
  /** Corpus entry by id. */
  const entry = (kind: CorpusKind) => (e: Ed, id: string, opts?: EntryOptions) => f(entryRoute(e, kind, id, opts?.all));
  const index = (name: "topics" | "glossary" | "people" | "sources" | "stories") => (e: Ed) =>
    f({ kind: "index", ed: ed(e), index: name });
  return {
    root: () => "/",
    home: (e: Ed) => f({ kind: "home", ed: ed(e) }),
    shiur: (e: Ed, id: string, opts: QuietShiurOptions = {}) =>
      f(
        shiurRoute(
          ed(e),
          key("shiur id", id),
          opts.t,
          opts.section === undefined ? undefined : { kind: "s", index: sectionIndex(opts.section) },
        ),
      ),
    /** Section page `/{ed}/section/{slug}/` (Quiet only; slug rule in section.ts). */
    section: (e: Ed, section: SectionRef) => quietSectionPath(ed(e), section),
    series: (e: Ed, id: string) => f({ kind: "series", ed: ed(e), id: key("series id", id) }),
    parsha: (e: Ed, k: string) => f({ kind: "occasion", ed: ed(e), key: key("parsha key", k), occasion: "parsha" }),
    zman: (e: Ed, k: string) => f({ kind: "occasion", ed: ed(e), key: key("zman key", k), occasion: "zman" }),
    /** `/{ed}/sources/{workId}/`, or the index anchor without a Quiet page. */
    work: entry("work"),
    /** `/{ed}/people/{personId}/` (`all: true` → `…/all/`), or the index anchor. */
    person: entry("person"),
    /** `/{ed}/inyanim/{topicId}/` (`all: true` → `…/all/`). */
    topic: entry("topic"),
    /** `/{ed}/erachim/{conceptId}/`; a concept merged into a topic → the topic; else the anchor. */
    glossaryEntry: entry("concept"),
    /** `/{ed}/stories/{storyId}/`, or the index anchor below the telling threshold. */
    story: entry("story"),
    /** No thread pages on Quiet in this cut: the edition home's `#indexes`. */
    thread: (e: Ed, id: string) => f(entryRoute(e, "thread", id)),
    topics: index("topics"),
    glossary: index("glossary"),
    people: index("people"),
    sources: index("sources"),
    stories: index("stories"),
    search: (e: Ed, q?: string) => f(q ? { kind: "search", ed: ed(e), q } : { kind: "search", ed: ed(e) }),
  };
}

export function livePaths(data: LinkData = {}) {
  const f = (r: Route) => formatLive(r, data);
  return {
    root: () => "/",
    home: (ui: Ed) => f({ kind: "home", ed: ed(ui) }),
    shiur: (ui: Ed, id: string, opts: LiveShiurOptions = {}) =>
      f(shiurRoute(ed(ui), key("shiur id", id), opts.t, liveMoment(id, opts.m))),
    series: (ui: Ed, id: string) => f({ kind: "series", ed: ed(ui), id: key("series id", id) }),
    occasion: (ui: Ed, k: string) => f({ kind: "occasion", ed: ed(ui), key: key("occasion key", k) }),
    /** `/{ui}/seforim/{workId}`. */
    work: (ui: Ed, id: string) => f(entryRoute(ui, "work", id)),
    /** `/{ui}/p/{personId}`. */
    person: (ui: Ed, id: string) => f(entryRoute(ui, "person", id)),
    /** `/{ui}/c/{conceptId}`; a concept merged into a topic → `/{ui}/t/{topicId}`. */
    concept: (ui: Ed, id: string) => f(entryRoute(ui, "concept", id)),
    /** `/{ui}/t/{topicId}`. */
    topic: (ui: Ed, id: string) => f(entryRoute(ui, "topic", id)),
    /** `/{ui}/maasios/{storyId}`. */
    story: (ui: Ed, id: string) => f(entryRoute(ui, "story", id)),
    /** `/{ui}/th/{threadId}` (noindex, D8). */
    thread: (ui: Ed, id: string) => f(entryRoute(ui, "thread", id)),
    /** `/{ui}/explore`: opens on the topic map. */
    explore: (ui: Ed) => f({ kind: "index", ed: ed(ui), index: "topics" }),
    /** `/{ui}/maasios`. */
    stories: (ui: Ed) => f({ kind: "index", ed: ed(ui), index: "stories" }),
    /** `/{ui}/seforim`. */
    sources: (ui: Ed) => f({ kind: "index", ed: ed(ui), index: "sources" }),
    search: (ui: Ed, q?: string) => f(q ? { kind: "search", ed: ed(ui), q } : { kind: "search", ed: ed(ui) }),
  };
}

export type QuietPaths = ReturnType<typeof quietPaths>;
export type LivePaths = ReturnType<typeof livePaths>;
