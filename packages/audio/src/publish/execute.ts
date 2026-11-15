/**
 * Executes a publish plan with server-side S3 `CopyObject` (no bytes pass
 * through the runner). Idempotent: an object already in the destination with the
 * same size and the same ETag (or the source ETag recorded in its metadata at
 * copy time) is skipped.
 */
import {
  CopyObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type HeadObjectCommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";
import { AUDIO_CACHE_CONTROL, AUDIO_CONTENT_TYPE } from "../constants.ts";
import { refuseSourceKey } from "../keys.ts";
import type { PublishItem, PublishPlan } from "./plan.ts";

/** Only `send` is used, so tests can pass a mock. */
export type S3Like = Pick<S3Client, "send">;

export interface PublishClients {
  /** Credentials that can read the private source bucket. */
  src: S3Like;
  /** Credentials that can write the destination bucket (and read the source, which R2 CopyObject requires). */
  dst: S3Like;
}

export type ItemOutcome =
  | { id: string; status: "copied" }
  | { id: string; status: "skipped" }
  | { id: string; status: "failed"; error: string };

export interface PublishResult {
  copied: number;
  skipped: number;
  failed: number;
  refused: number;
  outcomes: ItemOutcome[];
  /** Destination keys not in the plan (reported, never deleted). Only when `checkExtraneous`. */
  extraneous: string[];
}

export interface ExecuteOptions {
  concurrency?: number;
  log?: (line: string) => void;
  /** List the destination afterwards and report keys the plan does not contain. */
  checkExtraneous?: boolean;
}

const DEST_KEY_RE = /^[a-z0-9-]+\.mp3$/;
export const SOURCE_ETAG_META = "source-etag";

function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return e.name === "NotFound" || e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404;
}

async function headOrNull(client: S3Like, bucket: string, key: string): Promise<HeadObjectCommandOutput | null> {
  try {
    return await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** `CopySource` is `bucket/key` with each key segment URL-encoded. */
export function copySource(bucket: string, key: string): string {
  return `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function normEtag(e: string | undefined): string | undefined {
  return e?.replace(/^W\//, "").replace(/^"|"$/g, "");
}

async function publishOne(item: PublishItem, plan: PublishPlan, clients: PublishClients): Promise<ItemOutcome> {
  // Defence in depth: the plan already filtered these, but never copy a bad key.
  const refusal = refuseSourceKey(item.sourceKey);
  if (refusal) return { id: item.id, status: "failed", error: `refused source key (${refusal})` };
  if (!DEST_KEY_RE.test(item.destKey)) return { id: item.id, status: "failed", error: "invalid destination key" };

  const src = await headOrNull(clients.src, plan.srcBucket, item.sourceKey);
  if (src === null) return { id: item.id, status: "failed", error: "source object not found" };
  const srcEtag = normEtag(src.ETag);
  const srcSize = src.ContentLength;

  const dst = await headOrNull(clients.dst, plan.dstBucket, item.destKey);
  if (dst !== null && srcSize !== undefined && dst.ContentLength === srcSize && srcEtag !== undefined) {
    const dstEtag = normEtag(dst.ETag);
    const recorded = dst.Metadata?.[SOURCE_ETAG_META];
    if (dstEtag === srcEtag || recorded === srcEtag) return { id: item.id, status: "skipped" };
  }

  await clients.dst.send(
    new CopyObjectCommand({
      Bucket: plan.dstBucket,
      Key: item.destKey,
      CopySource: copySource(plan.srcBucket, item.sourceKey),
      ...(src.ETag ? { CopySourceIfMatch: src.ETag } : {}),
      MetadataDirective: "REPLACE",
      ContentType: AUDIO_CONTENT_TYPE,
      CacheControl: AUDIO_CACHE_CONTROL,
      Metadata: { [SOURCE_ETAG_META]: srcEtag ?? "", "recording-id": item.id },
    }),
  );
  return { id: item.id, status: "copied" };
}

async function listAllKeys(client: S3Like, bucket: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ...(token ? { ContinuationToken: token } : {}) }),
    );
    for (const o of page.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

export async function executePlan(
  plan: PublishPlan,
  clients: PublishClients,
  options: ExecuteOptions = {},
): Promise<PublishResult> {
  const log = options.log ?? (() => {});
  const concurrency = Math.max(1, Math.min(32, options.concurrency ?? 8));
  const outcomes: ItemOutcome[] = new Array<ItemOutcome>(plan.items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      const item = plan.items[i];
      if (item === undefined) return;
      let outcome: ItemOutcome;
      try {
        outcome = await publishOne(item, plan, clients);
      } catch (err) {
        outcome = { id: item.id, status: "failed", error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
      }
      outcomes[i] = outcome;
      log(`${outcome.status.padEnd(7)} ${item.id}${outcome.status === "failed" ? `  ${outcome.error}` : ""}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  let extraneous: string[] = [];
  if (options.checkExtraneous) {
    const planned = new Set(plan.items.map((it) => it.destKey));
    extraneous = (await listAllKeys(clients.dst, plan.dstBucket)).filter((k) => !planned.has(k)).sort();
    for (const k of extraneous) log(`EXTRA   ${k}  (in ${plan.dstBucket} but not in the plan; not deleted)`);
  }

  const count = (s: ItemOutcome["status"]) => outcomes.filter((o) => o.status === s).length;
  return {
    copied: count("copied"),
    skipped: count("skipped"),
    failed: count("failed"),
    refused: plan.refused.length,
    outcomes,
    extraneous,
  };
}
