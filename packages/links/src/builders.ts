/**
 * Root-relative path builders for each site (same-site links). For cross-site, absolute
 * links use `createLinks(...).quiet` / `.live`, which wrap these with the site origin.
 */
import { parseMomentId } from "./moment.ts";
import { formatLive } from "./live.ts";
import { formatQuiet } from "./quiet.ts";
import { isEd, type Ed, type EntityKind, type LinkData, type MomentRef, type Route } from "./types.ts";

function ed(value: Ed): Ed {
  if (!isEd(value)) throw new TypeError(`@emunas/links: edition must be "yi" or "en", got ${JSON.stringify(value)}`);
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
  /** Global seconds → `#t={t}` (rounded; ignored if not a finite non-negative number). */
  readonly t?: number | undefined;
}

export interface LiveShiurOptions {
  /** Global seconds → `?t=` (rounded; ignored if not a finite non-negative number). */
  readonly t?: number | undefined;
  /** Moment to focus: a moment id `<shiurId>~<kind><index>` or `{kind, index}` → `&m=`. */
  readonly m?: string | MomentRef | undefined;
}

export interface EntityOptions {
  /** Shiurim count; below the Quiet page threshold the link is the index anchor. */
  readonly count?: number | undefined;
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

function entityData(base: LinkData, entity: EntityKind, k: string, opts: EntityOptions | undefined): LinkData {
  if (opts?.count === undefined) return base;
  const count = opts.count;
  return { ...base, entityCount: (e, kk) => (e === entity && kk === k ? count : base.entityCount?.(e, kk)) };
}

export function quietPaths(data: LinkData = {}) {
  const f = (r: Route, d: LinkData = data) => formatQuiet(r, d);
  const entity = (entity: EntityKind) => (e: Ed, k: string, opts?: EntityOptions) =>
    f({ kind: "entity", ed: ed(e), entity, key: key(entity, k) }, entityData(data, entity, k, opts));
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
    series: (e: Ed, id: string) => f({ kind: "series", ed: ed(e), id: key("series id", id) }),
    parsha: (e: Ed, k: string) => f({ kind: "occasion", ed: ed(e), key: key("parsha key", k), occasion: "parsha" }),
    zman: (e: Ed, k: string) => f({ kind: "occasion", ed: ed(e), key: key("zman key", k), occasion: "zman" }),
    work: entity("work"),
    person: entity("person"),
    concept: entity("concept"),
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
    work: (ui: Ed, k: string) => f({ kind: "entity", ed: ed(ui), entity: "work", key: key("work key", k) }),
    person: (ui: Ed, k: string) => f({ kind: "entity", ed: ed(ui), entity: "person", key: key("person key", k) }),
    concept: (ui: Ed, k: string) => f({ kind: "entity", ed: ed(ui), entity: "concept", key: key("concept key", k) }),
    search: (ui: Ed, q?: string) => f(q ? { kind: "search", ed: ed(ui), q } : { kind: "search", ed: ed(ui) }),
  };
}

export type QuietPaths = ReturnType<typeof quietPaths>;
export type LivePaths = ReturnType<typeof livePaths>;
