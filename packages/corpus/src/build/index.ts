/**
 * `@emunas/corpus/build`: Node-only build tooling. Apps never import this (ESLint enforces it);
 * they read `.corpus/` and `@emunas/corpus/public`.
 */
export { buildCorpus, projectCorpus, resolveOutDir, toJson } from "./build.ts";
export type { BuildOptions, BuildResult, ProjectedCorpus } from "./build.ts";
export { gate, structuralProblems } from "./gate.ts";
export type { GateResult } from "./gate.ts";
export { identitySlugKeyer, foldForKey, slugKey } from "./keyer.ts";
export type { KeyKind, KeyResult, Keyer } from "./keyer.ts";
export { FatalDataError, loadCatalogs, loadIngest, loadManifest, loadShiurFiles } from "./load.ts";
export type { Catalogs, ShiurFiles } from "./load.ts";
export { DEFAULT_POLICY, loadPublishPolicy, loadSuppressFile } from "./policy.ts";
export type { PublishPolicy } from "./policy.ts";
export { PROJECTOR_VERSION, projectShiur, splitCatalogTopics } from "./project.ts";
export type { ProjectContext, ProjectInput } from "./project.ts";
export {
  DATA_ALLOW_LIST,
  ForbiddenPathError,
  POLICY_ALLOW_LIST,
  REPO_ROOT,
  createDataReader,
  defaultDataDir,
  defaultPolicyDir,
  readPolicyText,
} from "./read.ts";
export type { DataReader } from "./read.ts";
export { ReportCollector } from "./report.ts";
export type { BuildReport, DowngradeEntry, TimeWarning } from "./report.ts";
export { TimeModel, mergeRanges } from "./time.ts";
export type { RecTime, Span, SpanResult } from "./time.ts";
export * as schemas from "./schemas.ts";
