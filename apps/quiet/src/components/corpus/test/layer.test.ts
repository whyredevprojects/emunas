/**
 * C1.8: the build-time reader of `.corpus/layer/` on the mini corpus of @emunas/corpus (built here
 * with the corpus build, layer included), and its defensive behaviour on a missing or odd layer.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LayerInfo } from "@emunas/corpus/public";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findLayerDir, loadQuietLayer, type QuietLayer } from "../layer.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../../../..");
const corpusPkg = join(repo, "packages/corpus");

let work = "";
let corpus = "";
let layer: QuietLayer;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "quiet-layer-"));
  corpus = join(work, "corpus");
  // App code may not import @emunas/corpus/build; the corpus:build CLI is the public way in.
  const tsx = join(repo, "node_modules", ".bin", "tsx");
  const r = spawnSync(
    tsx,
    [
      join(corpusPkg, "src", "cli.ts"),
      "--data-dir",
      join(corpusPkg, "test/fixtures/mini/data"),
      "--policy-dir",
      join(corpusPkg, "test/fixtures/mini/site-policy"),
      "--out",
      corpus,
      "--media-origin",
      "https://media.example.org",
    ],
    { cwd: repo, env: { ...process.env, INIT_CWD: repo, EMUNAS_DEPLOY: "" }, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`corpus:build failed:\n${r.stdout}\n${r.stderr}`);
  layer = loadQuietLayer(findLayerDir(corpus));
}, 120_000);

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

const layerJson = <T,>(name: string): T => JSON.parse(readFileSync(join(corpus, "layer", name), "utf8")) as T;

describe("quiet layer reader on the mini corpus", () => {
  it("finds the layer inside the corpus and reads it", () => {
    expect(findLayerDir(corpus)).toBe(join(corpus, "layer"));
    const info = layerJson<LayerInfo>("layer.json");
    expect(layer.visibleShiurim).toBe(info.counts.visibleShiurim);
    expect(layer.visibleShiurim).toBeGreaterThan(0);
    expect(layer.topics).toHaveLength(info.counts.topics);
    expect(layer.concepts).toHaveLength(info.counts.concepts);
    expect(layer.people).toHaveLength(info.counts.people);
    expect(layer.works).toHaveLength(info.counts.works);
    expect(layer.stories).toHaveLength(info.counts.stories);
    expect(layer.threads).toHaveLength(info.counts.threads);
    expect(layer.synonyms.length).toBe(info.counts.synonyms);
  });

  it("has typed accessors by id", () => {
    const t = layer.topics[0]!;
    expect(layer.topic(t.id)).toBe(t);
    expect(layer.topicDetail(t.id)?.id).toBe(t.id);
    expect(layer.concept(layer.concepts[0]!.id)).toBe(layer.concepts[0]);
    expect(layer.person(layer.people[0]!.id)).toBe(layer.people[0]);
    expect(layer.work(layer.works[0]!.id)).toBe(layer.works[0]);
    expect(layer.story(layer.stories[0]!.id)).toBe(layer.stories[0]);
    expect(layer.thread(layer.threads[0]!.id)).toBe(layer.threads[0]);
    expect(layer.topic("no-such-topic")).toBeUndefined();
  });

  it("answers hasPage from the layer's Quiet page flags (threads never)", () => {
    for (const t of layer.topics) expect(layer.hasPage("topic", t.id)).toBe(t.pages.quiet);
    for (const c of layer.concepts) expect(layer.hasPage("concept", c.id)).toBe(c.pages.quiet);
    for (const p of layer.people) expect(layer.hasPage("person", p.id)).toBe(p.pages.quiet);
    for (const w of layer.works) expect(layer.hasPage("work", w.id)).toBe(w.pages.quiet);
    for (const s of layer.stories) expect(layer.hasPage("story", s.id)).toBe(s.pages.quiet);
    for (const th of layer.threads) expect(layer.hasPage("thread", th.id)).toBe(false);
    expect(layer.hasPage("person", "no-such-person")).toBe(false);
    // The same flags reach @emunas/links, and a concept merged into a topic links to the topic.
    const merged = layer.concepts.find((c) => c.mergedIntoTopic !== null);
    if (merged) expect(layer.links.conceptTopic?.(merged.id)).toBe(merged.mergedIntoTopic);
  });

  it("reads per-shiur refs and series lazily, and refuses ids that are not file names", () => {
    const id = layer.concepts[0]!.shiurIds[0]!;
    const refs = layer.shiurRefs(id);
    expect(refs?.shiurId).toBe(id);
    expect(layer.shiurRefs(id)).toBe(refs); // memoised
    expect(layer.shiurRefs("no-such-shiur")).toBeNull();
    expect(layer.shiurRefs("../layer")).toBeNull();
    expect(layer.shiurRefs("a/b")).toBeNull();
    expect(layer.series("../../build")).toBeNull();
    expect(layer.series("no-such-series")).toBeNull();
  });

  it("reads the occasion map, and nothing about retired ids", () => {
    expect(layer.occasionTopics.length).toBeGreaterThan(0);
    for (const o of layer.occasionTopics) expect(layer.topic(o.topicId)).toBeDefined();
    expect(layer).not.toHaveProperty("redirects");
    expect(layer.story("the-sanzer-rav-and-the-business-competitor")).toBeUndefined();
  });
});

describe("quiet layer reader: the layer is required; odd records are skipped", () => {
  it("fails without a layer", () => {
    expect(() => findLayerDir(join(work, "nowhere"))).toThrow(/the corpus layer is required/);
    const dir = join(work, "partial", "layer");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "layer.json"), JSON.stringify({ counts: { visibleShiurim: 3 } }));
    expect(() => loadQuietLayer(dir)).toThrow(/topics\.json is missing: the corpus layer is required/);
  });

  it("skips records without an id and tolerates unknown fields", () => {
    const dir = join(work, "odd", "layer");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "layer.json"), JSON.stringify({ counts: { visibleShiurim: 3 }, futureField: 1 }));
    writeFileSync(
      join(dir, "topics.json"),
      JSON.stringify({ tree: [{ id: "emunah", pages: { quiet: true }, extra: "x" }, { label: "no id" }, null], detail: [] }),
    );
    writeFileSync(join(dir, "people.json"), JSON.stringify({ persons: [] }));
    for (const name of ["concepts.json", "works.json", "stories.json", "threads.json", "synonyms.json", "occasion-topics.json"]) {
      writeFileSync(join(dir, name), "{}");
    }
    const odd = loadQuietLayer(dir);
    expect(odd.visibleShiurim).toBe(3);
    expect(odd.topics.map((t) => t.id)).toEqual(["emunah"]);
    expect(odd.hasPage("topic", "emunah")).toBe(true);
    expect(odd.people).toEqual([]);
    expect(odd.concepts).toEqual([]);
    expect(odd.warnings.join("\n")).toMatch(/people\.json: no "people" list/);
    expect(odd.warnings.join("\n")).toMatch(/2 records without an id/);
  });

  it("fails on a layer file that is not JSON (a broken corpus build)", () => {
    const dir = join(work, "broken", "layer");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "layer.json"), JSON.stringify({ counts: { visibleShiurim: 3 } }));
    writeFileSync(join(dir, "topics.json"), "{ not json");
    expect(() => loadQuietLayer(dir)).toThrow(/not valid JSON/);
  });
});
