import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Extraction, IngestOutput, Writeup } from "../../../src/types.ts";
import { projectCorpus, toJson } from "../src/build/build.ts";
import { FatalDataError } from "../src/build/load.ts";
import type { PublicShiur } from "../src/public/types.ts";
import {
  FORBIDDEN_KEYS,
  GOLDEN_DIR,
  MINI_DATA,
  MINI_POLICY,
  allKeys,
  editJson,
  invariantViolations,
  miniCopy,
  readJson,
  shiurFile,
  tmp,
} from "./helpers.ts";

const SAMPLES = [
  "yi-parshas-hashavua-brshys-01",
  "en-parsha-en-nch-01",
  "yi-zmanim-lvl-01",
  "yi-zmanim-tv-bb-04",
  "en-miscellaneous-en-01",
  "yi-tanya-1-01",
  "yi-zmanim-msybs-lchyym-bkmp-01-c",
];

/** The placeholder origin is passed explicitly so goldens do not depend on `EMUNAS_MEDIA_ORIGIN`. */
const project = (dataDir = MINI_DATA, extra: { suppressFile?: string; policyDir?: string; mediaOrigin?: string } = {}) =>
  projectCorpus({ dataDir, policyDir: MINI_POLICY, mediaOrigin: "https://media.example.invalid", ...extra });
const byId = (p: { shiurim: PublicShiur[] }, id: string) => {
  const s = p.shiurim.find((x) => x.id === id);
  if (!s) throw new Error(`no ${id}`);
  return s;
};

