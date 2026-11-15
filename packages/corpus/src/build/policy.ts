/**
 * `site-policy/publish-policy.json` (confidence thresholds, suppressions) and the guard's
 * `suppress.json` (ids only). A missing publish policy falls back to the defaults of C7; an invalid
 * one is fatal (it is a reviewed, human-edited file).
 */
import { readFileSync } from "node:fs";
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
