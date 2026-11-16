/**
 * Remarks on the transcript or on the shiur itself (meta-comment.ts): the term list matches whole
 * folded words in English and Yiddish, remarks on the sound or the recording pass, the post-pass fails on a planted remark in a built page and in a
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
    expect(terms("The rest is unintelligible.")).toEqual(["unintelligib*"]);
    expect(terms("Here the shiur is unclear, and the transcript ends.")).toEqual(["shiur is unclear", "transcri*"]);
    expect(terms("A long untranscribed stretch")).toEqual(["untranscrib*"]);
    expect(terms("What the ASR caught")).toEqual(["asr"]);
    expect(terms("אין א שטארק צעמישטן אנהייב רעדט דער משגיח")).toEqual(["צעמישט* אנהייב"]);
    expect(terms("דער חלק איז שטארק צעמישט.")).toEqual(["חלק איז שטארק צעמישט*"]);
    expect(terms("דער שיעור איז נישט קלאר")).toEqual(["שיעור איז נישט קלאר"]);
    expect(terms("דער טראנסקריפט האט נישט אויפגעכאפט.")).toEqual(["טראנסקריפ*"]);
  });

  it("lets remarks on the sound or the recording pass", () => {
    expect(terms("Bris (Nitzavim Elul), imperfect sound quality")).toEqual([]);
    expect(terms("The closing is poorly recorded, and the recording cuts off.")).toEqual([]);
    expect(terms("Part of it is inaudible and hard to hear; unclear audio.")).toEqual([]);
    expect(terms("אין א שוואך אויפגענומענעם סוף; די אויפנאמע ברעכט זיך, מ'הערט כמעט נישט")).toEqual([]);
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
    for (const t of ["garbl*", "unintelligib*", "shiur is unclear", "transcri*", "asr", "speech recognition"]) {
      expect(META_COMMENT_TERMS, t).toContain(t);
    }
    for (const t of META_COMMENT_TERMS) expect(terms(t.replaceAll("*", "")), t).toContain(t);
    expect(META_COMMENT_TERMS.some((t) => t.includes("צעמישט"))).toBe(true);
    expect(META_COMMENT_TERMS.some((t) => t.includes("נישט קלאר"))).toBe(true);
  });
});

describe("post-pass: remarks on the transcript or the shiur", () => {
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

  it("leaves ids and URLs in a page's attributes out, but not its text", () => {
    fx = makeFixture();
    const d = dist(fx);
    const url = "https://media.example.invalid/Simchos/03%20Bris%20garbled%20transcript.mp3";
    writeFile(join(d, "en", "rec", "index.html"), `<html><body><li data-rec="y-bris-03-garbled-transcript"><audio src="${url}"></audio><a href="${url}#t=0">0:00</a></li></body></html>`);
    expect(scan(fx, d).findings).toEqual([]);
    writeFile(join(d, "en", "rec", "index.html"), `<html><body><li data-rec="y-bris-03"><p>Bris, a garbled stretch</p></li></body></html>`);
    expect(scan(fx, d).findings.map((f) => f.kind === "meta-comment" && f.term)).toEqual(["garbl*"]);
  });

  it("fails on a remark planted in a built page (text and attributes)", () => {
    fx = makeFixture();
    const d = dist(fx);
    writeFile(join(d, "en", "shiur", SHIUR, "index.html"), `<html><body><ol><li><span class="chapter-title">Opening</span><span class="chapter-kind"> (garbled)</span></li></ol></body></html>`);
    writeFile(join(d, "yi", "about", "index.html"), `<html><body><p aria-label="דער חלק איז צעמישט">טיילן וואו מ'הערט נישט קלאר</p></body></html>`);
    writeFile(join(d, "yi", "teaching", "index.html"), `<html><body><p>די שיעורים זענען נישט קלאר, און דער שופר צעמישט דעם שטן.</p></body></html>`);
    const r = scan(fx, d);
    expect(r.findings).toEqual([
      { kind: "meta-comment", source: `dist/en/shiur/${SHIUR}/index.html`, term: "garbl*", context: "opening [garbled]", count: 1 },
      { kind: "meta-comment", source: "dist/yi/about/index.html", term: "חלק איז צעמישט*", context: "טיילן וואו מהערט נישט קלאר דער [חלק איז צעמישט]", count: 1 },
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
    writeFile(join(d, "en", "shiur", "a", "index.html"), `<html><body><p>Last comes the neshama, the unintelligible instrument.</p><p>Part is unintelligible.</p></body></html>`);
    writeFile(join(d, "data", "shiur", "a.json"), JSON.stringify({ summary: "the neshama, the UNINTELLIGIBLE instrument" }));
    writeFile(join(d, "search", "docs.ndjson"), `${JSON.stringify({ text: "the neshama, the unintelligible instrument" })}
`);
    writeFile(join(d, "en", "other", "index.html"), `<html><body><p>the neshama, the unintelligible instrument</p></body></html>`);
    writeFileSync(join(fx.site, "meta-comment-allow.json"), JSON.stringify([
      { file: "dist/en/shiur/**", phrase: "the unintelligible instrument", reason: "the neshama is the instrument no one understands", reviewedBy: "t", reviewedAt: "2026-11-16" },
      { file: "dist/data/shiur/*.json", phrase: "the unintelligible instrument", reason: "same", reviewedBy: "t", reviewedAt: "2026-11-16" },
      { file: "dist/search/docs.ndjson", phrase: "the unintelligible instrument", reason: "same", reviewedBy: "t", reviewedAt: "2026-11-16" },
    ]));
    const r = scan(fx, d);
    expect(r.findings.map((f) => (f.kind === "meta-comment" ? `${f.source} ${f.term} ${f.context}` : f.kind)).sort()).toEqual([
      "dist/en/other/index.html unintelligib* the neshama the [unintelligible] instrument",
      "dist/en/shiur/a/index.html unintelligib* …ast comes the neshama the unintelligible instrument part is [unintelligible]",
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
    writeFile(join(d, "en", "x", "index.html"), `<html><body><p>The shiur is unclear as he returns to the parsha.</p></body></html>`);
    const lines: string[] = [];
    const code = main(["post", "--scan", d, "--no-verbatim", "--no-aliases", "--site-policy", fx.site], (l) => lines.push(l));
    expect(code).toBe(1);
    expect(lines.some((l) => l.includes('FAIL remark on the transcript or the shiur "shiur is unclear"') && l.includes("en/x/index.html") && l.includes("the [shiur is unclear] as he returns"))).toBe(true);
  });
});
