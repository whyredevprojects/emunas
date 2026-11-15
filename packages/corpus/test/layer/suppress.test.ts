/**
 * C1.3: corpus-layer suppression (`corpus:build --suppress` with `corpus:` item ids) blanks exactly
 * the listed generated field; the entity, its counts, links and page flags stay.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCorpusWithAggregates, projectAndAggregate } from "../../src/aggregate/build.ts";
import {
  applyCorpusSuppress,
  corpusItemId,
  isCorpusItemId,
  loadCorpusSuppressIds,
  parseCorpusItemId,
} from "../../src/layer/suppress.ts";
import {
  LAYER_FILES,
  type LayerConceptsFile,
  type LayerInfo,
  type LayerSeries,
  type LayerStoriesFile,
  type LayerThreadsFile,
  type LayerTopicsFile,
} from "../../src/public/corpus-layer.ts";
import { MINI_DATA, MINI_POLICY, readJson, tmp } from "../helpers.ts";

const base = projectAndAggregate({ dataDir: MINI_DATA, policyDir: MINI_POLICY }).layer.files;
const withSeries = (files: Record<string, unknown>): Record<string, unknown> => ({ ...files, [`${LAYER_FILES.seriesDir}/synthetic-series.json`]: structuredClone(SERIES) });
const clone = (): Record<string, unknown> => withSeries(structuredClone(base));

const story = (base[LAYER_FILES.stories] as LayerStoriesFile).stories.find((s) => s.retelling.en !== "" && s.retelling.yi !== "")!;
const thread = (base[LAYER_FILES.threads] as LayerThreadsFile).threads[0];
const topic = (base[LAYER_FILES.topics] as LayerTopicsFile).detail.find((d) => d.description !== null);
const concept = (base[LAYER_FILES.concepts] as LayerConceptsFile).concepts[0];
/** The mini corpus has no series with a visible part, so the series case uses a synthetic file of the layer's shape. */
const SERIES: LayerSeries = {
  seriesId: "synthetic-series",
  title: { en: "A series", yi: "א סעריע" },
  overview: { en: "How the series builds.", yi: "ווי די סעריע בויט." },
  keyThemes: [{ en: "First theme", yi: "ערשטע טעמע" }, { en: "Second theme", yi: "צווייטע טעמע" }],
  arc: [
    { shiurId: "yi-synthetic-01", part: 1, oneLiner: { en: "Part one.", yi: "טייל איינס." } },
    { shiurId: "yi-synthetic-02", part: 2, oneLiner: { en: "Part two.", yi: "טייל צוויי." } },
  ],
  missing: [3],
  reviewed: false,
};
const seriesKey = `${LAYER_FILES.seriesDir}/${SERIES.seriesId}.json`;

/** Paths (dotted) of every leaf that differs between two JSON values. */
function diffPaths(a: unknown, b: unknown, path = ""): string[] {
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return Object.is(a, b) ? [] : [path];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].flatMap((k) => diffPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path === "" ? k : `${path}.${k}`));
}

function diffFiles(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...names].sort().flatMap((n) => diffPaths(before[n], after[n]).map((p) => `${n}:${p}`));
}

describe("corpus item ids", () => {
  it("round-trip and reject other ids", () => {
    const ref = { kind: "series", entityId: "tanya-yi", field: "arc.yi-tanya-1-01", lang: "yi" } as const;
    expect(corpusItemId(ref)).toBe("corpus:series:tanya-yi#arc.yi-tanya-1-01.yi");
    expect(parseCorpusItemId(corpusItemId(ref))).toEqual(ref);
    expect(parseCorpusItemId("corpus:story:a-b#retelling.en")).toEqual({ kind: "story", entityId: "a-b", field: "retelling", lang: "en" });
    expect(parseCorpusItemId("corpus:series:s#keyThemes.3.en")).toMatchObject({ field: "keyThemes.3", lang: "en" });
    expect(parseCorpusItemId("yi-tanya-1-01~st3")).toBeNull();
    expect(parseCorpusItemId("corpus:person:x#aliases.en")).toBeNull();
    expect(parseCorpusItemId("corpus:story:x#retelling")).toBeNull();
    expect(isCorpusItemId("corpus:story:x#retelling.en")).toBe(true);
    expect(isCorpusItemId("yi-tanya-1-01~st3")).toBe(false);
  });
});

