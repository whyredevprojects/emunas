/**
 * The CLI against wrangler's own local D1: `--migrate` runs `wrangler d1 migrations apply
 * --local`, the sync writes through Miniflare into the same persisted database file, and
 * `wrangler d1 execute --local` (what `wrangler dev` uses) reads the rows back.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { API, buildMiniCorpus, tmp } from "./helpers.ts";

const env = { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false", NO_COLOR: "1" };

type Section = Record<string, number | string | boolean | null>;
interface Summary {
  moments: number;
  d1: Section;
  vectors: Section | null;
}

function cli(args: string[]): { out: string; summary: Summary } {
  const out = execFileSync("npx", ["tsx", "sync/src/cli.ts", ...args], { cwd: API, env, encoding: "utf8" });
  const json = out.slice(out.indexOf("\n{") + 1);
  return { out, summary: JSON.parse(json) as Summary };
}

describe("sync CLI, local mode", () => {
  it("migrates, syncs into wrangler's local D1, and is a no-op the second time", () => {
    const corpus = buildMiniCorpus();
    const persist = tmp();
    const report = join(persist, "report.json");
    const args = ["--corpus", corpus, "--env", "staging", "--persist-to", persist, "--dims", "64"];
    const first = cli([...args, "--migrate", "--report", report]);
    expect(Number(first.summary.d1["inserted"])).toBeGreaterThan(500);
    expect(Number(first.summary.vectors?.["upserted"])).toBeGreaterThan(500);
    expect(existsSync(join(corpus, "search/vector-meta.ndjson"))).toBe(true);
    expect(JSON.parse(readFileSync(report, "utf8")).d1.shiurim.length).toBeGreaterThan(10);

    const read = execFileSync(
      "npx",
      ["wrangler", "d1", "execute", "emunas-search-staging", "--local", "--env", "staging", "--persist-to", persist, "--json", "--command", "SELECT count(*) AS n FROM moments"],
      { cwd: API, env, encoding: "utf8" },
    );
    const parsed = JSON.parse(read.slice(read.indexOf("["))) as { results: { n: number }[] }[];
    expect(parsed[0]!.results[0]!.n).toBe(Number(first.summary.d1["inserted"]));

    const second = cli(args);
    expect(second.summary.d1).toMatchObject({ inserted: 0, updated: 0, deleted: 0, statements: 0, rowsWritten: 0 });
    expect(second.summary.vectors).toMatchObject({ upserted: 0, deleted: 0 });

    const dry = cli([...args, "--dry-run", "--only", "d1"]);
    expect(dry.summary.vectors).toBeNull();
  }, 300_000);

  it("refuses a local database without the schema", () => {
    const corpus = buildMiniCorpus();
    expect(() =>
      execFileSync("npx", ["tsx", "sync/src/cli.ts", "--corpus", corpus, "--persist-to", tmp(), "--only", "d1"], { cwd: API, env, encoding: "utf8", stdio: "pipe" }),
    ).toThrow(/no schema/);
  }, 120_000);

  it("aborts before writing anything when the leak guard finds something in its inputs", () => {
    const corpus = buildMiniCorpus();
    const file = join(corpus, "search/moments.ndjson");
    const lines = readFileSync(file, "utf8").trim().split("\n");
    const row = JSON.parse(lines[0]!) as Record<string, unknown>;
    row["body_en"] = `${String(row["body_en"])} (from transcripts/abc.json)`;
    lines[0] = JSON.stringify(row);
    writeFileSync(file, `${lines.join("\n")}\n`);
    const persist = tmp();
    let err = "";
    try {
      execFileSync("npx", ["tsx", "sync/src/cli.ts", "--corpus", corpus, "--persist-to", persist, "--migrate", "--no-verbatim", "--dims", "16"], {
        cwd: API, env, encoding: "utf8", stdio: "pipe",
      });
    } catch (e) {
      err = String((e as { stderr?: string }).stderr);
    }
    expect(err).toMatch(/guard finding: \{"kind":"substring"/);
    expect(err).toMatch(/nothing was written/);
    // The guard runs before any target is opened: no D1 state, no index, no cache.
    expect(readdirSync(persist)).toEqual([]);
  }, 180_000);
});
