import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.ts";
import { createLeakScanner } from "../src/index.ts";
import { runPrePass } from "../src/pre.ts";
import { readVerbatimAllow } from "../src/policy.ts";
import { checkBudgets } from "../src/budgets.ts";
import { createPagefindChecker } from "../src/pagefind.ts";
import { readShiurRecordings } from "../src/corpus.ts";
import { VerbatimMatcher } from "../src/verbatim.ts";
import {
  FILLER,
  HEBREW,
  OTHER_SHIUR,
  REC,
  SENTENCE,
  SHIUR,
  makeFixture,
  shiurJson,
  words,
  writeFile,
  type Fixture,
} from "./fixtures.ts";

const RUN20 = words(2, 20);
const RUN11 = words(5, 11);
const RUN14 = words(8, 14);
const RUN22 = words(0, 22);

/** The planted corpus: kp0 has a 20-token run, i0 an 11-token run, tk0 a 22-token run (allow-listed), w-en-0-p0 a 14-token run. */
function planted(): unknown {
  return shiurJson({
    keyPoint: `${FILLER} ${RUN20} ${FILLER}`,
    insight: `${FILLER} ${RUN11} ${FILLER}`,
    takeaway: RUN22,
    paragraph: `${FILLER} ${RUN14}`,
  });
}

let fx: Fixture | null = null;
afterEach(() => {
  fx?.cleanup();
  fx = null;
});

function allTokensOfSentence(): string[] {
  return [...SENTENCE, ...HEBREW.split(/\s+/)];
}

/** No transcript token at all may appear in a report. */
function expectNoTranscriptTokens(text: string): void {
  const lower = text.toLowerCase();
  for (const w of SENTENCE) expect(lower).not.toContain(w);
  for (const w of ["בראשית", "וועלט", "באשאפן", "ישראל"]) expect(text).not.toContain(w);
  expect(allTokensOfSentence().length).toBeGreaterThan(30);
}

describe("pre-pass", () => {
  it("suppresses a planted 20-token run, reports 14, ignores 11, honours the allow-list", () => {
    fx = makeFixture({ shiur: planted(), allow: [`${SHIUR}~tk0`] });
    const r = runPrePass(fx.corpus, { transcriptsDir: fx.transcripts, allow: readVerbatimAllow(fx.site) });

    expect(r.suppress.map((s) => s.id)).toEqual([`${SHIUR}~kp0`]);
    expect(r.suppress[0]).toMatchObject({ reason: "verbatim-run", shiurId: SHIUR, runLength: 20, fields: ["notes.summary.keyPoints[].text.en"] });
    expect(r.allowed.map((s) => s.id)).toEqual([`${SHIUR}~tk0`]);
    expect(r.allowed[0]!.runLength).toBe(22);

    const reported = new Map(r.report.map((e) => [e.id, e.runLength]));
    expect(reported.get(`${SHIUR}~w-en-0-p0`)).toBe(14);
    expect(reported.has(`${SHIUR}~i0`)).toBe(false); // 11 tokens: silent
    expect(r.counts).toMatchObject({ shiurim: 2, shiurimScanned: 2, suppressed: 1, allowed: 1, reported: 3 });
  });

  it("matches Hebrew across nikud and quote-mark differences", () => {
    const hebrewRun = "בראשית ברא אלקים את השמים ואת הארץ חז\"ל זאגן אז די וועלט איז באשאפן געווארן פאר די תורה און פאר";
    fx = makeFixture({ shiur: shiurJson({ paragraph: hebrewRun }) });
    const r = runPrePass(fx.corpus, { transcriptsDir: fx.transcripts });
    expect(r.suppress.map((s) => [s.id, s.runLength])).toEqual([[`${SHIUR}~w-en-0-p0`, 20]]);
  });

  it("does not match text against another shiur's transcript", () => {
    fx = makeFixture();
    // Put the run in the *other* shiur, whose transcript does not contain it.
    writeFile(join(fx.corpus, "shiurim", `${OTHER_SHIUR}.json`), JSON.stringify(shiurJson({ keyPoint: RUN22 }, OTHER_SHIUR, "yi-test-rec-02")));
    const r = runPrePass(fx.corpus, { transcriptsDir: fx.transcripts });
    expect(r.suppress).toEqual([]);
  });

  it("counts shiurim without transcripts and unreadable files without failing", () => {
    fx = makeFixture();
    writeFile(join(fx.corpus, "shiurim", "no-transcript.json"), JSON.stringify({ id: "no-transcript", recordings: [{ id: "missing-rec" }] }));
    writeFile(join(fx.corpus, "shiurim", "broken.json"), "{ not json");
    const r = runPrePass(fx.corpus, { transcriptsDir: fx.transcripts });
    expect(r.counts.shiurimWithoutTranscript).toBe(1);
    expect(r.counts.recordingsMissing).toBe(1);
    expect(r.counts.unreadableFiles).toBe(1);
  });

  it("CLI writes suppress.json with ids only (no transcript tokens)", () => {
    fx = makeFixture({ shiur: planted(), allow: [`${SHIUR}~tk0`] });
    const out = join(fx.root, "suppress.json");
    const logs: string[] = [];
    const code = main(["pre", "--corpus", fx.corpus, "--transcripts", fx.transcripts, "--out", out, "--site-policy", fx.site], (s) => logs.push(s));
    expect(code).toBe(0);
    const text = readFileSync(out, "utf8");
    const json = JSON.parse(text) as { suppress: { id: string }[]; thresholds: unknown };
    expect(json.suppress.map((s) => s.id)).toEqual([`${SHIUR}~kp0`]);
    expect(json.thresholds).toEqual({ report: 12, suppress: 20 });
    expectNoTranscriptTokens(text);
    expectNoTranscriptTokens(logs.join("\n"));
    expect(logs.join("\n")).toMatch(/suppressed \(≥20\) 1/);
  });
});