describe("mini corpus projection", () => {
  const p = project();

  it("emits every in-scope shiur once and nothing out of scope", () => {
    const ingest = readJson<IngestOutput>(join(MINI_DATA, "derived/ingest.json"));
    const inScope = ingest.shiurim.filter((s) => s.inScope).map((s) => s.id).sort();
    expect(inScope).toHaveLength(60);
    expect(p.shiurim.map((s) => s.id).sort()).toEqual(inScope);
    expect(p.index.shiurim).toHaveLength(60);
  });

  it("full count = manifest done − downgrades", () => {
    const m = readJson<{ entries: { shiurId: string; status: string }[] }>(join(MINI_DATA, "derived/manifest.json"));
    const inScope = new Set(p.shiurim.map((s) => s.id));
    const done = m.entries.filter((e) => e.status === "done" && inScope.has(e.shiurId)).length;
    expect(p.counts.full).toBe(done - p.counts.downgraded);
    expect(p.counts.full + p.counts.catalogOnly).toBe(60);
  });

  it.each(SAMPLES)("matches the golden output for %s", (id) => {
    const golden = readFileSync(join(GOLDEN_DIR, `${id}.json`), "utf8");
    expect(toJson({ ...byId(p, id), rev: "<rev>" })).toBe(golden);
  });

  it("publishes no raw extraction name: no people/concept lists, no story people (F.1)", () => {
    let stories = 0;
    for (const s of p.shiurim) {
      const n = s.notes;
      if (!n) continue;
      expect(Object.keys(n)).not.toContain("people");
      expect(Object.keys(n)).not.toContain("concepts");
      for (const st of n.stories) {
        stories++;
        expect(Object.keys(st).sort()).toEqual(["end", "id", "retelling", "t", "title", ...(st.soft ? ["soft"] : [])].sort());
      }
      const ex = readJson<Extraction>(shiurFile(MINI_DATA, s.id, "extraction"));
      // A raw name may appear inside prose (title, retelling), but never as a value of its own.
      const values = new Set<string>();
      const walk = (x: unknown): void => {
        if (typeof x === "string") values.add(x);
        else if (Array.isArray(x)) x.forEach(walk);
        else if (x && typeof x === "object") Object.values(x).forEach(walk);
      };
      walk({ ...s, notes: { ...n, sources: [] } });
      // (A source's work string is the cited work, not a person name; "Rashi" is both.)
      for (const raw of [...ex.people.map((x) => x.name), ...ex.stories.flatMap((x) => x.people)]) expect(values.has(raw), raw).toBe(false);
    }
    expect(stories).toBeGreaterThan(0);
    for (const row of p.index.shiurim) expect(Object.keys(row)).not.toContain("entities");
  });

  it("keeps the partial directory and the not-yet-processed shiur catalog-only", () => {
    expect(byId(p, "yi-zmanim-msybs-lchyym-bkmp-01-c").status).toBe("catalog-only");
    expect(byId(p, "yi-zmanim-msybs-lchyym-bkmp-01-c").notes).toBeUndefined();
    expect(byId(p, "yi-tanya-1-01").status).toBe("catalog-only");
    expect(p.report.notDoneWithFiles).toContain("yi-zmanim-msybs-lchyym-bkmp-01-c");
  });

  it("gives the two-recording shiur correct offsets and a tiled timeline", () => {
    const s = byId(p, "yi-zmanim-tv-bb-04");
    expect(s.status).toBe("full");
    expect(s.recordings.map((r) => r.id)).toEqual(["y-zemanim-taamuz-av-07-04-1-15-av", "y-zemanim-taamuz-av-07-04-2-15-av"]);
    const [a, b] = s.recordings;
    expect(a!.offset).toBe(0);
    expect(b!.offset).toBe(a!.duration);
    expect(s.duration).toBeCloseTo(a!.duration + b!.duration, 3);
    // a chapter of recording 2 starts at or after its offset
    const ch2 = s.notes!.chapters.filter((c) => c.recordingId === b!.id);
    expect(ch2.length).toBeGreaterThan(0);
    expect(ch2[0]!.t).toBe(b!.offset);
    expect(invariantViolations(s)).toEqual([]);
  });

  it("all shiurim satisfy the time invariants", () => {
    expect(p.shiurim.flatMap(invariantViolations)).toEqual([]);
  });

  it("never emits a forbidden key", () => {
    const keys = allKeys(p.shiurim);
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k), k).toBe(false);
    const idx = allKeys(p.index);
    for (const k of FORBIDDEN_KEYS) expect(idx.has(k), k).toBe(false);
  });

  it("drops unresolved sources without a work and remaps write-up sourceIdx", () => {
    for (const s of p.shiurim.filter((x) => x.status === "full")) {
      const ex = readJson<Extraction>(shiurFile(MINI_DATA, s.id, "extraction"));
      const wu = readJson<Writeup>(shiurFile(MINI_DATA, s.id, "writeup"));
      const kept = ex.sources.map((x, i) => ({ x, i })).filter(({ x }) => !(x.resolution === "unresolved" && x.work === null));
      expect(s.notes!.sources.map((x) => x.id)).toEqual(kept.map(({ i }) => `${s.id}~src${i}`));
      const remap = new Map(kept.map(({ i }, n) => [i, n]));
      wu.en.forEach((b, bi) =>
        b.paragraphs.forEach((para, pi) => {
          const out = s.notes!.writeup.en[bi]!.paragraphs[pi]!;
          const expected = [...new Set(para.sourceIdx.filter((k) => remap.has(k)).map((k) => remap.get(k)!))];
          expect(out.src).toEqual(expected);
          // the remapped source is the same source
          for (const k of out.src) expect(s.notes!.sources[k]!.ref).toBe(ex.sources[kept[k]!.i]!.ref);
        }),
      );
    }
  });
});

