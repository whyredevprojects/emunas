/** The budget checks fire (tech-live §3.3), and the CLI wires emit/validate/budgets together. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  APP_BUILD_FILES,
  BR_TARGETS,
  SOFT_TARGETS,
  checkLiveBudgets,
  projectedPrerender,
  type PrerenderSets,
} from "./budgets.ts";
import { main } from "./cli.ts";
import { GENERATED_AT, MINI_DATA, MINI_POLICY, buildCorpusTo, tmp } from "./test-helpers.ts";

/** Incompressible JSON of about `bytes` bytes. */
const noise = (bytes: number) => JSON.stringify({ x: randomBytes(Math.ceil(bytes * 1.1)).toString("base64") });

function tree(files: Record<string, string>): { root: string; data: string } {
  const root = join(tmp(), "public");
  const data = join(root, "data");
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(join(data, f, ".."), { recursive: true });
    writeFileSync(join(data, f), text);
  }
  return { root, data };
}

describe("checkLiveBudgets", () => {
  it("flags per-kind brotli targets, unknown files and the per-file size limit", () => {
    const { data } = tree({
      "shiur/a.json": noise(BR_TARGETS.shiur! + 4096),
      "shiur/b.json": "{}",
      "writeup/a.en.json": noise(BR_TARGETS.writeup! + 4096),
      "notes.txt": "x",
    });
    const r = checkLiveBudgets({ dataDir: data, clientDir: null, maxFileBytes: 60_000 });
    const kinds = r.findings.map((f) => `${f.kind}:${"file" in f ? f.file : ""}`).sort();
    expect(kinds).toEqual([
      "br-size:shiur/a.json",
      "br-size:writeup/a.en.json",
      "file-size:shiur/a.json",
      "unknown-file:notes.txt",
    ]);
    expect(r.byKind.shiur?.files).toBe(2);
    expect(r.dataFiles).toBe(4);
  });

  it("fires for each corpus-layer budget (plan §4) and for today.json", () => {
    const targets = {
      "topics.json": "topics",
      "topic/hester-panim.json": "topic",
      "topic/hester-panim.moments-1.json": "topicMoments",
      "topic-shiurim/hester-panim.1.json": "topicShiurim",
      "thread/akeidah.json": "thread",
      "story/sugar-sled.json": "story",
      "stories-index.json": "storiesIndex",
      "glossary/ha.json": "glossary",
      "today.json": "today",
    } as const;
    const expected = { topics: 8, topic: 24, topicMoments: 24, topicShiurim: 24, thread: 6, story: 6, storiesIndex: 120, glossary: 8, today: 30 };
    for (const [kind, kib] of Object.entries(expected)) expect(BR_TARGETS[kind as keyof typeof BR_TARGETS], kind).toBe(kib * 1024);
    const over = tree(Object.fromEntries(Object.entries(targets).map(([f, k]) => [f, noise(BR_TARGETS[k]! + 2048)])));
    const r = checkLiveBudgets({ dataDir: over.data, clientDir: null });
    expect(r.findings.filter((f) => f.kind === "br-size").map((f) => ("file" in f ? f.file : "")).sort()).toEqual(Object.keys(targets).sort());
    const under = tree(Object.fromEntries(Object.entries(targets).map(([f, k]) => [f, noise(BR_TARGETS[k]! / 2)])));
    expect(checkLiveBudgets({ dataDir: under.data, clientDir: null }).findings.filter((f) => f.kind === "br-size")).toEqual([]);
  });

  it("corpus.json over its target is a warning; over the hard limit it fails", () => {
    const soft = tree({ "corpus.json": noise(BR_TARGETS.corpus! + 8192) });
    const a = checkLiveBudgets({ dataDir: soft.data, clientDir: null });
    expect(a.findings).toEqual([]);
    expect(a.warnings.map((w) => w.kind)).toEqual(["br-size"]);
    const hard = tree({ "corpus.json": noise(SOFT_TARGETS.corpus!.hardLimit + 8192) });
    const b = checkLiveBudgets({ dataDir: hard.data, clientDir: null });
    expect(b.findings).toMatchObject([{ kind: "br-size", hard: true }]);
  });

  it("counts files: projected with prerender before the app build, actual in build/client after", () => {
    const { root, data } = tree({ "shiur/a.json": "{}", "shiur/b.json": "{}", "entity/p/x.json": "{}" });
    writeFileSync(join(root, "robots.txt"), "");
    const r = checkLiveBudgets({ dataDir: data, publicDir: root, clientDir: join(root, "missing"), maxFiles: 100 });
    // Today + 2 shiurim + 1 person (no entities.json: every entity file counts), per UI language.
    expect(r.projectedFiles).toBe(3 + 1 + 2 * (1 + 2 + 1) + APP_BUILD_FILES);
    expect(r.findings).toMatchObject([{ kind: "file-count", projected: true, files: r.projectedFiles, limit: 100 }]);

    const client = join(tmp(), "client");
    mkdirSync(client);
    for (let i = 0; i < 5; i++) writeFileSync(join(client, `${i}.html`), "");
    const c = checkLiveBudgets({ dataDir: data, clientDir: client, maxFiles: 4 });
    expect(c.clientFiles).toBe(5);
    expect(c.projectedFiles).toBeNull();
    expect(c.findings).toMatchObject([{ kind: "file-count", files: 5, limit: 4 }]);
  });

  it("projects exactly the routes W4.5 prerenders: entity routes by livePrerender, occasions by count", () => {
    const files = [
      "build.json",
      "corpus.json",
      "shiur/a.json",
      "shiur/b.json",
      "writeup/a.en.json",
      "series/s-yi.json",
      "work/genesis.json",
      "work/rare.json",
      "entity/p/x.json",
      "entity/p/y.json",
      "entity/c/k.json",
      "entity/o/noach.json",
      "entity/o/once.json",
      "moments/en-0.json",
    ];
    expect(projectedPrerender(files)).toBe(2 * (1 + 2 + 1 + 2 + 2 + 1 + 2));
    const sets: PrerenderSets = {
      works: new Set(["genesis"]),
      people: new Set(["x"]),
      concepts: new Set(),
      occasions: new Set(["noach", "no-file"]),
    };
    // Today + shiurim a, b + series + genesis + x + noach, per UI language.
    expect(projectedPrerender(files, sets)).toBe(2 * (1 + 2 + 1 + 1 + 1 + 1));
  });

  it("projects the corpus-layer routes: topics, threads, stories with a page; moment pages are data", () => {
    const files = [
      "topics.json",
      "topic/a.json",
      "topic/a.moments-1.json",
      "topic/b.json",
      "thread/t.json",
      "story/s.json",
      "story/u.json",
      "glossary/a.json",
      "stories-index.json",
      "explore/entities.json",
    ];
    // Today + 2 topics + 1 thread + 2 stories, per UI language.
    expect(projectedPrerender(files)).toBe(2 * (1 + 2 + 1 + 2));
    const sets = {
      works: new Set<string>(),
      people: new Set<string>(),
      concepts: new Set<string>(),
      occasions: new Set<string>(),
      topics: new Set(["a"]),
      threads: new Set<string>(),
      stories: new Set(["s"]),
    };
    expect(projectedPrerender(files, sets)).toBe(2 * (1 + 1 + 0 + 1));
  });
});

