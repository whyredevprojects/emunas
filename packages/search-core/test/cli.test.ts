import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MINI_DATA, MINI_POLICY, PKG, REPO, buildCorpusTo } from "./helpers.ts";

const TSX = join(REPO, "node_modules/.bin/tsx");

describe("search:build CLI", () => {
  it("writes docs.ndjson and moments.ndjson into <corpus>/search and reports counts", () => {
    const corpus = buildCorpusTo(MINI_DATA, MINI_POLICY);
    const out = execFileSync(TSX, [join(PKG, "src/build/cli.ts"), "--corpus", corpus, "--data-dir", MINI_DATA], {
      encoding: "utf8",
      env: { ...process.env, INIT_CWD: PKG },
    });
    expect(out).toMatch(/search:build \d+ docs \(\d+ with keywords\), \d+ moments/);
    for (const f of ["docs.ndjson", "moments.ndjson", "search.json"]) expect(existsSync(join(corpus, "search", f))).toBe(true);
    const meta = JSON.parse(readFileSync(join(corpus, "search/search.json"), "utf8")) as { docs: number };
    expect(meta.docs).toBe(readFileSync(join(corpus, "search/docs.ndjson"), "utf8").trim().split("\n").length);
    const again = execFileSync(TSX, [join(PKG, "src/build/cli.ts"), "--corpus", corpus, "--data-dir", MINI_DATA], { encoding: "utf8" });
    expect(again).toMatch(/changed: none/);
  });

  it("exits 2 on a bad flag and 1 when .corpus is missing", () => {
    const run = (args: string[]) => {
      try {
        execFileSync(TSX, [join(PKG, "src/build/cli.ts"), ...args], { stdio: "pipe" });
        return 0;
      } catch (e) {
        return (e as { status: number }).status;
      }
    };
    expect(run(["--nope"])).toBe(2);
    expect(run(["--corpus", join(PKG, "does-not-exist"), "--no-keywords"])).toBe(1);
  });
});
