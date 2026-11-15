/**
 * corpus:build with the W2.1 wiring: @emunas/normalize as the Keyer and the aggregate files
 * (sections, neighbours, series, occasions, years, works, people, concepts, stories, entities)
 * written next to the W1.2 outputs, plus the corpus layer (`.corpus/layer/`, C1.2). Node-only
 * (`@emunas/corpus/build/aggregate`).
 *
 * The layer is read through the allow-listed corpus reader (C1.1). Its warnings go to
 * `layer/layer.json`, never to build-report.json, so the existing outputs do not change. Layer
 * files that are no longer produced (a series or shiur that left the visible set, or the whole
 * layer when the corpus is absent) are removed.
 */
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { buildCorpus, projectCorpus, resolveOutDir, type BuildOptions, type BuildResult } from "../build/build.ts";
import { defaultDataDir, defaultPolicyDir } from "../build/read.ts";
import { createNormalizeKeyer } from "../keyer-normalize.ts";
import { finishLayer, loadLayerInput, prepareLayer, type LayerOutput } from "../layer/build.ts";
import { applyCorpusSuppress, loadCorpusSuppressIds, type CorpusSuppressReport } from "../layer/suppress.ts";
import { LAYER_DIR, type LayerInfo } from "../public/corpus-layer.ts";
import { aggregate, aggregateOutputs, type AggregateResult } from "./aggregate.ts";

export type AggregatedBuildOptions = Omit<BuildOptions, "extraOutputs">;

export interface AggregatedBuildResult extends BuildResult {
  layer: {
    info: LayerInfo;
    /** Files written under `.corpus/layer/` (relative to it). */
    files: string[];
    /** Stale layer files removed. */
    removed: string[];
    /** Time spent reading the corpus input and building the layer. */
    ms: number;
    /** Corpus item ids blanked by `--suppress` / publish-policy `suppress[]`, and those that matched nothing. */
    suppress: CorpusSuppressReport;
  };
}

/** Every `.json` file below `dir`, relative to it. */
function listJson(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".json")) out.push(relative(dir, p).split("\\").join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

/** Build `.corpus/` with normalize keys, the aggregate files and the corpus layer. Aggregate warnings go to build-report. */
export function buildCorpusWithAggregates(opts: AggregatedBuildOptions = {}): AggregatedBuildResult {
  const dataDir = resolve(opts.dataDir ?? defaultDataDir());
  const policyDir = opts.policyDir ?? defaultPolicyDir();
  let layer: LayerOutput | null = null;
  let layerMs = 0;
  let suppress: CorpusSuppressReport = { applied: [], unmatched: [] };
  const suppressIds = loadCorpusSuppressIds({ policyDir, suppressFile: opts.suppressFile });
  const r = buildCorpus({
    ...opts,
    keyer: opts.keyer ?? createNormalizeKeyer(),
    extraOutputs: (corpus) => {
      const t0 = performance.now();
      const prepared = prepareLayer(loadLayerInput({ dataDir, policyDir }), corpus);
      layerMs += performance.now() - t0;
      const a = aggregate({ shiurim: corpus.shiurim, index: corpus.index, sourceWorkIds: prepared.sourceWorkIds });
      corpus.report.warnings.push(...a.warnings);
      const t1 = performance.now();
      layer = finishLayer(prepared);
      if (prepared.state !== null) suppress = applyCorpusSuppress(layer.files, suppressIds);
      layerMs += performance.now() - t1;
      const out = aggregateOutputs(a.files);
      for (const [name, value] of Object.entries(layer.files)) out[`${LAYER_DIR}/${name}`] = value;
      return out;
    },
  });
  const done = layer as LayerOutput | null;
  if (done === null) throw new Error("corpus layer was not built");
  const layerDir = join(resolveOutDir(opts.outDir), LAYER_DIR);
  const keep = new Set(Object.keys(done.files));
  const removed: string[] = [];
  for (const f of listJson(layerDir)) {
    if (keep.has(f)) continue;
    rmSync(join(layerDir, f), { force: true });
    removed.push(f);
  }
  for (const sub of existsSync(layerDir) ? readdirSync(layerDir) : []) {
    const p = join(layerDir, sub);
    if (statSync(p).isDirectory() && readdirSync(p).length === 0) rmSync(p, { recursive: true, force: true });
  }
  const c = done.info.counts;
  opts.log?.(
    done.info.enabled
      ? `corpus layer: ${c.visibleShiurim} visible shiurim, ${c.topics} topics, ${c.concepts} concepts, ${c.people} people, ` +
          `${c.works} works, ${c.stories} stories, ${c.threads} threads, ${c.series} series, ${c.retiredIds} retired ids resolved; ` +
          `${done.info.warnings.length} warnings ` +
          `in ${Math.round(layerMs)} ms`
      : `corpus layer off: ${done.info.warnings.join("; ")}`,
  );
  return { ...r, layer: { info: done.info, files: [...keep].sort(), removed, ms: Math.round(layerMs), suppress } };
}

/** Project with normalize keys, aggregate and build the layer in memory (no file output); for tests and tools. */
export function projectAndAggregate(
  opts: Pick<BuildOptions, "dataDir" | "policyDir" | "suppressFile" | "keyer"> = {},
): ReturnType<typeof projectCorpus> & { aggregates: AggregateResult; layer: LayerOutput; sourceWorkIds: ReadonlyMap<string, string> } {
  const p = projectCorpus({ ...opts, keyer: opts.keyer ?? createNormalizeKeyer() });
  const prepared = prepareLayer(
    loadLayerInput({ dataDir: resolve(opts.dataDir ?? defaultDataDir()), policyDir: opts.policyDir ?? defaultPolicyDir() }),
    p,
  );
  const aggregates = aggregate({ shiurim: p.shiurim, index: p.index, sourceWorkIds: prepared.sourceWorkIds });
  const layer = finishLayer(prepared);
  if (prepared.state !== null) {
    applyCorpusSuppress(layer.files, loadCorpusSuppressIds({ policyDir: opts.policyDir ?? defaultPolicyDir(), suppressFile: opts.suppressFile }));
  }
  return { ...p, aggregates, layer, sourceWorkIds: prepared.sourceWorkIds };
}
