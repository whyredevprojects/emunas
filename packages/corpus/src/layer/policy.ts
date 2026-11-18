/**
 * `site-policy/corpus-policy.json`: the owner's decisions for the corpus layer (corpus-wave-plan §2). Defaults live here; the shipped file repeats them. A missing file means the defaults; an
 * invalid file is fatal, since it is a reviewed, human-edited file. Every key is optional (a missing
 * key takes its default) but an unknown key is an error, so a misspelt switch cannot be silently
 * ignored. Flipping a decision is a one-line edit plus a rebuild.
 */
import { createHash } from "node:crypto";
import * as v from "valibot";
import { issueSummary } from "../build/schemas.ts";
import { readPolicyText } from "../build/read.ts";

export const CORPUS_POLICY_FILE = "corpus-policy.json";

export interface CorpusPolicy {
  policyVersion: 1;
  /** D1. ASR variants in search: never. `true` fails the build. */
  search: { asrVariants: false };
  /** D2, D5. */
  people: {
    other: { pages: boolean; quietLineMinShiurim: number; liveListed: boolean };
    excludeFamily: boolean;
    /** Matched (case-insensitive) against the person's own `nameEn` and `aliases`. */
    familyPattern: string;
    excludeIds: string[];
  };
  /** D3. */
  threads: { pageMinShiurim: number; twoMember: "inline-line" | "none"; timelineMinDated: number };
  /** D6. */
  visibility: { followCategoryVisibility: boolean };
  /** D7. */
  featured: { maxOtherSpeakerShare: number; excludeTopicIds: string[] };
  /** D8. */
  live: { threadPagesIndexable: boolean };
  /** D9. */
  unknownVersion: "warn" | "fail";
  /** D10. A "one in N" value means "above 1/N of the visible shiurim". */
  thresholds: {
    quiet: {
      topicGatewayAbove: number;
      conceptPageMin: number;
      conceptPassimOneIn: number;
      personPageMin: number;
      personAllListMin: number;
      workPageMin: number;
      storyPageMinTellings: number;
    };
    live: {
      personPageMin: number;
      conceptPageMin: number;
      conceptFacetDropOneIn: number;
      workPageMin: number;
      storyPageMinTellings: number;
    };
  };
  /** D11. */
  occasionTopic: { minShare: number; minSalience: number };
}

export const DEFAULT_CORPUS_POLICY: CorpusPolicy = {
  policyVersion: 1,
  search: { asrVariants: false },
  people: {
    other: { pages: false, quietLineMinShiurim: 3, liveListed: false },
    excludeFamily: true,
    familyPattern: "\\bthe Mashgiach'?s\\b",
    excludeIds: [],
  },
  threads: { pageMinShiurim: 3, twoMember: "inline-line", timelineMinDated: 3 },
  visibility: { followCategoryVisibility: true },
  featured: { maxOtherSpeakerShare: 0.5, excludeTopicIds: [] },
  live: { threadPagesIndexable: false },
  unknownVersion: "warn",
  thresholds: {
    quiet: {
      topicGatewayAbove: 150,
      conceptPageMin: 5,
      conceptPassimOneIn: 7,
      personPageMin: 3,
      personAllListMin: 100,
      workPageMin: 2,
      storyPageMinTellings: 2,
    },
    live: {
      personPageMin: 3,
      conceptPageMin: 3,
      conceptFacetDropOneIn: 4,
      workPageMin: 3,
      storyPageMinTellings: 2,
    },
  },
  occasionTopic: { minShare: 0.5, minSalience: 0.6 },
};

const count = v.pipe(v.number(), v.integer(), v.minValue(0));
const posInt = v.pipe(v.number(), v.integer(), v.minValue(1));
const share = v.pipe(v.number(), v.minValue(0), v.maxValue(1));
const slug = v.pipe(v.string(), v.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/));
const opt = <S extends v.GenericSchema>(s: S) => v.exactOptional(s);