describe("applyCorpusSuppress", () => {
  it("fixture has every kind of corpus text", () => {
    expect(story).toBeDefined();
    expect(thread).toBeDefined();
    expect(topic).toBeDefined();
    expect(concept).toBeDefined();
    expect(Object.keys(base).some((k) => k.startsWith(`${LAYER_FILES.seriesDir}/`))).toBe(false);
  });

  it("blanks only the listed story field and keeps the entity, its tellings and page flags", () => {
    const files = clone();
    const id = `corpus:story:${story.id}#retelling.en`;
    const r = applyCorpusSuppress(files, [id, "yi-tanya-1-01~st0"]);
    expect(r).toEqual({ applied: [id], unmatched: [] });
    const after = (files[LAYER_FILES.stories] as LayerStoriesFile).stories.find((s) => s.id === story.id)!;
    expect(after.retelling.en).toBe("");
    expect(after.retelling.yi).toBe(story.retelling.yi);
    expect(after.title).toEqual(story.title);
    expect(after.tellings).toEqual(story.tellings);
    expect(after.pages).toEqual(story.pages);
    const changed = diffFiles(withSeries(base), files);
    const idx = (base[LAYER_FILES.stories] as LayerStoriesFile).stories.indexOf(story);
    expect(changed.filter((p) => !p.startsWith(`${LAYER_FILES.layer}:warnings`))).toEqual([`${LAYER_FILES.stories}:stories.${idx}.retelling.en`]);
    const warnings = (files[LAYER_FILES.layer] as LayerInfo).warnings;
    expect(warnings.filter((w) => w.includes(id))).toHaveLength(1);
    // The base (unsuppressed) build is untouched.
    expect((base[LAYER_FILES.stories] as LayerStoriesFile).stories.find((s) => s.id === story.id)!.retelling.en).not.toBe("");
  });

  it("blanks thread, topic, concept and series fields by id", () => {
    const files = clone();
    const series = files[seriesKey] as LayerSeries;
    const sid = series.seriesId;
    const arc0 = series.arc[0]!;
    const ids = [
      `corpus:thread:${thread!.id}#summary.yi`,
      `corpus:topic:${topic!.id}#description.en`,
      `corpus:concept:${concept!.id}#definition.en`,
      `corpus:concept:${concept!.id}#label.yi`,
      `corpus:series:${sid}#overview.en`,
      `corpus:series:${sid}#keyThemes.0.yi`,
      `corpus:series:${sid}#arc.${arc0.shiurId}.en`,
    ];
    const r = applyCorpusSuppress(files, ids);
    expect(r.unmatched).toEqual([]);
    expect(r.applied).toEqual([...ids].sort());
    expect((files[LAYER_FILES.threads] as LayerThreadsFile).threads.find((t) => t.id === thread!.id)!.summary.yi).toBe("");
    expect((files[LAYER_FILES.topics] as LayerTopicsFile).detail.find((d) => d.id === topic!.id)!.description!.en).toBe("");
    const c = (files[LAYER_FILES.concepts] as LayerConceptsFile).concepts.find((x) => x.id === concept!.id)!;
    expect(c.definition.en).toBe("");
    expect(c.label.yi).toBe("");
    expect(c.label.en).toBe(concept!.label.en);
    expect(series.overview.en).toBe("");
    expect(series.keyThemes[0]!.yi).toBe("");
    expect(series.arc[0]!.oneLiner.en).toBe("");
    expect(series.arc[0]!.oneLiner.yi).toBe(arc0.oneLiner.yi);
    expect(diffFiles(withSeries(base), files).filter((p) => !p.startsWith(`${LAYER_FILES.layer}:`))).toHaveLength(ids.length);
  });

  it("reports ids that match no field and changes nothing for them", () => {
    const files = clone();
    const ids = [
      "corpus:story:no-such-story#retelling.en",
      `corpus:story:${story.id}#people.en`,
      `corpus:story:${story.id}#retelling.fr`,
      "corpus:series:no-such-series#overview.en",
      "corpus:story:bad id",
    ];
    const r = applyCorpusSuppress(files, ids);
    expect(r.applied).toEqual([]);
    expect(r.unmatched).toEqual([...ids].sort());
    expect(diffFiles(withSeries(base), files).every((p) => p.startsWith(`${LAYER_FILES.layer}:warnings`))).toBe(true);
  });

  it("reads corpus ids from the publish policy and the suppress file, ignoring moment ids", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "publish-policy.json"),
      JSON.stringify({ confidence: { dropBelow: 0.6, softBelow: 0.75 }, suppress: [{ id: "corpus:topic:t#description.en", reason: "x" }, "yi-a~kp0"] }),
    );
    const file = join(dir, "suppress.json");
    writeFileSync(file, JSON.stringify({ suppress: [{ id: "corpus:story:s#title.yi", reason: "verbatim-run" }, { id: "yi-b~i1" }] }));
    expect(loadCorpusSuppressIds({ policyDir: dir, suppressFile: file })).toEqual(["corpus:story:s#title.yi", "corpus:topic:t#description.en"]);
    expect(loadCorpusSuppressIds({ policyDir: dir })).toEqual(["corpus:topic:t#description.en"]);
  });
});