describe("data-build CLI", () => {
  it("emit → validate → budgets on the mini corpus; bad input and usage errors exit non-zero", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const corpus = buildCorpusTo(MINI_DATA, MINI_POLICY);
    const root = join(tmp(), "public");
    const data = join(root, "data");
    expect(await main(["emit", "--corpus", corpus, "--out", data, "--generated-at", GENERATED_AT])).toBe(0);
    expect(JSON.parse(readFileSync(join(data, "build.json"), "utf8")).generatedAt).toBe(GENERATED_AT);
    expect(await main(["validate", "--data", data])).toBe(0);
    expect(await main(["budgets", "--data", data, "--public", root, "--client", join(root, "none")])).toBe(0);

    writeFileSync(join(data, "facets.json"), JSON.stringify({ schemaVersion: 1 }));
    expect(await main(["validate", "--data", data])).toBe(1);
    expect(await main(["emit", "--corpus", join(tmp(), "missing"), "--out", data])).toBe(1);
    expect(await main(["emit", "--out", join(tmp(), "not-named-data"), "--corpus", corpus, "--bogus"])).toBe(2);
    expect(await main(["frobnicate"])).toBe(2);
    expect(log).toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
  });

  it("refuses to write outside a directory named data", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const corpus = buildCorpusTo(MINI_DATA, MINI_POLICY);
    await expect(main(["emit", "--corpus", corpus, "--out", join(tmp(), "elsewhere")])).rejects.toThrow(/data/);
  });
});