const PolicySchema = v.strictObject({
  $comment: opt(v.string()),
  policyVersion: v.literal(1),
  search: opt(
    v.strictObject({
      asrVariants: opt(
        v.literal(false, "search.asrVariants must stay false: ASR variants need the evaluated server-side boost (Live I.13)"),
      ),
    }),
  ),
  people: opt(
    v.strictObject({
      other: opt(v.strictObject({ pages: opt(v.boolean()), quietLineMinShiurim: opt(count), liveListed: opt(v.boolean()) })),
      excludeFamily: opt(v.boolean()),
      familyPattern: opt(v.pipe(v.string(), v.minLength(1))),
      excludeIds: opt(v.array(slug)),
    }),
  ),
  threads: opt(
    v.strictObject({
      pageMinShiurim: opt(v.pipe(v.number(), v.integer(), v.minValue(2))),
      twoMember: opt(v.picklist(["inline-line", "none"])),
      timelineMinDated: opt(count),
    }),
  ),
  visibility: opt(v.strictObject({ followCategoryVisibility: opt(v.boolean()) })),
  featured: opt(v.strictObject({ maxOtherSpeakerShare: opt(share), excludeTopicIds: opt(v.array(slug)) })),
  live: opt(v.strictObject({ threadPagesIndexable: opt(v.boolean()) })),
  unknownVersion: opt(v.picklist(["warn", "fail"])),
  thresholds: opt(
    v.strictObject({
      quiet: opt(
        v.strictObject({
          topicGatewayAbove: opt(count),
          conceptPageMin: opt(count),
          conceptPassimOneIn: opt(posInt),
          personPageMin: opt(count),
          personAllListMin: opt(count),
          workPageMin: opt(count),
          storyPageMinTellings: opt(count),
        }),
      ),
      live: opt(
        v.strictObject({
          personPageMin: opt(count),
          conceptPageMin: opt(count),
          conceptFacetDropOneIn: opt(posInt),
          workPageMin: opt(count),
          storyPageMinTellings: opt(count),
        }),
      ),
    }),
  ),
  occasionTopic: opt(v.strictObject({ minShare: opt(share), minSalience: opt(share) })),
});

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);

/** Deep merge of a validated partial over the defaults (arrays and scalars replace). */
function merge(base: unknown, over: unknown): unknown {
  if (!isObj(base) || !isObj(over)) return over === undefined ? structuredClone(base) : structuredClone(over);
  const out: Obj = {};
  for (const k of Object.keys(base)) out[k] = merge(base[k], over[k]);
  return out;
}

export class CorpusPolicyError extends Error {
  constructor(message: string) {
    super(`site-policy/${CORPUS_POLICY_FILE} invalid: ${message}`);
    this.name = "CorpusPolicyError";
  }
}

/** Validate a parsed policy document; throws CorpusPolicyError. */
export function parseCorpusPolicy(json: unknown): CorpusPolicy {
  const r = v.safeParse(PolicySchema, json);
  if (!r.success) throw new CorpusPolicyError(issueSummary(r.issues).join("; "));
  const policy = merge(DEFAULT_CORPUS_POLICY, r.output) as CorpusPolicy;
  try {
    familyRegExp(policy);
  } catch {
    throw new CorpusPolicyError(`people.familyPattern is not a valid regular expression`);
  }
  return policy;
}

/** Read `site-policy/corpus-policy.json`. Missing → defaults; invalid → CorpusPolicyError. */
export function loadCorpusPolicy(policyDir: string): CorpusPolicy {
  const text = readPolicyText(policyDir, CORPUS_POLICY_FILE);
  if (text === null) return structuredClone(DEFAULT_CORPUS_POLICY);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new CorpusPolicyError("not valid JSON");
  }
  return parseCorpusPolicy(json);
}

/** The family rule (D5) as a regular expression, case-insensitive. */
export function familyRegExp(policy: Pick<CorpusPolicy, "people">): RegExp {
  return new RegExp(policy.people.familyPattern, "iu");
}

/** Stable short hash of the effective policy (for `layer.json`). */
export function corpusPolicyHash(policy: CorpusPolicy): string {
  return createHash("sha256").update(JSON.stringify(policy)).digest("hex").slice(0, 12);
}
