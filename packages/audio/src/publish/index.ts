/** @emunas/audio/publish — Node-only (AWS SDK). */
export {
  buildPublishPlan,
  DEFAULT_DST_BUCKET,
  DEFAULT_SRC_BUCKET,
  formatPlan,
  type IngestLike,
  type PlanOptions,
  type PublishItem,
  type PublishPlan,
  type RefusedItem,
} from "./plan.ts";
export {
  copySource,
  executePlan,
  SOURCE_ETAG_META,
  type ExecuteOptions,
  type ItemOutcome,
  type PublishClients,
  type PublishResult,
  type S3Like,
} from "./execute.ts";
export { DEFAULT_INGEST, loadIngest, makeClients, parseArgs, run, type CliArgs, type RunIo } from "./cli.ts";