describe("status gate", () => {
  const FULL = "yi-zmanim-lvl-01";

  function gateCase(mutate: (dataDir: string) => void) {
    const d = miniCopy();
    mutate(d);
    const p = project(d);
    return { s: byId(p, FULL), p };
  }

  it.each<[string, (d: string) => void]>([
    ["missing write-up", (d) => writeFileSync(shiurFile(d, FULL, "writeup"), "")],
    ["malformed JSON", (d) => writeFileSync(shiurFile(d, FULL, "extraction"), "{ nope")],
    ["schema violation", (d) => editJson<Extraction>(shiurFile(d, FULL, "extraction"), (e) => void ((e as unknown as Record<string, unknown>)["sections"] = "x"))],
    ["extractionVariant not 'extraction'", (d) => editJson<Writeup>(shiurFile(d, FULL, "writeup"), (w) => void (w.extractionVariant = "extraction-cleaned"))],
    ["section range past the last segment", (d) => editJson<Extraction>(shiurFile(d, FULL, "extraction"), (e) => void (e.sections[e.sections.length - 1]!.endSeg += 5))],
    ["sections with a gap", (d) => editJson<Extraction>(shiurFile(d, FULL, "extraction"), (e) => void (e.sections[1]!.startSeg += 1))],
    ["foreign recording id", (d) => editJson<Extraction>(shiurFile(d, FULL, "extraction"), (e) => void (e.insights[0]!.evidence.recordingId = "someone-else"))],
    ["write-up sectionIndex out of range", (d) => editJson<Writeup>(shiurFile(d, FULL, "writeup"), (w) => void (w.yi[0]!.sectionIndex = 999))],
    ["write-up sourceIdx out of range", (d) => editJson<Writeup>(shiurFile(d, FULL, "writeup"), (w) => void w.en[0]!.paragraphs[0]!.sourceIdx.push(999))],
    ["shiurId mismatch", (d) => editJson<Extraction>(shiurFile(d, FULL, "extraction"), (e) => void (e.shiurId = "other"))],
  ])("%s → catalog-only + report, build continues", (_name, mutate) => {
    const { s, p } = gateCase(mutate);
    expect(s.status).toBe("catalog-only");
    expect(s.notes).toBeUndefined();
    expect(p.report.downgraded.map((d) => d.id)).toContain(FULL);
    expect(p.shiurim).toHaveLength(60);
  });

  it("does not publish notes for a shiur that is not done, even with complete files", () => {
    const { s, p } = gateCase((d) =>
      editJson<{ entries: { shiurId: string; status: string }[] }>(join(d, "derived/manifest.json"), (m) => {
        m.entries.find((e) => e.shiurId === FULL)!.status = "needs_review";
      }),
    );
    expect(s.status).toBe("catalog-only");
    expect(p.report.downgraded.map((d) => d.id)).not.toContain(FULL);
  });

  it("an invalid ingest or manifest is fatal", () => {
    const d = miniCopy();
    editJson<IngestOutput>(join(d, "derived/ingest.json"), (i) => void ((i.shiurim[0] as unknown as Record<string, unknown>)["lang"] = "fr"));
    expect(() => project(d)).toThrow(FatalDataError);
    const d2 = miniCopy();
    writeFileSync(join(d2, "derived/manifest.json"), "[]");
    expect(() => project(d2)).toThrow(FatalDataError);
  });

  it("report entries hold reasons, never received values", () => {
    const { p } = gateCase((d) =>
      editJson<Extraction>(shiurFile(d, FULL, "extraction"), (e) => void ((e.sources[0] as unknown as Record<string, unknown>)["mention"] = "POISON-VALUE-123")),
    );
    const text = JSON.stringify(p.report.finish({ ...p.counts, notDone: p.notDone }, 1, []));
    expect(text).toContain(FULL);
    expect(text).not.toContain("POISON-VALUE-123");
  });
});

