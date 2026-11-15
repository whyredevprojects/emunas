/**
 * corpus:build with the W2.1 wiring: @emunas/normalize as the Keyer and the aggregate files
 * (sections, neighbours, series, occasions, years, works, people, concepts, stories, entities)
 * written next to the W1.2 outputs. Node-only (`@emunas/corpus/build/aggregate`).
 */
import { buildCorpus, projectCorpus, type BuildOptions, type BuildResult } from "../build/build.ts";
import { createNormalizeKeyer } from "../keyer-normalize.ts";
import { aggregate, aggregateOutputs, type AggregateResult } from "./aggregate.ts";

export type AggregatedBuildOptions = Omit<BuildOptions, "extraOutputs">;

/** Build `.corpus/` with normalize keys and the aggregate files. Aggregate warnings go to build-report. */
export function buildCorpusWithAggregates(opts: AggregatedBuildOptions = {}): BuildResult {
  return buildCorpus({
    ...opts,
    keyer: opts.keyer ?? createNormalizeKeyer(),
    extraOutputs: (corpus) => {
      const r = aggregate({ shiurim: corpus.shiurim, index: corpus.index });
      corpus.report.warnings.push(...r.warnings);
      return aggregateOutputs(r.files);
    },
  });
}

/** Project with normalize keys and aggregate in memory (no file output); for tests and tools. */
export function projectAndAggregate(
  opts: Pick<BuildOptions, "dataDir" | "policyDir" | "suppressFile" | "keyer"> = {},
): ReturnType<typeof projectCorpus> & { aggregates: AggregateResult } {
  const p = projectCorpus({ ...opts, keyer: opts.keyer ?? createNormalizeKeyer() });
  return { ...p, aggregates: aggregate({ shiurim: p.shiurim, index: p.index }) };
}
