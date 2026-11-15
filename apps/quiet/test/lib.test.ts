import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { playableUrl, timeTarget, type AudioRecording } from "../src/lib/audio.ts";
import { clock, runAttrs } from "../src/lib/bidi.ts";
import { catalogNotice } from "../src/lib/catalog.ts";
import { dirOf, editionOfPath, otherEdition, switchEdition } from "../src/lib/edition.ts";
import { withPlace } from "../src/lib/edition-switch.client.ts";
import { fontPreloads, quietFontsCss } from "../src/lib/fonts.ts";
import { INDEXES_ANCHOR, navItems, navSectionOf } from "../src/lib/nav.ts";

const media = "https://media.example.org";
const two: AudioRecording[] = [
  { id: "a", offset: 0, duration: 100, audioUrl: `${media}/x/A%20one.mp3` },
  { id: "b", offset: 100, duration: 50.5, audioUrl: `${media}/x/b.MP3` },
];

describe("edition", () => {
  it("knows direction and the other edition", () => {
    expect(dirOf("yi")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
    expect(otherEdition("yi")).toBe("en");
    expect(otherEdition("en")).toBe("yi");
  });

  it("reads the edition from the first segment only", () => {
    expect(editionOfPath("/yi/shiur/x/")).toBe("yi");
    expect(editionOfPath("/en")).toBe("en");
    expect(editionOfPath("/en?q=1")).toBe("en");
    expect(editionOfPath("/")).toBeNull();
    expect(editionOfPath("/english/")).toBeNull();
    expect(editionOfPath("/audio/en.mp3")).toBeNull();
  });

  it("switches edition keeping path, query and hash", () => {
    expect(switchEdition("/yi/shiur/yi-parshas-hashavua-brshys-01/#t=754", "en")).toBe(
      "/en/shiur/yi-parshas-hashavua-brshys-01/#t=754",
    );
    expect(switchEdition("/en/search/?q=lag%20baomer#r2", "yi")).toBe("/yi/search/?q=lag%20baomer#r2");
    expect(switchEdition("/en/people/#baal-shem-tov", "yi")).toBe("/yi/people/#baal-shem-tov");
    expect(switchEdition("/en/", "yi")).toBe("/yi/");
    expect(switchEdition("/en", "yi")).toBe("/yi/");
    expect(switchEdition("/", "yi")).toBe("/yi/");
    // a segment that merely starts with "en" is not swapped
    expect(switchEdition("/yi/enough/", "en")).toBe("/en/enough/");
    expect(() => switchEdition("en/x/", "yi")).toThrow(TypeError);
  });

  it("puts the live query and hash on the built switch href", () => {
    expect(withPlace("/en/shiur/x/", "", "#s3")).toBe("/en/shiur/x/#s3");
    expect(withPlace("/en/shiur/x/#old", "", "#t=12")).toBe("/en/shiur/x/#t=12");
    expect(withPlace("/en/search/", "?q=a", "")).toBe("/en/search/?q=a");
    expect(withPlace("/en/search/?q=old#h", "", "")).toBe("/en/search/");
  });
});

describe("nav", () => {
  it("has the five items in order with @emunas/links paths", () => {
    expect(navItems("yi").map((i) => [i.id, i.href])).toEqual([
      ["contents", "/yi/contents/"],
      ["calendar", "/yi/calendar/"],
      ["indexes", `/yi/#${INDEXES_ANCHOR}`],
      ["search", "/yi/search/"],
      ["about", "/yi/about/"],
    ]);
  });

  it("places pages under a nav item", () => {
    expect(navSectionOf("/en/shiur/x/")).toBe("contents");
    expect(navSectionOf("/en/section/zmanim/")).toBe("contents");
    expect(navSectionOf("/yi/calendar/zman/chanukah/")).toBe("calendar");
    expect(navSectionOf("/yi/years/5743/")).toBe("calendar");
    expect(navSectionOf("/yi/inyanim/emunah/")).toBe("indexes");
    expect(navSectionOf("/en/search/")).toBe("search");
    expect(navSectionOf("/en/about/")).toBe("about");
    expect(navSectionOf("/en/")).toBeNull();
    expect(navSectionOf("/")).toBeNull();
  });
});

describe("audio (Amendment A1)", () => {
  it("accepts only http(s) .mp3 URLs and drops a hash", () => {
    expect(playableUrl({ audioUrl: `${media}/a/b.mp3` })).toBe(`${media}/a/b.mp3`);
    expect(playableUrl({ audioUrl: `${media}/a/b.MP3#t=3` })).toBe(`${media}/a/b.MP3`);
    expect(playableUrl({ audioUrl: `${media}/a/b.mp3?v=2` })).toBe(`${media}/a/b.mp3?v=2`);
    expect(playableUrl({ audioUrl: `${media}/a/b.WMA` })).toBeNull();
    expect(playableUrl({ audioUrl: "/audio/x.mp3" })).toBeNull();
    expect(playableUrl({ audioUrl: "javascript:alert(1)//.mp3" })).toBeNull();
    expect(playableUrl({ audioUrl: "" })).toBeNull();
    expect(playableUrl({ audioUrl: null })).toBeNull();
  });

  it("resolves global time to the recording-local media fragment", () => {
    expect(timeTarget(two, 754 / 10)).toEqual({
      recordingId: "a",
      part: 1,
      parts: 2,
      local: 75,
      global: 75.4,
      href: `${media}/x/A%20one.mp3#t=75`,
    });
    const second = timeTarget(two, 130.9);
    expect(second).toMatchObject({ recordingId: "b", part: 2, local: 30, href: `${media}/x/b.MP3#t=30` });
    // a boundary belongs to the later recording
    expect(timeTarget(two, 100)).toMatchObject({ recordingId: "b", local: 0 });
    // past the end clamps to the last recording's end
    expect(timeTarget(two, 9999)).toMatchObject({ recordingId: "b", local: 50 });
    expect(timeTarget(two, Number.NaN)).toBeNull();
    expect(timeTarget([], 10)).toBeNull();
  });

  it("gives no href when the recording is not playable", () => {
    const recs: AudioRecording[] = [{ id: "w", offset: 0, duration: 60, audioUrl: null }];
    expect(timeTarget(recs, 12)).toMatchObject({ recordingId: "w", href: null });
  });
});

describe("bidi", () => {
  it("sets lang/dir for catalog runs by script and shiur language", () => {
    expect(runAttrs("The Power of Man", "en")).toEqual({ lang: "en", dir: "ltr" });
    expect(runAttrs("פרשת השבוע", "yi")).toEqual({ lang: "yi", dir: "rtl" });
    expect(runAttrs("נח", "en")).toEqual({ lang: "he", dir: "rtl" });
    expect(runAttrs("The קדושה of צדיקים", "en")).toEqual({ lang: "en", dir: "ltr" });
    expect(runAttrs("המקוה והתיבה הם כמו embassy של שמים", "yi")).toEqual({ lang: "yi", dir: "rtl" });
  });

  it("formats clock times with ordinary digits", () => {
    expect(clock(754)).toBe("12:34");
    expect(clock(3723.9)).toBe("1:02:03");
    expect(clock(-5)).toBe("0:00");
  });
});

describe("catalog notice", () => {
  it("is null for printed guide rows and worded by derivation otherwise", () => {
    expect(catalogNotice({ source: "pocket-guide-2012", derived: "catalog" }, "en")).toBeNull();
    expect(catalogNotice({ source: "uncatalogued-guide", derived: "filename" }, "en")).toMatch(/file name/);
    expect(catalogNotice({ source: "uncatalogued-guide", derived: "dir-prefix" }, "en")).toMatch(/folder/);
    expect(catalogNotice({ source: "uncatalogued-guide", derived: "pocket-guide" }, "yi")).toMatch(/פאקעט גייד/);
  });
});

describe("fonts", () => {
  it("points the tokens font URLs at /fonts/", () => {
    const css = quietFontsCss('/* Generated by x. Do not edit. */\n@font-face { src: url("../fonts/a.woff2") format("woff2"); }\n');
    expect(css).toContain('url("/fonts/a.woff2")');
    expect(css).not.toContain("../fonts/");
    expect(css.split("Generated by").length).toBe(2);
  });

  it("preloads only the edition's serif body face", () => {
    expect(fontPreloads("yi")).toEqual(["/fonts/frank-ruhl-libre-hebrew.woff2"]);
    expect(fontPreloads("en")).toEqual(["/fonts/source-serif-4-latin.woff2"]);
  });

  it("the preloaded files exist in public/fonts", () => {
    for (const href of [...fontPreloads("yi"), ...fontPreloads("en")]) {
      expect(readFileSync(new URL(`../public${href}`, import.meta.url)).byteLength).toBeGreaterThan(1000);
    }
  });
});
