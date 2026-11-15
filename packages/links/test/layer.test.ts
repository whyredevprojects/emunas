/**
 * The links over a real layer: the mini-corpus golden files that C1.2 writes
 * (`packages/corpus/test/layer/golden/`, `.corpus/layer/` shapes). Types are checked against
 * `@emunas/corpus/public` (read relatively: this package takes no dependency on it).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  LayerConceptsFile,
  LayerPeopleFile,
  LayerStoriesFile,
  LayerThreadsFile,
  LayerTopicsFile,
  LayerWorksFile,
} from "../../corpus/src/public/corpus-layer.ts";
import {
  EDS,
  createLinks,
  hasPageOn,
  pageLookupFromLayer,
  parseLive,
  type LayerPagesInput,
  type LinkData,
} from "../src/index.ts";
import { HOSTS } from "./fixtures.ts";

const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), "../../corpus/test/layer/golden");
const read = <T>(name: string): T => JSON.parse(readFileSync(join(GOLDEN, name), "utf8")) as T;

interface Layer {
  topics: LayerTopicsFile;
  concepts: LayerConceptsFile;
  people: LayerPeopleFile;
  works: LayerWorksFile;
  stories: LayerStoriesFile;
  threads: LayerThreadsFile;
}

// Compile-time: the real layer types fit the structural inputs.
const asInput = (layer: Layer): LayerPagesInput => layer;

const layer: Layer = {
  topics: read("topics.json"),
  concepts: read("concepts.json"),
  people: read("people.json"),
  works: read("works.json"),
  stories: read("stories.json"),
  threads: read("threads.json"),
};
const data: LinkData = pageLookupFromLayer(asInput(layer));
const links = createLinks({ hosts: HOSTS, data });

describe("links over the mini-corpus layer", () => {
  it("has data to test", () => {
    expect(layer.topics.tree.length).toBeGreaterThan(50);
    expect(layer.concepts.concepts.some((c) => c.mergedIntoTopic)).toBe(true);
  });

  it("every topic, concept, story and person with pages on both sites round-trips across sites", () => {
    const rows: [string, readonly { id: string; pages: { quiet: boolean; live: boolean } }[]][] = [
      ["inyanim", layer.topics.tree],
      ["erachim", layer.concepts.concepts],
      ["stories", layer.stories.stories],
      ["people", layer.people.people],
    ];
    let n = 0;
    for (const [dir, list] of rows) {
      for (const e of list) {
        if (!e.pages.quiet || !e.pages.live) continue;
        for (const ed of EDS) {
          const q = `${HOSTS.quiet}/${ed}/${dir}/${encodeURIComponent(e.id)}/`;
          const l = links.equivalent(q);
          expect(l, q).not.toBeNull();
          expect(links.equivalent(l!), q).toBe(q);
          expect(links.canonicalFor(l!), q).toBe(q);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(400);
  });

  it("concepts merged into a topic resolve to that topic on both sites", () => {
    const merged = layer.concepts.concepts.filter((c) => c.mergedIntoTopic !== null);
    let withPage = 0;
    for (const c of merged) {
      const topic = encodeURIComponent(c.mergedIntoTopic!);
      const concept = { kind: "entry", ed: "en", entry: "concept", id: c.id } as const;
      if (hasPageOn("quiet", "topic", c.mergedIntoTopic!, data)) {
        withPage++;
        expect(links.quiet.glossaryEntry("en", c.id)).toBe(`${HOSTS.quiet}/en/inyanim/${topic}/`);
      } else {
        // a topic left with no visible shiur: its line in the tree
        expect(links.quiet.glossaryEntry("en", c.id)).toBe(`${HOSTS.quiet}/en/inyanim/#${topic}`);
      }
      const live = links.hrefFor("live", concept);
      if (hasPageOn("live", "topic", c.mergedIntoTopic!, data)) expect(live).toBe(`${HOSTS.live}/en/t/${topic}`);
      else expect(live).toBeNull();
    }
    expect(withPage).toBeGreaterThan(0);
  });

  it("threads: Live pages only where flagged, never a canonical", () => {
    for (const t of layer.threads.threads) {
      const url = `${HOSTS.live}/en/th/${encodeURIComponent(t.id)}`;
      expect(links.hrefFor("live", parseLive(url)!) !== null).toBe(t.page);
      expect(links.canonicalFor(url)).toBeNull();
      expect(links.noindexFor(url)).toBe(true);
    }
  });
});
