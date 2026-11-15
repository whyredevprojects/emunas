/**
 * `site-policy/publish-policy.json` (confidence thresholds, suppressions) and the guard's
 * `suppress.json` (ids only). A missing publish policy falls back to the defaults of C7; an invalid
 * one is fatal (it is a reviewed, human-edited file).
 */
import { readFileSync } from "node:fs";
import { mp3SiblingKey } from "@emunas/audio";
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
