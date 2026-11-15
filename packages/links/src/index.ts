/**
 * @emunas/links — URL builders for both sites, cross-site equivalents, canonical and
 * hreflang helpers, host config (integration-plan §2). Pure and browser-safe: no Node
 * APIs, no DOM, no globals.
 */
export type { Ed, Site, MomentKind, MomentRef, EntityKind, OccasionKind, IndexName, Route, LinkData } from "./types.ts";
export { EDS, MOMENT_KINDS, isEd } from "./types.ts";
export type { Hosts, HostEnv } from "./hosts.ts";
export {
  hostsFromEnv,
  productionHosts,
  workersDevHosts,
  normalizeOrigin,
  validateHosts,
  isIndexableOrigin,
  hostOf,
  LIVE_SUBDOMAIN,
  QUIET_WORKER,
  LIVE_WORKER,
} from "./hosts.ts";
export { momentId, parseMomentId, type ParsedMomentId } from "./moment.ts";
export { ENTITY_PAGE_THRESHOLD, quietHasEntityPage, formatQuiet, parseQuiet } from "./quiet.ts";
export { formatLive, parseLive } from "./live.ts";
export {
  quietPaths,
  livePaths,
  type QuietPaths,
  type LivePaths,
  type QuietShiurOptions,
  type LiveShiurOptions,
  type EntityOptions,
} from "./builders.ts";
export { createLinks, type Links, type HreflangLink, type ParsedSiteUrl } from "./links.ts";
