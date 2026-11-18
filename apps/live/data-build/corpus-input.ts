/**
 * Reads the `.corpus/` outputs the Live emit needs (integration-plan §5.1): `build.json`,
 * `index.json`, `shiurim/<id>.json`, the W2.1 aggregate files, `updated.json` and the corpus
 * layer (`layer/`, C1.2; `layer-input.ts`). Node only.
 *
 * Apps read `.corpus/` and never `data/` (C3). Nothing here opens a pipeline file.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AGGREGATE_FILES, type Aggregates } from "@emunas/corpus/aggregate";
import type { BuildInfo, CorpusIndex, PublicShiur } from "@emunas/corpus/public";
import { DEFAULT_FEATURED, type FeaturedPolicy } from "./emit-corpus.ts";
import { readLayerInput, type LayerInput } from "./layer-input.ts";

export interface CorpusInput {
  info: BuildInfo;
  index: CorpusIndex;
  /** In index.json (catalog) order. */
  shiurim: PublicShiur[];
  aggregates: Aggregates;
  /** Manifest `updatedAt` per full shiur (`.corpus/updated.json`); empty when the file is absent. */
  updatedAt: Record<string, string>;
  /** The corpus layer (`.corpus/layer/`, C1.2); required. */
  layer: LayerInput;
}

export class CorpusInputError extends Error {
  override name = "CorpusInputError";
}

function readJson<T>(path: string): T {
  if (!existsSync(path)) throw new CorpusInputError(`${path} not found: run corpus:build first`);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readCorpusInput(corpusDir: string): CorpusInput {
  const info = readJson<BuildInfo>(join(corpusDir, "build.json"));
  const index = readJson<CorpusIndex>(join(corpusDir, "index.json"));
  if (index.schemaVersion !== info.schemaVersion) {
    throw new CorpusInputError(`index.json schema ${index.schemaVersion} != build.json schema ${info.schemaVersion}`);
  }
  const shiurim = index.shiurim.map((r) => readJson<PublicShiur>(join(corpusDir, "shiurim", `${r.id}.json`)));
  const aggregates = Object.fromEntries(
    Object.entries(AGGREGATE_FILES).map(([k, file]) => [k, readJson<unknown>(join(corpusDir, file))]),
  ) as unknown as Aggregates;
  const updatedPath = join(corpusDir, "updated.json");
  const updatedAt = existsSync(updatedPath)
    ? (readJson<{ updatedAt?: Record<string, string> }>(updatedPath).updatedAt ?? {})
    : {};
  const layer = readLayerInput(corpusDir, shiurim.filter((s) => s.status === "full").map((s) => s.id));
  return { info, index, shiurim, aggregates, updatedAt, layer };
}

/**
 * The featured-slot part of `site-policy/corpus-policy.json` (D7): `featured.maxOtherSpeakerShare`
 * and `featured.excludeTopicIds`. A missing file or key means the shipped defaults; a present but
 * malformed value fails (the file is reviewed and human-edited, like the rest of the policy, which
 * corpus:build validates in full).
 */
export function readFeaturedPolicy(policyDir: string): FeaturedPolicy {
  const path = join(policyDir, "corpus-policy.json");
  if (!existsSync(path)) return DEFAULT_FEATURED;
  const json = JSON.parse(readFileSync(path, "utf8")) as { featured?: unknown };
  const f = json.featured;
  if (f === undefined) return DEFAULT_FEATURED;
  if (typeof f !== "object" || f === null) throw new CorpusInputError(`${path}: featured is not an object`);
  const { maxOtherSpeakerShare, excludeTopicIds } = f as Record<string, unknown>;
  const share = maxOtherSpeakerShare ?? DEFAULT_FEATURED.maxOtherSpeakerShare;
  const ids = excludeTopicIds ?? DEFAULT_FEATURED.excludeTopicIds;
  if (typeof share !== "number" || !(share >= 0 && share <= 1)) throw new CorpusInputError(`${path}: featured.maxOtherSpeakerShare must be in [0, 1]`);
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) throw new CorpusInputError(`${path}: featured.excludeTopicIds must be a list of topic ids`);
  return { maxOtherSpeakerShare: share, excludeTopicIds: [...(ids as string[])] };
}