describe("corpus:build --suppress", () => {
  const listJson = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? listJson(join(dir, f)).map((x) => `${f}/${x}`) : [f]));

  it("the rebuild blanks only that field, and the id is not reported as an unmatched moment", () => {
    const plain = join(tmp(), "out");
    buildCorpusWithAggregates({ dataDir: MINI_DATA, policyDir: MINI_POLICY, outDir: plain, dataSha: null });
    const out = join(tmp(), "out");
    const id = `corpus:story:${story.id}#retelling.en`;
    const file = join(tmp(), "suppress.json");
    writeFileSync(file, JSON.stringify({ version: 1, suppress: [{ id, reason: "verbatim-run", shiurId: story.tellings[0]!.shiurId, fields: ["x"], runLength: 20 }] }));
    const r = buildCorpusWithAggregates({ dataDir: MINI_DATA, policyDir: MINI_POLICY, outDir: out, dataSha: null, suppressFile: file });
    expect(r.layer.suppress).toEqual({ applied: [id], unmatched: [] });
    expect(r.report.suppressUnmatched).toEqual([]);

    const layerPlain = join(plain, "layer");
    const layerOut = join(out, "layer");
    const names = listJson(layerOut).sort();
    expect(names).toEqual(listJson(layerPlain).sort());
    const differing = names.filter((n) => readFileSync(join(layerOut, n), "utf8") !== readFileSync(join(layerPlain, n), "utf8"));
    expect(differing).toEqual([LAYER_FILES.layer, LAYER_FILES.stories]);
    const before = readJson<LayerStoriesFile>(join(layerPlain, LAYER_FILES.stories));
    const after = readJson<LayerStoriesFile>(join(layerOut, LAYER_FILES.stories));
    const idx = before.stories.findIndex((s) => s.id === story.id);
    expect(diffPaths(before, after)).toEqual([`stories.${idx}.retelling.en`]);
    expect(readJson<LayerInfo>(join(layerOut, LAYER_FILES.layer)).warnings).toContain(`suppressed ${id}: text blanked (verbatim run)`);
    // Everything outside the layer is unchanged.
    const top = readdirSync(out).filter((f) => f.endsWith(".json") && f !== "build-report.json" && f !== "build.json");
    for (const f of top) expect(readFileSync(join(out, f), "utf8"), f).toBe(readFileSync(join(plain, f), "utf8"));
  });
});
