/** The budget checks fire (tech-live §3.3), and the CLI wires emit/validate/budgets together. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BR_TARGETS, SOFT_TARGETS, checkLiveBudgets, projectedPrerender } from "./budgets.ts";
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
    expect(projectedPrerender(r.byKind)).toBe(2 * (2 + 0 + 1 + 100));
    expect(r.projectedFiles).toBe(3 + 1 + 206);
    expect(r.findings).toMatchObject([{ kind: "file-count", projected: true, files: 210, limit: 100 }]);

    const client = join(tmp(), "client");
    mkdirSync(client);
    for (let i = 0; i < 5; i++) writeFileSync(join(client, `${i}.html`), "");
    const c = checkLiveBudgets({ dataDir: data, clientDir: client, maxFiles: 4 });
    expect(c.clientFiles).toBe(5);
    expect(c.projectedFiles).toBeNull();
    expect(c.findings).toMatchObject([{ kind: "file-count", files: 5, limit: 4 }]);
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