describe("post-pass", () => {
  function scanner(f: Fixture, env: Record<string, string> = {}) {
    return createLeakScanner({ corpusDir: f.corpus, transcriptsDir: f.transcripts, siteDir: f.site, env, baseDir: f.root });
  }

  function dist(f: Fixture): string {
    const d = join(f.root, "dist");
    writeFile(join(d, "en", "shiur", SHIUR, "index.html"), `<!doctype html><html><body><h1>Shiur</h1><p>${FILLER}</p></body></html>`);
    writeFile(join(d, "data", "index.json"), JSON.stringify([{ id: SHIUR, oneLiner: { en: "A short line." } }]));
    writeFile(join(d, "search", "docs.ndjson"), `${JSON.stringify({ id: `${SHIUR}~kp0`, text: FILLER })}\n${JSON.stringify({ id: SHIUR, keywords: ["a"] })}\n`);
    writeFile(join(d, "assets", "app.js"), `const x={title:"hello",segmentsCount:2};export default x;`);
    writeFile(join(d, "fonts", "f.woff2"), Uint8Array.from([0, 1, 2, 3, 0]));
    return d;
  }

  it("passes clean output", () => {
    fx = makeFixture();
    const s = scanner(fx);
    s.scanPaths([dist(fx)]);
    const r = s.result();
    expect(r.findings).toEqual([]);
    expect(r.counts.files).toBe(5);
    expect(r.counts.filesSkippedBinary).toBe(1);
  });

  it("fails on a planted heardAs key (JSON, NDJSON, JS bundle, entity-encoded island props)", () => {
    fx = makeFixture();
    const d = dist(fx);
    writeFile(join(d, "data", "s.json"), JSON.stringify({ id: SHIUR, sources: [{ work: "Tanya", heardAs: "x" }] }));
    writeFile(join(d, "search", "more.ndjson"), `${JSON.stringify({ id: "a", meta: { asrNotes: "x" } })}\n`);
    writeFile(join(d, "assets", "b.js"), `var a={heardAs:"x"};`);
    writeFile(join(d, "en", "island.html"), `<astro-island props="{&quot;segs&quot;:[1,[2]]}"></astro-island>`);
    const s = scanner(fx);
    s.scanPaths([d]);
    const keys = s.result().findings.filter((f) => f.kind === "key").map((f) => `${f.source}:${f.kind === "key" ? f.key : ""}`).sort();
    expect(keys).toEqual([
      "dist/assets/b.js:heardAs",
      "dist/data/s.json:heardAs",
      "dist/en/island.html:segs",
      "dist/search/more.ndjson:1:asrNotes",
    ]);
    const s2 = s.result().findings.find((f) => f.kind === "key" && f.source === "dist/data/s.json");
    expect(s2).toMatchObject({ field: "sources[].heardAs" });
  });

  it("does not flag `segments` as a bare identifier in third-party JS", () => {
    fx = makeFixture();
    const d = join(fx.root, "dist2");
    writeFile(join(d, "vendor.js"), `function m(segments){return {segments:segments.length}}`);
    const s = scanner(fx);
    s.scanPaths([d]);
    expect(s.result().findings).toEqual([]);
  });

  it("fails on forbidden substrings", () => {
    fx = makeFixture();
    const d = join(fx.root, "dist3");
    writeFile(join(d, "a.json"), JSON.stringify({ url: "r2://emunas/transcripts/foo.json" }));
    writeFile(join(d, "b.html"), `<a href="/x/input.txt">x</a>`);
    writeFile(join(d, "c.js"), `fetch("/t/rec.vtt")`);
    writeFile(join(d, "d.txt"), `see data/derived/audits/`);
    const s = scanner(fx);
    s.scanPaths([d]);
    const subs = s.result().findings.map((f) => (f.kind === "substring" ? f.substring : f.kind)).sort();
    expect(subs).toEqual([".vtt", "audits/", "input.txt", "transcripts/"]);
  });

  it("fails on a planted 20-token run in HTML, JSON and a JS bundle; 11 tokens pass silently", () => {
    fx = makeFixture();
    const d = join(fx.root, "dist4");
    writeFile(join(d, "en", "shiur", SHIUR, "index.html"), `<html><body><p>${FILLER}</p><p>${RUN20.split(" ").slice(0, 7).join(" ")} <a href="#s">${RUN20.split(" ").slice(7).join(" ")}</a></p></body></html>`);
    writeFile(join(d, "yi", "shiur", SHIUR, "index.html"), `<html><body><p>${RUN11}</p></body></html>`);
    writeFile(join(d, "data", `${SHIUR}.json`), JSON.stringify({ id: SHIUR, things: [{ text: RUN20 }] }));
    // A JS bundle with the run JSON-escaped and not attributable to a shiur → checked against all transcripts.
    const escaped = JSON.stringify(RUN20).replace(/[a-z]/g, (c) => `\\u00${c.charCodeAt(0).toString(16)}`);
    writeFile(join(d, "assets", "chunk.js"), `export const s=${escaped};`);
    const s = scanner(fx);
    s.scanPaths([d]);
    const r = s.result();
    const verbatim = r.findings.filter((f) => f.kind === "verbatim");
    expect(verbatim.map((f) => f.source).sort()).toEqual([
      "dist4/assets/chunk.js",
      "dist4/data/yi-test-shiur-01.json",
      `dist4/en/shiur/${SHIUR}/index.html`,
    ]);
    for (const f of verbatim) expect(f.kind === "verbatim" && f.runLength).toBe(20);
    expect(r.findings).toHaveLength(3);
    expect(r.verbatim.some((v) => v.source.startsWith("dist4/yi/"))).toBe(false);
    expect(r.counts.unitsCheckedAgainstCorpus).toBeGreaterThan(0);
  });

  it("an allow-listed item passes in JSON (by id) and in HTML (by its text)", () => {
    fx = makeFixture({ shiur: planted(), allow: [`${SHIUR}~tk0`] });
    const d = join(fx.root, "dist5");
    writeFile(join(d, "shiurim", `${SHIUR}.json`), JSON.stringify(shiurJson({ takeaway: RUN22 })));
    writeFile(join(d, "en", "shiur", SHIUR, "index.html"), `<html><body><li>${RUN22}</li></body></html>`);
    const s = scanner(fx);
    s.scanPaths([d]);
    const r = s.result();
    expect(r.findings).toEqual([]);
    expect(r.verbatim.filter((v) => v.allowed).length).toBe(2);
  });

  it("the same run without the allow-list fails", () => {
    fx = makeFixture({ shiur: planted() });
    const d = join(fx.root, "dist6");
    writeFile(join(d, "en", "shiur", SHIUR, "index.html"), `<html><body><li>${RUN22}</li></body></html>`);
    const s = scanner(fx);
    s.scanPaths([d]);
    expect(s.result().findings.map((f) => f.kind)).toEqual(["verbatim"]);
  });

  it("transcript files are rejected unless eligible and the flag is on", () => {
    fx = makeFixture();
    writeFile(join(fx.site, "transcript-eligibility.json"), JSON.stringify({ policyVersion: 1, eligible: { [REC]: { model: "m" } } }));
    const d = join(fx.root, "dist7");
    writeFile(join(d, "transcript", `${REC}.json`), JSON.stringify({ segments: [[0, 1, RUN22]] }));
    writeFile(join(d, "transcript", "yi-test-rec-02.json"), JSON.stringify({ segments: [] }));

    const off = scanner(fx);
    off.scanPaths([d]);
    expect(off.result().findings.map((f) => (f.kind === "transcript-file" ? f.recordingId : f.kind)).sort()).toEqual([REC, "yi-test-rec-02"]);

    const on = scanner(fx, { EMUNAS_TRANSCRIPT_VIEW: "on" });
    on.scanPaths([d]);
    const r = on.result();
    expect(r.findings.map((f) => (f.kind === "transcript-file" ? f.recordingId : f.kind))).toEqual(["yi-test-rec-02"]);
    expect(r.counts.transcriptFilesAllowed).toBe(1);
  });

  it("CLI exits non-zero on findings and its report holds no transcript text", () => {
    fx = makeFixture({ shiur: planted() });
    const d = join(fx.root, "dist8");
    writeFile(join(d, "en", "shiur", SHIUR, "index.html"), `<p>${RUN20}</p><p>${RUN14}</p>`);
    writeFile(join(d, "x.json"), JSON.stringify({ heardAs: RUN22 }));
    const report = join(fx.root, "post-report.json");
    const logs: string[] = [];
    const code = main(
      ["post", "--scan", d, "--corpus", fx.corpus, "--transcripts", fx.transcripts, "--site-policy", fx.site, "--report", report],
      (s) => logs.push(s),
    );
    expect(code).toBe(1);
    const text = readFileSync(report, "utf8");
    expectNoTranscriptTokens(text);
    expectNoTranscriptTokens(logs.join("\n"));
    const json = JSON.parse(text) as { findings: { kind: string }[]; verbatim: { runLength: number }[] };
    expect(json.findings.map((f) => f.kind).sort()).toEqual(["key", "verbatim", "verbatim"]);
  });

  it("CLI exits zero on clean output", () => {
    fx = makeFixture();
    const d = join(fx.root, "dist9");
    writeFile(join(d, "index.html"), `<p>${FILLER}</p>`);
    const code = main(["post", "--scan", d, "--corpus", fx.corpus, "--transcripts", fx.transcripts, "--site-policy", fx.site], () => {});
    expect(code).toBe(0);
  });

  it("guard post on the whole .corpus/ after a pre-pass + suppression is clean", () => {
    // Simulates deploy.yml steps 2–5: corpus:build --suppress drops the suppressed item.
    fx = makeFixture({ shiur: planted(), allow: [`${SHIUR}~tk0`] });
    const pre = runPrePass(fx.corpus, { transcriptsDir: fx.transcripts, allow: readVerbatimAllow(fx.site) });
    writeFile(join(fx.corpus, "suppress.json"), JSON.stringify(pre));
    const rebuilt = shiurJson({ insight: `${FILLER} ${RUN11}`, takeaway: RUN22, paragraph: `${FILLER} ${RUN14}` });
    rebuilt.notes.summary.keyPoints = []; // suppressed
    writeFile(join(fx.corpus, "shiurim", `${SHIUR}.json`), JSON.stringify(rebuilt));
    const s = scanner(fx);
    s.scanPaths([fx.corpus]);
    expect(s.result().findings).toEqual([]);
  });
});

