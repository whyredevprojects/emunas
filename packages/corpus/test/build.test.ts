import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Extraction } from "../../../src/types.ts";
import { buildCorpus } from "../src/build/build.ts";
import type { AudioTable, BuildInfo, CorpusIndex, PublicShiur } from "../src/public/types.ts";
import { MINI_DATA, MINI_POLICY, PKG, editJson, miniCopy, readJson, shiurFile, tmp } from "./helpers.ts";

const build = (dataDir: string, outDir: string, extra: Partial<Parameters<typeof buildCorpus>[0]> = {}) =>
  buildCorpus({ dataDir, outDir, policyDir: MINI_POLICY, dataSha: null, ...extra });

describe("buildCorpus → .corpus/", () => {
  it("writes build.json, shiurim/<id>.json, index.json, audio-table.json, build-report.json, fingerprints", () => {
    const out = join(tmp(), ".corpus");
    const r = build(MINI_DATA, out);
    for (const f of ["build.json", "index.json", "audio-table.json", "build-report.json", ".fingerprints.json"]) {
      expect(existsSync(join(out, f)), f).toBe(true);
    }
    expect(readdirSync(join(out, "shiurim"))).toHaveLength(60);
    expect(r.written).toHaveLength(60);
    const info = readJson<BuildInfo>(join(out, "build.json"));
    expect(info.counts.total).toBe(60);
    expect(info.counts.full + info.counts.catalogOnly).toBe(60);
    expect(info.buildId).toMatch(/^[0-9a-f]{16}$/);
    const index = readJson<CorpusIndex>(join(out, "index.json"));
    expect(index.shiurim).toHaveLength(60);
    expect(index.sections.length).toBeGreaterThan(10);
    const tv = index.shiurim.find((x) => x.id === "yi-zmanim-tv-bb-04")!;
    expect(tv.oneLiner?.en.length).toBeGreaterThan(0);
    expect(tv.entities.works.length).toBeGreaterThan(0);
    const audio = readJson<AudioTable>(join(out, "audio-table.json"));
    expect(Object.keys(audio).sort()).toEqual([...new Set(index.shiurim.flatMap((s) => s.recordingIds))].sort());
    for (const [id, e] of Object.entries(audio)) {
      expect(e.size).toBeGreaterThan(0);
      expect(typeof e.canonicalId).toBe("string");
      expect(id).toMatch(/^[a-z0-9-]+$/);
      expect(e.playable).toBe(true);
      expect(e.url?.startsWith(`${info.mediaOrigin}/`)).toBe(true);
    }
    expect(readFileSync(join(out, "audio-table.json"), "utf8")).not.toContain("audioKey");
    const shiur = readJson<PublicShiur>(join(out, "shiurim/yi-zmanim-tv-bb-04.json"));
    expect(shiur.rev).toBe(tv.rev);
  });

  it("an unchanged rerun rewrites no shiur file; a change rewrites only that shiur", () => {
    const d = miniCopy();
    const out = join(tmp(), ".corpus");
    build(d, out);
    const file = join(out, "shiurim/en-parsha-en-nch-01.json");
    const mtime = statSync(file).mtimeMs;
    const info1 = readFileSync(join(out, "build.json"), "utf8");

    const again = build(d, out);
    expect(again.written).toEqual([]);
    expect(statSync(file).mtimeMs).toBe(mtime);
    expect(readFileSync(join(out, "build.json"), "utf8")).toBe(info1);

    editJson<Extraction>(shiurFile(d, "en-parsha-en-nch-01", "extraction"), (e) => void (e.summary.oneLiner.en = "Changed one-liner"));
    const third = build(d, out);
    expect(third.written).toEqual(["en-parsha-en-nch-01"]);
    expect(readJson<PublicShiur>(file).notes!.summary.oneLiner.en).toBe("Changed one-liner");
    expect(readFileSync(join(out, "build.json"), "utf8")).not.toBe(info1);

    // a deleted output file is rewritten even with an unchanged fingerprint
    rmSync(file);
    expect(build(d, out).written).toEqual(["en-parsha-en-nch-01"]);
    // --force rewrites everything
    expect(build(d, out, { force: true }).written).toHaveLength(60);
  });

  it("removes files of shiurim that left the corpus", () => {
    const out = join(tmp(), ".corpus");
    build(MINI_DATA, out);
    writeFileSync(join(out, "shiurim/en-gone-01.json"), "{}");
    const r = build(MINI_DATA, out);
    expect(r.removed).toEqual(["en-gone-01.json"]);
    expect(existsSync(join(out, "shiurim/en-gone-01.json"))).toBe(false);
  });

  it("writes extra outputs from the aggregate hook", () => {
    const out = join(tmp(), ".corpus");
    build(MINI_DATA, out, { extraOutputs: (c) => ({ "years.json": { n: c.shiurim.length } }) });
    expect(readJson(join(out, "years.json"))).toEqual({ n: 60 });
    expect(() => build(MINI_DATA, out, { extraOutputs: () => ({ "../escape.json": {} }) })).toThrow();
  });
});

describe("corpus:build CLI", () => {
  const tsx = join(PKG, "../../node_modules/.bin/tsx");
  const run = (args: string[]) =>
    spawnSync(tsx, [join(PKG, "src/cli.ts"), ...args], { encoding: "utf8", env: { ...process.env, INIT_CWD: PKG } });

  it("builds from flags and exits 0", () => {
    const out = join(tmp(), "out");
    const r = run(["--data-dir", MINI_DATA, "--out", out, "--policy-dir", MINI_POLICY]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/60 shiurim: \d+ full/);
    expect(readdirSync(join(out, "shiurim"))).toHaveLength(60);
  });

  it("accepts a --suppress file", () => {
    const out = join(tmp(), "out");
    const f = join(tmp(), "suppress.json");
    writeFileSync(f, JSON.stringify(["en-parsha-en-nch-01~i0"]));
    const r = run(["--data-dir", MINI_DATA, "--out", out, "--policy-dir", MINI_POLICY, "--suppress", f]);
    expect(r.status, r.stderr).toBe(0);
    const s = readJson<PublicShiur>(join(out, "shiurim/en-parsha-en-nch-01.json"));
    expect(s.notes!.insights.map((m) => m.id)).not.toContain("en-parsha-en-nch-01~i0");
    expect(readJson<{ suppressed: string[] }>(join(out, "build-report.json")).suppressed).toEqual(["en-parsha-en-nch-01~i0"]);
  });

  it("exits 1 on an invalid ingest and 2 on a bad flag", () => {
    const d = miniCopy();
    writeFileSync(join(d, "derived/ingest.json"), "{}");
    const r = run(["--data-dir", d, "--out", join(tmp(), "out"), "--policy-dir", MINI_POLICY]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("ingest.json is invalid");
    expect(run(["--bogus"]).status).toBe(2);
  });
});
