/**
 * `site-policy/publish-policy.json` (confidence thresholds, suppressions) and the guard's
 * `suppress.json` (ids only). A missing publish policy falls back to the defaults of C7; an invalid
 * one is fatal (it is a reviewed, human-edited file).
 */
import { readFileSync } from "node:fs";
import { isPlayableKey, mp3SiblingKey } from "@emunas/audio";
import * as v from "valibot";
import { issueSummary } from "./schemas.ts";
import { readPolicyText } from "./read.ts";

export interface PublishPolicy {
  dropBelow: number;
  softBelow: number;
  /** Item ids (moment ids) a person decided not to publish. */
  suppress: string[];
}

export const DEFAULT_POLICY: PublishPolicy = { dropBelow: 0.6, softBelow: 0.75, suppress: [] };

const IdList = v.array(v.union([v.string(), v.object({ id: v.string() })]));

const PublishPolicySchema = v.object({
  confidence: v.object({
    dropBelow: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
    softBelow: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  }),
  suppress: v.exactOptional(IdList),
});

function ids(list: v.InferOutput<typeof IdList> | undefined): string[] {
  return (list ?? []).map((x) => (typeof x === "string" ? x : x.id));
}

export function loadPublishPolicy(policyDir: string): PublishPolicy {
  const text = readPolicyText(policyDir, "publish-policy.json");
  if (text === null) return { ...DEFAULT_POLICY };
  const r = v.safeParse(PublishPolicySchema, JSON.parse(text));
  if (!r.success) throw new Error(`site-policy/publish-policy.json invalid: ${issueSummary(r.issues).join("; ")}`);
  const { dropBelow, softBelow } = r.output.confidence;
  if (softBelow < dropBelow) throw new Error("site-policy/publish-policy.json: softBelow < dropBelow");
  return { dropBelow, softBelow, suppress: ids(r.output.suppress) };
}

const AudioTranscodedSchema = v.object({
  policyVersion: v.literal(1),
  mp3Siblings: v.array(v.string()),
});

/**
 * `site-policy/audio-transcoded.json`: original (non-mp3) bucket keys that have an MP3 transcode
 * next to them (same key, `.mp3`), written by `packages/audio/scripts/transcode-wma.ts`. Missing →
 * none; invalid, an `.mp3` key or a key that may not become a URL → fatal (reviewed file).
 */
export function loadAudioTranscoded(policyDir: string): string[] {
  const text = readPolicyText(policyDir, "audio-transcoded.json");
  if (text === null) return [];
  const r = v.safeParse(AudioTranscodedSchema, JSON.parse(text));
  if (!r.success) throw new Error(`site-policy/audio-transcoded.json invalid: ${issueSummary(r.issues).join("; ")}`);
  r.output.mp3Siblings.forEach((key, i) => {
    if (mp3SiblingKey(key) === null) {
      throw new Error(`site-policy/audio-transcoded.json: mp3Siblings[${i}] is not a non-mp3 audio key with an extension`);
    }
  });
  return [...new Set(r.output.mp3Siblings)];
}

const Day = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/));
const NonEmpty = v.pipe(v.string(), v.trim(), v.minLength(1));

const AudioCleanedSchema = v.strictObject({
  policyVersion: v.literal(1),
  rejected: v.array(v.strictObject({ key: v.string(), reason: NonEmpty, reviewedBy: NonEmpty, reviewedAt: Day })),
});

export interface AudioCleanedRejection {
  /** Served key (`servedKey()`, the `.mp3` key that is linked) whose improved copy was rejected. */
  key: string;
  reason: string;
  reviewedBy: string;
  reviewedAt: string;
}

export interface AudioCleanedPolicy {
  rejected: AudioCleanedRejection[];
}

/**
 * `site-policy/audio-cleaned.json`: the served keys whose AI-improved copy (`fixed/sidon/<key>`) was
 * rejected after a person listened to it. Every other playable recording links its improved copy.
 * Missing → no rejections. Invalid, an incomplete entry, a key that is not a playable `.mp3` key or
 * a key listed twice → fatal (reviewed file). That each key belongs to a known recording is checked
 * by the build, which has the ingest.
 */
export function loadAudioCleaned(policyDir: string): AudioCleanedPolicy {
  const text = readPolicyText(policyDir, "audio-cleaned.json");
  if (text === null) return { rejected: [] };
  const r = v.safeParse(AudioCleanedSchema, JSON.parse(text));
  if (!r.success) throw new Error(`site-policy/audio-cleaned.json invalid: ${issueSummary(r.issues).join("; ")}`);
  const seen = new Set<string>();
  r.output.rejected.forEach((e, i) => {
    if (!isPlayableKey(e.key)) throw new Error(`site-policy/audio-cleaned.json: rejected[${i}].key is not a playable .mp3 key`);
    if (seen.has(e.key)) throw new Error(`site-policy/audio-cleaned.json: rejected[${i}].key is listed twice`);
    seen.add(e.key);
  });
  return { rejected: r.output.rejected.map((e) => ({ ...e })) };
}

const SuppressFileSchema = v.union([
  IdList,
  v.object({ ids: IdList }),
  v.object({ suppress: IdList }),
  v.object({ items: IdList }),
]);

/**
 * Read a suppress file from the guard pre-pass. Accepted shapes: `["id", …]`, `[{id}, …]`, or an
 * object with an `ids`, `suppress` or `items` array of those. Only ids are read.
 */
export function loadSuppressFile(path: string): string[] {
  const r = v.safeParse(SuppressFileSchema, JSON.parse(readFileSync(path, "utf8")));
  if (!r.success) throw new Error(`${path}: not a suppress list (${issueSummary(r.issues).join("; ")})`);
  const o = r.output;
  if (Array.isArray(o)) return ids(o);
  if ("ids" in o) return ids(o.ids);
  if ("suppress" in o) return ids(o.suppress);
  return ids(o.items);
}
