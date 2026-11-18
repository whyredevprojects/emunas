/**
 * @emunas/links — URL builders for both sites, cross-site equivalents, canonical and
 * hreflang helpers, host config (integration-plan §2). Pure and browser-safe: no Node
 * APIs, no DOM, no globals.
 */
export type {
  Ed,
  Site,
  MomentKind,
  MomentRef,
  CorpusKind,
  OccasionKind,
  IndexName,
  Route,
  LinkData,
} from "./types.ts";
export { EDS, MOMENT_KINDS, CORPUS_KINDS, isEd } from "./types.ts";
export type { Hosts, HostEnv, SiteHosts } from "./hosts.ts";
export {
  hostsFromEnv,
  siteHostsFromEnv,
  productionHosts,
  workersDevHosts,
  normalizeOrigin,
  validateHosts,
  isIndexableOrigin,
  hostOf,
  QUIET_SUBDOMAIN,
  LIVE_SUBDOMAIN,
  MEDIA_SUBDOMAIN,
  HOME_WORKER,
  QUIET_WORKER,
  LIVE_WORKER,
} from "./hosts.ts";
export { momentId, parseMomentId, type ParsedMomentId } from "./moment.ts";
export { hasPageOn, resolveEntry, type EntryRoute } from "./pages.ts";
export { formatQuiet, parseQuiet, QUIET_ENTRY_DIR, INDEXES_ANCHOR } from "./quiet.ts";
export { formatLive, parseLive, LIVE_ENTRY_SEG } from "./live.ts";
export {
  pageLookupFromLayer,
  hrefFor,
  type LayerPagesInput,
  type LayerLinkData,
} from "./corpus.ts";
export {
  sectionSlug,
  quietSectionPath,
  POCKET_GUIDE_SOURCE,
  UNCATALOGUED_SECTION_PREFIX,
  type SectionRef,
} from "./section.ts";
export {
  quietPaths,
  livePaths,
  type QuietPaths,
  type LivePaths,
  type QuietShiurOptions,
  type LiveShiurOptions,
  type EntryOptions,
} from "./builders.ts";
export { createLinks, type Links, type HreflangLink, type ParsedSiteUrl } from "./links.ts";