describe("Pagefind record checker", () => {
  it("flags forbidden meta keys and verbatim content, passes clean records", () => {
    fx = makeFixture();
    const check = createPagefindChecker({
      matcher: new VerbatimMatcher({ transcriptsDir: fx.transcripts, shiurRecordings: readShiurRecordings(fx.corpus) }),
    });
    expect(check({ url: `/en/shiur/${SHIUR}/`, content: FILLER, meta: { title: "x" }, filters: { lang: ["yi"] } })).toEqual([]);
    expect(check({ url: `/en/shiur/${SHIUR}/`, content: RUN20 }).map((f) => f.kind)).toEqual(["verbatim"]);
    expect(check({ url: "/x/", content: "a", meta: { heardAs: "x" } }).map((f) => f.kind)).toEqual(["key"]);
  });
});

describe("budgets", () => {
  it("counts files and flags oversize files and too many files", () => {
    fx = makeFixture();
    const d = join(fx.root, "site");
    writeFile(join(d, "a.html"), "x".repeat(100));
    writeFile(join(d, "b", "c.js"), "y".repeat(10));
    writeFile(join(d, "b", "d.css"), "z");
    const ok = checkBudgets(d);
    expect(ok).toMatchObject({ files: 3, totalBytes: 111, findings: [] });
    expect(ok.largest).toEqual({ file: "a.html", bytes: 100 });
    const bad = checkBudgets(d, { maxFiles: 2, maxFileBytes: 50 });
    expect(bad.findings.map((f) => f.kind).sort()).toEqual(["file-count", "file-size"]);
    const logs: string[] = [];
    expect(main(["budgets", d, "--max-files", "2"], (s) => logs.push(s))).toBe(1);
    expect(main(["budgets", d], () => {})).toBe(0);
    expect(readdirSync(d).length).toBe(2);
    expect(statSync(join(d, "a.html")).size).toBe(100);
  });
});
