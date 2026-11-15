/**
 * W2.1 on the 60-shiur mini corpus: golden files for every aggregate, structural invariants, the
 * occasion rules (both languages merged, seudah sub-headings, guesses excluded), series grouping,
 * works order, and the build wiring (normalize keys, files written, unmapped values reported).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { compareSortKeys, compareWorks, workByKey } from "@emunas/normalize";
import type { IngestOutput } from "../../../../src/types.ts";
import { describe, expect, it } from "vitest";
import { AGGREGATE_FILES, aggregate } from "../../src/aggregate/aggregate.ts";
import { buildCorpusWithAggregates, projectAndAggregate } from "../../src/aggregate/build.ts";
import type { Aggregates, OccasionsFile } from "../../src/aggregate/types.ts";
import { toJson } from "../../src/build/build.ts";
import type { BuildReport } from "../../src/build/report.ts";
import { MINI_DATA, MINI_POLICY, PKG, allKeys, editJson, miniCopy, readJson, tmp } from "../helpers.ts";
import { AGGREGATE_FORBIDDEN_KEYS, aggregateViolations } from "./helpers.ts";

const mini = projectAndAggregate({ dataDir: MINI_DATA, policyDir: MINI_POLICY });
const files = mini.aggregates.files;
const occ = (f: OccasionsFile, key: string) => [...f.parshiyos, ...f.zmanim].find((o) => o.key === key)!;
const zman = (f: OccasionsFile, key: string) => f.zmanim.find((o) => o.key === key)!;

describe("aggregates on the mini corpus", () => {
  it.each(Object.entries(AGGREGATE_FILES) as [keyof Aggregates, string][])("%s matches its golden file", async (k, name) => {
    await expect(toJson(files[k])).toMatchFileSnapshot(join("golden", name));
  });

  it("is deterministic", () => {
    const again = aggregate({ shiurim: mini.shiurim, index: mini.index });
    expect(toJson(again.files)).toBe(toJson(files));
    const reversed = aggregate({ shiurim: [...mini.shiurim].reverse(), index: mini.index });
    expect(toJson(reversed.files)).toBe(toJson(files));
  });

  it("holds the structural invariants", () => {
    expect(aggregateViolations(files, mini.shiurim)).toEqual([]);
  });

  it("never carries transcript-derived or long-form fields", () => {
    const keys = allKeys(files);
    for (const k of AGGREGATE_FORBIDDEN_KEYS) expect(keys.has(k), k).toBe(false);
  });

  it("uses normalize keys", () => {
    expect(mini.keyer.id).toBe("emunas-normalize");
    expect(mini.keyer.version).toMatch(/^[0-9a-f]{16}$/);
    const byId = new Map(mini.shiurim.map((s) => [s.id, s]));
    expect(byId.get("en-parsha-en-nch-01")!.parsha!.key).toBe("noach");
    expect(byId.get("en-parsha-en-ky-sb-01")!.parsha!.key).toBe("ki-savo");
    expect(byId.get("en-zmanim-en-tv-bshbt-01")!.zman!.key).toBe("tu-bishvat");
    expect(byId.get("en-zmanim-en-chvdsh-tbs-02")!.zman!.key).toBe("teves");
  });

  it("files seudah entries under their zman as a sub-heading", () => {
    const zos = zman(files.occasions, "zos-chanukah");
    expect(zos.shiurim).toEqual([]);
    expect(zos.subs).toEqual([{ sub: "seudah", shiurim: [expect.objectContaining({ id: "yi-zmanim-svds-zs-chnvkh-04" })] }]);
    expect(zos.count).toBe(1);
    expect(zman(files.occasions, "shushan-purim").subs[0]!.sub).toBe("seudah");
  });

  it("leaves uncatalogued guesses out and keeps one-off events in 'other'", () => {
    const listed = new Set(
      [...files.occasions.parshiyos, ...files.occasions.zmanim].flatMap((o) => [
        ...o.shiurim.map((x) => x.id),
        ...("subs" in o ? o.subs.flatMap((s) => s.shiurim.map((x) => x.id)) : []),
      ]),
    );
    const guesses = mini.shiurim.filter((s) => s.catalog.derived !== "catalog" && (s.parsha || s.zman));
    expect(guesses.length).toBeGreaterThan(5);
    for (const g of guesses) {
      expect(listed.has(g.id), g.id).toBe(false);
      expect(files.neighbours[g.id]!.sameOccasion).toEqual([]);
    }
    expect(files.occasions.excluded.uncataloguedGuesses).toBe(guesses.length);
    // Elul has two catalogued Yiddish shiurim plus one guessed (current-unc) row: only the two count.
    expect(zman(files.occasions, "elul").shiurim.map((x) => x.id)).toEqual(["yi-zmanim-lvl-01", "yi-zmanim-lvl-02"]);
    expect(files.occasions.other.map((x) => x.id)).toEqual(["yi-zmanim-msybs-lchyym-bkmp-01-c"]);
  });

  it("lists every table parsha and zman, in table order", () => {
    expect(files.occasions.parshiyos.map((p) => p.order)).toEqual([...files.occasions.parshiyos.map((p) => p.order)].sort((a, b) => a - b));
    expect(files.occasions.parshiyos.length).toBeGreaterThanOrEqual(54);
    expect(files.occasions.zmanim[0]!.key).toBe("elul");
  });

  it("sorts each year's shiurim in calendar order", () => {
    const y5749 = files.years.years.find((y) => y.year === 5749)!.shiurIds;
    // 5749: Noach, Toldos and Vayishlach (Cheshvan/Kislev) come before Chanukah (25 Kislev)
    expect(y5749.indexOf("en-parsha-en-nch-01")).toBeLessThan(y5749.indexOf("en-parsha-en-svldvs-01"));
    expect(y5749.indexOf("en-parsha-en-svldvs-01")).toBeLessThan(y5749.indexOf("en-parsha-en-vyshlch-01"));
    expect(y5749.indexOf("en-parsha-en-vyshlch-01")).toBeLessThan(y5749.indexOf("yi-zmanim-chnvkh-11"));
    // the four-year Shushan Purim seudah is under each of its years
    for (const y of [5743, 5744, 5746, 5747]) {
      expect(files.years.years.find((x) => x.year === y)!.shiurIds).toContain("yi-zmanim-svds-shvshn-pvrym-01");
    }
  });

  it("groups Tanya by perek and links the yi/en siblings", () => {
    const tanya = files.series.series.find((s) => s.id === "tanya-yi")!;
    expect(tanya.sibling).toBe("tanya-en");
    expect(tanya.groups!.map((g) => g.perek)).toEqual(["א", "ב", 'י"ב', 'י"ח']);
    expect(files.series.series.find((s) => s.id === "tanya-en")!.sibling).toBe("tanya-yi");
    expect(files.series.series.find((s) => s.id === "eretz-yisroel-yi")!.sibling).toBeNull();
    expect(files.series.series.find((s) => s.id === "emunah-yi")!.groups).toBeNull();
    const nav = files.neighbours["yi-tanya-1-10"]!.series!;
    expect(nav).toEqual({ of: "tanya-yi", pos: 2, count: 4, prev: "yi-tanya-1-01", next: "yi-tanya-1-29" });
  });

  it("orders works as the works table does, unmapped works last", () => {
    const ws = files.works.works;
    expect(ws.length).toBeGreaterThan(10);
    const firstUnmapped = ws.findIndex((w) => !w.mapped);
    const mapped = ws.slice(0, firstUnmapped < 0 ? ws.length : firstUnmapped);
    expect(mapped.every((w) => w.mapped)).toBe(true);
    for (let i = 1; i < mapped.length; i++) {
      expect(compareWorks(workByKey(mapped[i - 1]!.key)!, workByKey(mapped[i]!.key)!)).toBeLessThanOrEqual(0);
    }
    if (firstUnmapped >= 0) expect(ws.slice(firstUnmapped).every((w) => !w.mapped)).toBe(true);
    for (const w of ws) {
      for (let i = 1; i < w.refs.length; i++) {
        expect(compareSortKeys(w.refs[i - 1]!.sortKey, w.refs[i]!.sortKey)).toBeLessThanOrEqual(0);
      }
    }
  });

  it("counts entities against the page thresholds", () => {
    const e = files.entities;
    expect(e.thresholds.quiet).toEqual({ work: 2, person: 2, concept: 3 });
    for (const w of e.works) {
      const work = files.works.works.find((x) => x.key === w.key)!;
      expect(w.shiurim).toBe(work.shiurCount);
      expect(w.quietPage).toBe(!work.genre && w.shiurim >= 2);
      expect(w.livePrerender).toBe(!work.genre && w.shiurim >= 3);
    }
    for (const c of e.concepts) expect(c.quietPage).toBe(c.shiurim >= 3);
    for (const c of files.concepts.concepts) expect(c.shiurCount).toBeGreaterThanOrEqual(files.concepts.minShiurim);
    expect(e.concepts.length).toBe(files.concepts.concepts.length + files.concepts.omitted.belowThreshold);
  });
});

describe("occasions merge both languages", () => {
  it("lists Yiddish and English shiurim on one parsha, sorted by year", () => {
    const d = miniCopy();
    // Re-label the English Noach shiur as Bereishis so the parsha has rows in both languages.
    editJson<IngestOutput>(join(d, "derived/ingest.json"), (x) => {
      x.shiurim.find((s) => s.id === "en-parsha-en-nch-01")!.parsha = "בראשית";
    });
    const r = projectAndAggregate({ dataDir: d, policyDir: MINI_POLICY });
    const b = occ(r.aggregates.files.occasions, "bereishis");
    expect(b.shiurim.map((x) => [x.id, x.lang, x.years[0]])).toEqual([
      ["yi-parshas-hashavua-brshys-01", "yi", 5736],
      ["en-parsha-en-nch-01", "en", 5749],
      ["yi-parshas-hashavua-brshys-03", "yi", 5750],
    ]);
    expect(r.aggregates.files.neighbours["en-parsha-en-nch-01"]!.sameOccasion).toEqual([
      "yi-parshas-hashavua-brshys-01",
      "yi-parshas-hashavua-brshys-03",
    ]);
  });
});

describe("buildCorpusWithAggregates", () => {
  it("writes the aggregate files and reports unmapped values without failing", () => {
    const d = miniCopy();
    editJson<IngestOutput>(join(d, "derived/ingest.json"), (x) => {
      x.shiurim.find((s) => s.id === "yi-zmanim-spyrh-01")!.zman = "zzz not a zman";
      x.shiurim.find((s) => s.id === "yi-parshas-hashavua-mvr-01")!.parsha = "qqq not a parsha";
    });
    const out = join(tmp(), ".corpus");
    const r = buildCorpusWithAggregates({ dataDir: d, outDir: out, policyDir: MINI_POLICY, dataSha: null });
    for (const name of Object.values(AGGREGATE_FILES)) expect(existsSync(join(out, name)), name).toBe(true);
    const report = readJson<BuildReport>(join(out, "build-report.json"));
    expect(report.unmapped.zman).toEqual([{ raw: "zzz not a zman", key: "other", count: 1 }]);
    expect(report.unmapped.parsha).toEqual([{ raw: "qqq not a parsha", key: "other", count: 1 }]);
    expect(report.unmapped.person.length).toBeGreaterThan(0);
    expect(report.warnings.some((w) => w.startsWith("aggregate: "))).toBe(true);
    expect(r.report.counts.total).toBe(60);
    const o = readJson<OccasionsFile>(join(out, "occasions.json"));
    expect(o.other.map((x) => x.id).sort()).toEqual(["yi-parshas-hashavua-mvr-01", "yi-zmanim-msybs-lchyym-bkmp-01-c", "yi-zmanim-spyrh-01"]);
    // every unmapped work string is listed in works.json under its fallback key
    const works = readJson<Aggregates["works"]>(join(out, "works.json")).works;
    for (const u of report.unmapped.work) {
      const w = works.find((x) => x.key === u.key);
      expect(w?.mapped, u.key).toBe(false);
      expect(w!.names).toContain(u.raw);
    }
  });

  it("an unchanged rerun rewrites nothing", () => {
    const out = join(tmp(), ".corpus");
    buildCorpusWithAggregates({ dataDir: MINI_DATA, outDir: out, policyDir: MINI_POLICY, dataSha: null });
    const r = buildCorpusWithAggregates({ dataDir: MINI_DATA, outDir: out, policyDir: MINI_POLICY, dataSha: null });
    expect(r.written).toEqual([]);
  });

  it("the corpus:build CLI writes the aggregates", () => {
    const out = join(tmp(), "out");
    const bin = join(PKG, "../../node_modules/.bin/tsx");
    const r = spawnSync(bin, [join(PKG, "src/cli.ts"), "--data-dir", MINI_DATA, "--out", out, "--policy-dir", MINI_POLICY], {
      encoding: "utf8",
      env: { ...process.env, INIT_CWD: PKG },
    });
    expect(r.status, r.stderr).toBe(0);
    for (const name of Object.values(AGGREGATE_FILES)) expect(existsSync(join(out, name)), name).toBe(true);
    expect(readJson<Aggregates["years"]>(join(out, "years.json"))).toEqual(files.years);
  });
});
