/**
 * W2.1 acceptance on today's data/ (integration-plan §8 W2.1). Counts are derived from ingest so the
 * suite stays valid while the pipeline keeps adding shiurim.
 */
import { join } from "node:path";
import { compareWorks, workByKey } from "@emunas/normalize";
import { describe, expect, it } from "vitest";
import type { IngestOutput } from "../../../../src/types.ts";
import { AGGREGATE_FILES } from "../../src/aggregate/aggregate.ts";
import { buildCorpusWithAggregates, projectAndAggregate } from "../../src/aggregate/build.ts";
import type { Aggregates } from "../../src/aggregate/types.ts";
import type { BuildReport } from "../../src/build/report.ts";
import { REAL_DATA, REAL_POLICY, allKeys, readJson, tmp } from "../helpers.ts";
import { AGGREGATE_FORBIDDEN_KEYS, aggregateViolations } from "./helpers.ts";

const ingest = readJson<IngestOutput>(join(REAL_DATA, "derived/ingest.json"));
const inScope = ingest.shiurim.filter((s) => s.inScope);

describe("aggregates on real data", () => {
  const p = projectAndAggregate({ dataDir: REAL_DATA, policyDir: REAL_POLICY });
  const f = p.aggregates.files;

  it("holds the structural invariants", () => {
    expect(aggregateViolations(f, p.shiurim)).toEqual([]);
  });

  it("lists every in-scope shiur in exactly one section", () => {
    const all = f.sections.sections.flatMap((s) => s.shiurIds);
    expect(all).toHaveLength(inScope.length);
    expect(new Set(all)).toEqual(new Set(inScope.map((s) => s.id)));
  });

  it("undated count equals shiurim with empty hebrewYears", () => {
    expect(f.years.unknown.count).toBe(inScope.filter((s) => s.hebrewYears.length === 0).length);
  });

  it("merges both languages on occasions", () => {
    const both = [...f.occasions.parshiyos, ...f.occasions.zmanim].filter((o) => {
      const ids = [...o.shiurim, ...("subs" in o ? o.subs.flatMap((x) => x.shiurim) : [])];
      return ids.some((x) => x.lang === "yi") && ids.some((x) => x.lang === "en");
    });
    expect(both.length).toBeGreaterThan(20);
    const noach = f.occasions.parshiyos.find((o) => o.key === "noach")!;
    expect(new Set(noach.shiurim.map((x) => x.lang))).toEqual(new Set(["yi", "en"]));
  });

  it("maps every catalogued parsha and zman (unmapped only in the uncatalogued guesses)", () => {
    const guessed = new Set(p.shiurim.filter((s) => s.catalog.derived === "filename" || s.catalog.derived === "dir-prefix").map((s) => s.id));
    for (const o of f.occasions.other) expect(guessed.has(o.id)).toBe(false);
    const parshaUnmapped = p.report.finish({ total: 0, full: 0, catalogOnly: 0, downgraded: 0, notDone: 0 }, 1, []).unmapped;
    expect(parshaUnmapped.parsha).toEqual([]);
    expect(parshaUnmapped.zman).toEqual([]);
  });

  it("orders works as the table does", () => {
    const mapped = f.works.works.filter((w) => w.mapped);
    const firstUnmapped = f.works.works.findIndex((w) => !w.mapped);
    expect(firstUnmapped).toBe(mapped.length);
    for (let i = 1; i < mapped.length; i++) {
      expect(compareWorks(workByKey(mapped[i - 1]!.key)!, workByKey(mapped[i]!.key)!), mapped[i]!.key).toBeLessThan(0);
    }
    // The shelf opens with the Torah group (a generic "Chumash" row, order 0, may precede the books),
    // and the five books keep their canonical order wherever they fall.
    expect(workByKey(mapped[0]!.key)!.group).toBe("torah");
    const books = ["bereishis", "shemos", "vayikra", "bamidbar", "devarim"];
    expect(mapped.map((w) => w.key).filter((k) => books.includes(k))).toEqual(books);
  });

  it("groups Tanya by perek", () => {
    const tanya = f.series.series.find((s) => s.id === "tanya-yi")!;
    expect(tanya.sibling).toBe("tanya-en");
    expect(tanya.groups!.length).toBeGreaterThan(10);
    expect(tanya.groups!.slice(0, 2).map((g) => g.perek)).toEqual(["הקדמה", "א"]);
    // groups keep series order and never split one perek in two (quote-mark variants merged)
    expect(tanya.groups!.flatMap((g) => g.shiurIds)).toEqual(tanya.parts.map((x) => x.id));
    const named = tanya.groups!.map((g) => g.perek!.replace(/[”״]/g, '"'));
    expect(new Set(named).size).toBe(named.length);
  });

  it("never carries transcript-derived or long-form fields", () => {
    const keys = allKeys(f);
    for (const k of AGGREGATE_FORBIDDEN_KEYS) expect(keys.has(k), k).toBe(false);
  });

  it("writes the files and reports unmapped strings without failing", () => {
    const out = join(tmp(), ".corpus");
    const r = buildCorpusWithAggregates({ dataDir: REAL_DATA, outDir: out, policyDir: REAL_POLICY, dataSha: null });
    expect(r.info.counts.total).toBe(inScope.length);
    const report = readJson<BuildReport>(join(out, "build-report.json"));
    expect(report.unmapped.work.length).toBeGreaterThan(0);
    expect(report.unmapped.person.length).toBeGreaterThan(0);
    const works = readJson<Aggregates["works"]>(join(out, AGGREGATE_FILES.works)).works;
    const byKey = new Map(works.map((w) => [w.key, w]));
    for (const u of report.unmapped.work) {
      expect(byKey.get(u.key)?.mapped, u.raw).toBe(false);
    }
    console.log(
      `aggregates: ${works.length} works (${report.unmapped.work.length} unmapped strings), ` +
        `${report.unmapped.person.length} unmapped people, ${f.concepts.concepts.length} listed concepts, ${f.stories.stories.length} stories`,
    );
  });
});
