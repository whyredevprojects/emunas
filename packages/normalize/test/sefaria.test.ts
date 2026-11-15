import { describe, expect, it } from "vitest";
import { compareRefs, parseSefariaRef, refLabel, sefariaUrl, type ParsedRef } from "../src/sefaria.ts";

function ok(ref: string): ParsedRef {
  const p = parseSefariaRef(ref);
  if (!p.ok) throw new Error(`expected ${ref} to parse, got ${p.reason}`);
  return p;
}

describe("parseSefariaRef", () => {
  it("parses Tanach chapter:verse", () => {
    const p = ok("Genesis 12:6");
    expect(p).toMatchObject({ corpus: "tanach", book: "Genesis", workKey: "bereishis", en: "Bereishis", he: "בראשית", commentator: null });
    expect(p.start).toEqual({ kind: "chapter", chapter: 12, verse: 6, sub: null });
    expect(p.end).toBeNull();
  });

  it("parses verse ranges, inheriting the chapter", () => {
    const p = ok("Exodus 31:16-17");
    expect(p.start).toEqual({ kind: "chapter", chapter: 31, verse: 16, sub: null });
    expect(p.end).toEqual({ kind: "chapter", chapter: 31, verse: 17, sub: null });
    expect(ok("Genesis 1:1-2:3").end).toEqual({ kind: "chapter", chapter: 2, verse: 3, sub: null });
  });

  it("parses a whole chapter", () => {
    expect(ok("Psalms 136").start).toEqual({ kind: "chapter", chapter: 136, verse: null, sub: null });
  });

  it("merges I/II books into one work but keeps their order apart", () => {
    const a = ok("I Samuel 15:1-3");
    const b = ok("II Samuel 3:1");
    expect(a.workKey).toBe("shmuel");
    expect(b.workKey).toBe("shmuel");
    expect(compareRefs("II Samuel 3:1", "I Samuel 15:1")).toBeGreaterThan(0);
  });

  it("parses Bavli daf/amud and ranges across dapim", () => {
    const p = ok("Shabbat 21b");
    expect(p).toMatchObject({ corpus: "bavli", workKey: "bavli-shabbos", he: "שבת" });
    expect(p.start).toEqual({ kind: "daf", daf: 21, amud: "b", line: null });
    const r = ok("Megillah 12b-13a");
    expect(r.end).toEqual({ kind: "daf", daf: 13, amud: "a", line: null });
    expect(ok("Berakhot 2a:5").start).toEqual({ kind: "daf", daf: 2, amud: "a", line: 5 });
    expect(ok("Arachin 32b").workKey).toBe("bavli-arachin");
  });

  it("orders dapim: 2b after 2a, before 3a", () => {
    expect(compareRefs("Berakhot 2a", "Berakhot 2b")).toBeLessThan(0);
    expect(compareRefs("Berakhot 2b", "Berakhot 3a")).toBeLessThan(0);
  });

  it("parses Mishnah, Pirkei Avot and Yerushalmi", () => {
    expect(ok("Mishnah Middot 1:3")).toMatchObject({ corpus: "mishnah", workKey: "mishnah-middos" });
    expect(ok("Pirkei Avot 3:1")).toMatchObject({ corpus: "mishnah", workKey: "pirkei-avos" });
    expect(ok("Jerusalem Talmud Yoma 1:1")).toMatchObject({ corpus: "yerushalmi", workKey: "yerushalmi-yoma" });
  });

  it("parses commentaries with the commentator's work key and the base location", () => {
    const p = ok("Rashi on Genesis 1:1:1");
    expect(p).toMatchObject({ commentator: "Rashi", workKey: "rashi", baseWorkKey: "bereishis", book: "Genesis" });
    expect(p.start).toEqual({ kind: "chapter", chapter: 1, verse: 1, sub: 1 });
    expect(ok("Ramban on Exodus 13:16:1").workKey).toBe("ramban");
    expect(ok("Or HaChaim on Deuteronomy 1:1").workKey).toBe("ohr-hachaim");
    expect(ok("Onkelos Genesis 1:1")).toMatchObject({ commentator: "Onkelos", workKey: "targum-onkelos" });
    expect(ok("Targum Jonathan on Exodus 12:1").workKey).toBe("targum-yonasan");
    expect(ok("Rambam on Mishnah Sukkah 1:1").workKey).toBe("rambam-peirush-hamishnayos");
    expect(ok("Rashi on Shabbat 21b:3")).toMatchObject({ workKey: "rashi", corpus: "bavli" });
    expect(ok("Bartenura on Pirkei Avot 1:1")).toMatchObject({ workKey: "bartenura", baseWorkKey: "pirkei-avos" });
  });

  it("parses sectioned titles", () => {
    const mt = ok("Mishneh Torah, Kings and Wars 12:1");
    expect(mt).toMatchObject({ corpus: "mishneh-torah", workKey: "mishneh-torah", section: "Kings and Wars", sectionHe: "מלכים ומלחמות" });
    expect(compareRefs("Mishneh Torah, Foundations of the Torah 1:1", "Mishneh Torah, Kings and Wars 1:1")).toBeLessThan(0);
    expect(ok("Mishneh Torah, Scrolls of Esther and Hanukkah 1:1").section).toBe("Scroll of Esther and Hanukkah");
    expect(ok("Shulchan Arukh, Orach Chayyim 1:1")).toMatchObject({ workKey: "shulchan-aruch", section: "Orach Chayim" });
    expect(ok("Midrash Tanchuma, Nasso 16")).toMatchObject({ workKey: "midrash-tanchuma", sectionHe: "נשא" });
    expect(ok("Sefer HaMitzvot, Positive Commandments 3")).toMatchObject({ workKey: "sefer-hamitzvos" });
  });

  it("keeps an unknown Mishneh Torah section (sorted last) rather than failing", () => {
    const p = ok("Mishneh Torah, Something New 1:1");
    expect(p.section).toBe("Something New");
    expect(p.sortKey[1]).toBe(999);
  });

  it("parses midrash and other works with Sefaria titles", () => {
    expect(ok("Bereshit Rabbah 39:1")).toMatchObject({ corpus: "midrash", workKey: "bereishis-rabbah" });
    expect(ok("Mesillat Yesharim 18").workKey).toBe("mesilas-yesharim");
    expect(ok("Tanya 2").workKey).toBe("tanya");
  });

  it("classifies what it cannot parse, never throws", () => {
    expect(parseSefariaRef("")).toMatchObject({ ok: false, reason: "empty" });
    expect(parseSefariaRef(null)).toMatchObject({ ok: false, reason: "empty" });
    expect(parseSefariaRef("Some Unknown Book 3:4")).toMatchObject({ ok: false, reason: "unknown-title", title: "Some Unknown Book" });
    expect(parseSefariaRef("Genesis 3:x")).toMatchObject({ ok: false });
    expect(parseSefariaRef("Genesis")).toMatchObject({ ok: true, start: null });
  });

  it("orders across corpora traditionally: Torah, Nevi'im, Kesuvim, Mishnah, Bavli", () => {
    const refs = ["Shabbat 21b", "Psalms 1:1", "Mishnah Berakhot 1:1", "Isaiah 1:1", "Genesis 50:1", "Exodus 1:1"];
    expect([...refs].sort(compareRefs)).toEqual(["Genesis 50:1", "Exodus 1:1", "Isaiah 1:1", "Psalms 1:1", "Mishnah Berakhot 1:1", "Shabbat 21b"]);
  });

  it("builds labels and outbound URLs", () => {
    expect(refLabel(ok("Genesis 12:6"), "en")).toBe("Bereishis 12:6");
    expect(refLabel(ok("Genesis 12:6"), "he")).toBe("בראשית יב, ו");
    expect(refLabel(ok("Shabbat 21b"), "he")).toBe('שבת כא ע"ב');
    expect(refLabel(ok("Exodus 31:16-17"), "en")).toBe("Shemos 31:16–31:17");
    expect(sefariaUrl("Genesis 12:6")).toBe("https://www.sefaria.org/Genesis%2012%3A6");
  });
});
