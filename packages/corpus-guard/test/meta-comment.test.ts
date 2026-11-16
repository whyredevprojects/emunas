/**
 * Remarks on the audio or the transcript (meta-comment.ts): the term list matches whole folded
 * words in English and Yiddish, the post-pass fails on a planted remark in a built page and in a
 * published data file, and the reviewed allow-list passes exactly the file and term it names.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.ts";
import { LeakScanner, createLeakScanner } from "../src/index.ts";
import { META_COMMENT_TERMS, findMetaComments, readMetaCommentAllow } from "../src/meta-comment.ts";
import { SHIUR, makeFixture, shiurJson, writeFile, type Fixture } from "./fixtures.ts";

let fx: Fixture | null = null;
afterEach(() => {
  fx?.cleanup();
  fx = null;
});

const terms = (text: string) => findMetaComments(text).map((h) => h.term);

describe("findMetaComments", () => {
  it("finds the listed remarks in English and Yiddish, folded", () => {
    expect(terms("In a badly GARBLED stretch, the Mashgiach speaks of joy.")).toEqual(["garbl*"]);
    expect(terms("Part of it is inaudible; the rest is unintelligible.")).toEqual(["inaudib*", "unintelligib*"]);
    expect(terms("The name is not clear on the recording.")).toEqual(["not clear on the recording"]);
    expect(terms("The recording breaks off here, and the transcript ends.")).toEqual(["recording breaks off", "transcri*"]);
    expect(terms("A long untranscribed stretch")).toEqual(["untranscrib*"]);
    expect(terms("What the ASR caught is hard to hear.")).toEqual(["asr", "hard to hear"]);
    expect(terms("The recording is cut before the story ends.")).toEqual(["recording is cut"]);
    expect(terms("די אויפנאמע איז שטארק צעמישט.")).toEqual(["אויפנאמע איז שטארק צעמישט*"]);
    expect(terms("אין א שטארק צעמישטן אנהייב רעדט דער משגיח")).toEqual(["צעמישט* אנהייב"]);
    expect(terms("זיין נאמען הערט מען נישט קלאר.")).toEqual(["הערט מען נישט קלאר"]);
    expect(terms("די מעשה איז נישט קלאר אין דער אויפנאמע")).toEqual(["נישט קלאר אין דער אויפנאמע"]);
    expect(terms("דער טראנסקריפט האט נישט אויפגעכאפט.")).toEqual(["טראנסקריפ*"]);
    expect(terms("א שטיק וואס איז שווער צו הערן")).toEqual(["שווער צו הערן"]);
    expect(terms("ווען מ'קען נישט אויסהערן")).toEqual(["מקען נישט אויסהערן"]);
    expect(terms("אין א שוואך אויפגענומענעם סוף זאגט דער משגיח")).toEqual(["שוואך אויפגענומען*"]);
    expect(terms("נאך א לאנגן שטיק וואס מ'הערט כמעט נישט")).toEqual(["מהערט כמעט נישט"]);
  });

  it("matches whole words only and leaves ordinary words alone", () => {
    expect(terms("The Mashgiach speaks of the Basra chassidim and a gasr.")).toEqual([]);
    expect(terms("He explains the ending of the parsha; a clear teaching about hearing.")).toEqual([]);
    expect(terms("Interlude")).toEqual([]);
    expect(terms("Opening · Niggun · Another speaker")).toEqual([]);
    expect(terms("הפסקה · ניגון · אן אנדער רעדנער")).toEqual([]);
    expect(terms("עס איז קלאר אז דער משגיח רעדט")).toEqual([]);
    // The teaching's own "not clear" and "confused" pass.
    expect(terms("די תורה האט איבערגעלאזט די שיעורים נישט קלאר כדי א איד זאל גיין צום רב")).toEqual([]);
    expect(terms("דער שופר צעמישט דעם שטן; די וועלט איז צעמישט")).toEqual([]);
  });

  it("gives the term and a short folded context", () => {
    const [hit] = findMetaComments(`${"word ".repeat(40)}then a garbled line ${"more ".repeat(40)}`);
    expect(hit?.term).toBe("garbl*");
    expect(hit?.context).toMatch(/^….*then a \[garbled\] line more.*…$/);
    expect(hit!.context.length).toBeLessThan(140);
  });

  it("finds every occurrence, each with its own span", () => {
    expect(findMetaComments("garbled here, and garbled there").map((h) => [h.start, h.end])).toEqual([[0, 7], [17, 24]]);
  });

  it("keeps one curated list with no duplicates, every entry matching itself", () => {
    expect(new Set(META_COMMENT_TERMS).size).toBe(META_COMMENT_TERMS.length);
    for (const t of ["garbl*", "inaudib*", "unintelligib*", "unclear audio", "recording breaks off", "recording cuts off", "recording is cut", "transcri*", "asr", "not clear on the recording", "hard to hear"]) {
      expect(META_COMMENT_TERMS, t).toContain(t);
    }
    for (const t of META_COMMENT_TERMS) expect(terms(t.replaceAll("*", "")), t).toContain(t);
    expect(META_COMMENT_TERMS.some((t) => t.includes("צעמישט"))).toBe(true);
    expect(META_COMMENT_TERMS.some((t) => t.includes("נישט קלאר"))).toBe(true);
  });
});

describe("post-pass: remarks on the audio or the transcript", () => {
  function dist(f: Fixture): string {
    const d = join(f.root, "dist");
    writeFile(join(d, "en", "index.html"), `<html><head><meta name="description" content="Shiurim of the Mashgiach"></head><body><p>Opening</p><p>Interlude</p></body></html>`);
    writeFile(join(d, "data", "shiur", `${SHIUR}.json`), JSON.stringify(shiurJson()));
    writeFile(join(d, "data", "links.json"), JSON.stringify({ href: "/transcript/x.json", note: "clear" }));
    return d;
  }

  function scan(f: Fixture, d: string) {
    const s = createLeakScanner({ siteDir: f.site, baseDir: f.root });
    s.scanPaths([d]);
    return s.result();
  }

  it("passes clean output (a bare path is not prose)", () => {
    fx = makeFixture();
    const r = scan(fx, dist(fx));
    expect(r.findings).toEqual([]);
    expect(r.counts.metaCommentUnits).toBeGreaterThan(20);
  });

  it("fails on a remark planted in a built page (text and attributes)", () => {
    fx = makeFixture();
    const d = dist(fx);
    writeFile(join(d, "en", "shiur", SHIUR, "index.html"), `<html><body><ol><li><span class="chapter-title">Opening</span><span class="chapter-kind"> (Unclear audio)</span></li></ol></body></html>`);
    writeFile(join(d, "yi", "about", "index.html"), `<html><body><p aria-label="די רעקארדירונג">טיילן וואו מ'הערט נישט קלאר</p></body></html>`);
    writeFile(join(d, "yi", "teaching", "index.html"), `<html><body><p>די שיעורים זענען נישט קלאר, און דער שופר צעמישט דעם שטן.</p></body></html>`);
    const r = scan(fx, d);
    expect(r.findings).toEqual([
      { kind: "meta-comment", source: `dist/en/shiur/${SHIUR}/index.html`, term: "unclear audio", context: "opening [unclear audio] chapter title chapter kind", count: 1 },
      { kind: "meta-comment", source: "dist/yi/about/index.html", term: "מהערט נישט קלאר", context: "טיילן וואו [מהערט נישט קלאר] די רעקארדירונג", count: 1 },
    ]);
  });

  it("fails on a remark planted in a published data file, with its field", () => {
    fx = makeFixture();
    const d = dist(fx);
    const shiur = shiurJson({ paragraph: "In a badly garbled stretch, the Mashgiach speaks of the joy above." }) as { notes: { chapters: { title: { yi: string } }[] } };
    shiur.notes.chapters[0]!.title.yi = "אנהייב אן א טראנסקריפט";
    writeFile(join(d, "data", "shiur", `${SHIUR}.json`), JSON.stringify(shiur));
    writeFile(join(d, "search", "docs.ndjson"), `${JSON.stringify({ id: SHIUR, text: "the transcript holds only fragments" })}\n`);
    const r = scan(fx, d);
    const hits = r.findings.map((f) => (f.kind === "meta-comment" ? `${f.source} ${f.field ?? ""} ${f.term}` : f.kind)).sort();
    expect(hits).toEqual([
      `dist/data/shiur/${SHIUR}.json notes.chapters[].title.yi טראנסקריפ*`,
      `dist/data/shiur/${SHIUR}.json notes.writeup.en[].paragraphs[].text garbl*`,
      "dist/search/docs.ndjson:1 text transcri*",
    ]);
    expect(r.findings.find((f) => f.kind === "meta-comment" && f.term === "garbl*")).toMatchObject({ context: "in a badly [garbled] stretch the mashgiach speaks of the joy above" });
  });

  it("an allow-list entry passes exactly the hits inside its phrase, in the files its glob names", () => {
    fx = makeFixture();
    const d = dist(fx);
    writeFile(join(d, "en", "shiur", "a", "index.html"), `<html><body><p>Last comes the neshama, the inaudible instrument.</p><p>Part is inaudible.</p></body></html>`);
    writeFile(join(d, "data", "shiur", "a.json"), JSON.stringify({ summary: "the neshama, the INAUDIBLE instrument" }));
    writeFile(join(d, "search", "docs.ndjson"), `${JSON.stringify({ text: "the neshama, the inaudible instrument" })}
`);
    writeFile(join(d, "en", "other", "index.html"), `<html><body><p>the neshama, the inaudible instrument</p></body></html>`);
    writeFileSync(join(fx.site, "meta-comment-allow.json"), JSON.stringify([
      { file: "dist/en/shiur/**", phrase: "the inaudible instrument", reason: "the neshama is the instrument without sound", reviewedBy: "t", reviewedAt: "2026-11-16" },
      { file: "dist/data/shiur/*.json", phrase: "the inaudible instrument", reason: "same", reviewedBy: "t", reviewedAt: "2026-11-16" },
      { file: "dist/search/docs.ndjson", phrase: "the inaudible instrument", reason: "same", reviewedBy: "t", reviewedAt: "2026-11-16" },
    ]));
    const r = scan(fx, d);
    expect(r.findings.map((f) => (f.kind === "meta-comment" ? `${f.source} ${f.term} ${f.context}` : f.kind)).sort()).toEqual([
      "dist/en/other/index.html inaudib* the neshama the [inaudible] instrument",
      "dist/en/shiur/a/index.html inaudib* last comes the neshama the inaudible instrument part is [inaudible]",
    ]);
    expect(r.counts.metaCommentAllowed).toBe(3);
  });

  it("leaves the approved transcript view out only when it is on for an eligible recording", () => {
    fx = makeFixture();
    const d = dist(fx);
    writeFile(join(d, "en", "shiur", SHIUR, "index.html"), `<html><body><section class="follow-text" data-follow-text><p>From a transcription a person approved.</p></section><p>Opening</p></body></html>`);
    const off = scan(fx, d);
    expect(off.findings.map((f) => f.kind)).toEqual(["meta-comment"]);
    const s = new LeakScanner({ baseDir: fx.root, transcripts: { enabled: true, versions: new Map([["rec", "v"]]) } });
    s.scanPaths([d]);
    expect(s.result().findings).toEqual([]);
  });

  it("rejects a malformed allow-list or a phrase without a listed term", () => {
    fx = makeFixture();
    writeFileSync(join(fx.site, "meta-comment-allow.json"), JSON.stringify([{ file: "a.html", phrase: "it was mumbled", reason: "r", reviewedBy: "t", reviewedAt: "2026-11-16" }]));
    expect(() => readMetaCommentAllow(fx!.site)).toThrow(/holds no listed term/);
    writeFileSync(join(fx.site, "meta-comment-allow.json"), JSON.stringify([{ file: "a.html", phrase: "the asr" }]));
    expect(() => readMetaCommentAllow(fx!.site)).toThrow(/needs a non-empty "reason"/);
  });

  it("CLI exits non-zero and names the file, term and context", () => {
    fx = makeFixture();
    const d = dist(fx);
    writeFile(join(d, "en", "x", "index.html"), `<html><body><p>The recording cuts off as he returns to the parsha.</p></body></html>`);
    const lines: string[] = [];
    const code = main(["post", "--scan", d, "--no-verbatim", "--no-aliases", "--site-policy", fx.site], (l) => lines.push(l));
    expect(code).toBe(1);
    expect(lines.some((l) => l.includes('FAIL remark on the audio or transcript "recording cuts off"') && l.includes("en/x/index.html") && l.includes("the [recording cuts off] as he returns"))).toBe(true);
  });
});
