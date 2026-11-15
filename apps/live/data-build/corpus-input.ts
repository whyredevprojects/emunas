/**
 * Reads the `.corpus/` outputs the Live emit needs (integration-plan §5.1): `build.json`,
 * `index.json`, `shiurim/<id>.json`, the W2.1 aggregate files and `updated.json`. Node only.
 *
 * Apps read `.corpus/` and never `data/` (C3). Nothing here opens a pipeline file.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AGGREGATE_FILES, type Aggregates } from "@emunas/corpus/aggregate";
import type { BuildInfo, CorpusIndex, PublicShiur } from "@emunas/corpus/public";

export interface CorpusInput {
  info: BuildInfo;
  index: CorpusIndex;
  /** In index.json (catalog) order. */
  shiurim: PublicShiur[];
  aggregates: Aggregates;
  /** Manifest `updatedAt` per full shiur (`.corpus/updated.json`); empty when the file is absent. */
  updatedAt: Record<string, string>;
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
  return { info, index, shiurim, aggregates, updatedAt };
}