describe("allow-list projection", () => {
  const FULL = "en-parsha-en-nch-01";

  it("a poisoned fixture (unknown fields + heardAs/asrNotes/segments everywhere) leaks nothing", () => {
    const d = miniCopy();
    const POISON = "POISON-ASR-TEXT-xyzzy";
    const poison = (o: Record<string, unknown>) => {
      o["heardAs"] = POISON;
      o["asrNotes"] = POISON;
      o["segments"] = [[0, 1, POISON]];
      o["unknownFutureField"] = POISON;
      o["transcriptKey"] = `transcripts/${POISON}`;
    };
    editJson<Record<string, unknown>>(shiurFile(d, FULL, "extraction"), (e) => {
      poison(e);
      const ex = e as unknown as Extraction;
      for (const x of [...ex.summary.keyPoints, ...ex.insights, ...ex.takeaways, ...ex.stories, ...ex.questions, ...ex.sources]) {
        poison(x as unknown as Record<string, unknown>);
      }
      for (const s of ex.sections) poison(s as unknown as Record<string, unknown>);
      poison(ex.summary as unknown as Record<string, unknown>);
      poison(ex.summary.oneLiner as unknown as Record<string, unknown>);
      for (const k of ex.insights) poison(k.evidence as unknown as Record<string, unknown>);
      for (const c of ex.concepts) (c as unknown as Record<string, unknown>)["heardAs"] = [POISON];
      for (const c of ex.people) (c as unknown as Record<string, unknown>)["heardAs"] = [POISON];
    });
    editJson<Record<string, unknown>>(shiurFile(d, FULL, "writeup"), (w) => {
      poison(w);
      for (const b of (w as unknown as Writeup).en) for (const para of b.paragraphs) poison(para as unknown as Record<string, unknown>);
    });
    editJson<Record<string, unknown>>(shiurFile(d, FULL, "meta"), (m) => {
      poison(m);
      for (const r of m["recordings"] as Record<string, unknown>[]) poison(r);
    });
    editJson<IngestOutput>(join(d, "derived/ingest.json"), (i) => {
      const s = i.shiurim.find((x) => x.id === FULL)!;
      poison(s as unknown as Record<string, unknown>);
      poison(s.catalog as unknown as Record<string, unknown>);
      for (const r of i.recordings) {
        poison(r as unknown as Record<string, unknown>);
        r.transcriptKey = `transcripts/fixture/${r.id}.json`;
      }
    });
    const p = project(d);
    const s = byId(p, FULL);
    expect(s.status).toBe("full");
    const out = JSON.stringify(s) + JSON.stringify(p.index) + JSON.stringify(p.audioTable);
    expect(out).not.toContain(POISON);
    expect(out).not.toContain("unknownFutureField");
    expect(out).not.toContain("transcripts/");
    expect(out).not.toContain("asrModel");
    // The bucket key reaches the output only as the encoded path of a media URL (Amendment A1).
    const withoutUrls = out.replace(/"https:\/\/media\.example\.invalid\/[^"]*"/g, '"<url>"');
    expect(withoutUrls).not.toContain("fixture/");
    expect(s.recordings.every((r) => r.playable && r.audioUrl.startsWith("https://media.example.invalid/fixture/"))).toBe(true);
    for (const k of FORBIDDEN_KEYS) expect(allKeys(s).has(k), k).toBe(false);
  });

  it("drops items below 0.6, marks 0.6–0.75 soft, and honours the policy file", () => {
    const d = miniCopy();
    editJson<Extraction>(shiurFile(d, FULL, "extraction"), (e) => {
      e.insights[0]!.evidence.confidence = 0.59;
      e.insights[1]!.evidence.confidence = 0.6;
      e.insights[2]!.evidence.confidence = 0.75;
      e.questions[0]!.confidence = 0.1;
      e.stories[0]!.evidence.confidence = 0.7;
    });
    const s = byId(project(d), FULL);
    const ins = s.notes!.insights;
    expect(ins.map((m) => m.id)).not.toContain(`${FULL}~i0`);
    expect(ins.find((m) => m.id === `${FULL}~i1`)?.soft).toBe(true);
    expect(ins.find((m) => m.id === `${FULL}~i2`)?.soft).toBeUndefined();
    expect(s.notes!.questions.map((q) => q.id)).not.toContain(`${FULL}~q0`);
    expect(s.notes!.stories[0]!.soft).toBe(true);

    const pol = tmp();
    writeFileSync(join(pol, "publish-policy.json"), JSON.stringify({ confidence: { dropBelow: 0.8, softBelow: 0.9 }, suppress: [`${FULL}~st0`] }));
    const s2 = byId(project(d, { policyDir: pol }), FULL);
    expect(s2.notes!.insights.every((m) => m.soft === true)).toBe(true);
    expect(s2.notes!.stories.map((x) => x.id)).not.toContain(`${FULL}~st0`);
  });

  it("an out-of-range evidence segment drops the time, keeps the item, and reports it", () => {
    const d = miniCopy();
    editJson<Extraction>(shiurFile(d, FULL, "extraction"), (e) => {
      e.insights[0]!.evidence.segs = [999999];
      e.insights[1]!.evidence.segs = [999999, 3];
    });
    const p = project(d);
    const ins = byId(p, FULL).notes!.insights;
    const i0 = ins.find((m) => m.id === `${FULL}~i0`)!;
    expect(i0).toBeDefined();
    expect(i0.t).toBeNull();
    expect(i0.end).toBeNull();
    expect(ins.find((m) => m.id === `${FULL}~i1`)!.t).not.toBeNull();
    expect(p.report.timeWarnings.map((w) => w.id)).toContain(`${FULL}~i0`);
  });

  it("applies a guard suppress file (ids only) and reports suppressed and unmatched ids", () => {
    const f = join(tmp(), "suppress.json");
    const ids = [`${FULL}~i0`, `${FULL}~wen0.0`, `${FULL}~ab0`, `${FULL}~s1`, "en-nope-01~i0"];
    writeFileSync(f, JSON.stringify({ ids }));
    const p = project(MINI_DATA, { suppressFile: f });
    const n = byId(p, FULL).notes!;
    expect(n.insights.map((m) => m.id)).not.toContain(`${FULL}~i0`);
    expect(n.writeup.en[0]!.paragraphs.map((x) => x.id)).not.toContain(`${FULL}~wen0.0`);
    expect(n.summary.abstract).toEqual({ en: "", yi: "" });
    const s1 = n.chapters.find((c) => c.idx === 1)!;
    expect(s1.summary).toEqual({ en: "", yi: "" });
    expect(s1.title.en.length).toBeGreaterThan(0);
    const rep = p.report.finish({ ...p.counts, notDone: p.notDone }, 1, p.suppressIds);
    expect(rep.suppressed).toEqual(ids.filter((x) => x.startsWith(FULL)).sort());
    expect(rep.suppressUnmatched).toEqual(["en-nope-01~i0"]);
    // unsuppressed copy keeps them
    const n0 = byId(project(), FULL).notes!;
    expect(n0.insights.map((m) => m.id)).toContain(`${FULL}~i0`);
  });

  it("uses an injected keyer for every key field and reports unmapped values", () => {
    const seen = new Set<string>();
    const p = projectCorpus({
      dataDir: MINI_DATA,
      policyDir: MINI_POLICY,
      keyer: {
        id: "test",
        version: "1",
        key(kind, raw) {
          seen.add(kind);
          return { key: `${kind}:${raw.length}`, mapped: kind !== "work" };
        },
      },
    });
    // People and concepts are not keyed: their raw names are never projected (F.1).
    expect([...seen].sort()).toEqual(["parsha", "work", "zman"]);
    const s = byId(p, "yi-zmanim-tv-bb-04");
    expect(s.zman?.key).toMatch(/^zman:\d+$/);
    expect(s.notes!.sources.filter((x) => x.workKey !== null).every((x) => x.workKey!.startsWith("work:"))).toBe(true);
    const rep = p.report.finish({ ...p.counts, notDone: p.notDone }, 1, []);
    expect(rep.unmapped.work.length).toBeGreaterThan(0);
    expect(rep.unmapped.concept).toEqual([]);
    expect(rep.unmapped.person).toEqual([]);
    expect(rep.unmapped.parsha).toEqual([]);
  });
});
