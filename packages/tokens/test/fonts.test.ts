import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UI_DIR, UI_LANGS } from "@emunas/i18n";
import { LANG_SCRIPT, fontManifest, langsOfScript, preloadFonts } from "../src/index.ts";
import { parseUnicodeRange, readWoff2 } from "./woff2.ts";

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fontsDir = join(pkg, "fonts");
const cssDir = join(pkg, "css");

/** Total woff2 budget across all faces (integration-plan §8 W1.7). */
const BUDGET_BYTES = 220 * 1000;

interface CssFace {
  family: string;
  style: string;
  file: string;
  range: Set<number>;
  codePoints: ReadonlySet<number>;
}

/** The @font-face rules as the browser will see them, read from the committed css/fonts.css. */
function cssFaces(): CssFace[] {
  const css = readFileSync(join(cssDir, "fonts.css"), "utf8");
  const faces: CssFace[] = [];
  for (const [, body = ""] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const url = /src:\s*url\("([^"]+)"\)/.exec(body)?.[1];
    if (!url) continue; // local() fallback faces
    const family = /font-family:\s*"([^"]+)"/.exec(body)?.[1] ?? "";
    const style = /font-style:\s*(\w+)/.exec(body)?.[1] ?? "normal";
    const range = parseUnicodeRange(/unicode-range:\s*([^;]+);/.exec(body)?.[1] ?? "");
    const file = resolve(cssDir, url);
    faces.push({ family, style, file, range, codePoints: readWoff2(readFileSync(file)).codePoints });
  }
  return faces;
}

const faces = cssFaces();

/** Code points a stack can draw: present in some face's cmap and inside that face's unicode-range. */
function stackCovers(families: readonly string[], style: string, cp: number): boolean {
  return faces.some((f) => families.includes(f.family) && f.style === style && f.range.has(cp) && f.codePoints.has(cp));
}

const span = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const assigned = (cp: number): boolean => /\p{Assigned}/u.test(String.fromCodePoint(cp));
const hex = (cp: number): string => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;

/** Acceptance ranges. U+FB37/3D/3F/42/45 are unassigned in Unicode and are skipped. */
const HEBREW_REQUIRED = [
  ...span(0x05d0, 0x05ea), // letters
  ...span(0x05f0, 0x05f4), // Yiddish digraphs װ ױ ײ, geresh, gershayim
  ...span(0xfb1d, 0xfb4f), // presentation forms (pointed letters, Yiddish ײַ, אַ, אָ, …)
  ...span(0x0591, 0x05c7), // cantillation and nikud
].filter(assigned);

/**
 * Transliteration Latin used in the English notes (ḥ, ’) plus the basics around it.
 * Ḳ ḳ (U+1E32/33) and ẖ (U+1E96) are not in Source Serif 4, so they are not required;
 * they fall back to the system serif.
 */
const TRANSLIT_REQUIRED = [
  ..."ḤḥṬṭṢṣẒẓŠšŽžĀāĒēĪīŌōŪūŚśʾʿʼʻ’‘“”–—…é".split("").map((ch) => ch.codePointAt(0) ?? 0),
  ...span(0x20, 0x7e),
];

describe("font files", () => {
  it("match the manifest (size, sha256) and every file is listed", () => {
    for (const face of fontManifest.faces) {
      const file = join(fontsDir, face.file);
      const bytes = readFileSync(file);
      expect(bytes.length, face.file).toBe(face.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), face.file).toBe(face.sha256);
    }
    const onDisk = readdirSync(fontsDir).filter((f) => f.endsWith(".woff2")).sort();
    expect(onDisk).toEqual(fontManifest.faces.map((f) => f.file).sort());
  });

  it("are real woff2 whose cmap equals the manifest's unicode-range", () => {
    for (const face of fontManifest.faces) {
      const { codePoints, tables } = readWoff2(readFileSync(join(fontsDir, face.file)));
      expect([...codePoints].sort((a, b) => a - b), face.file).toEqual(
        [...parseUnicodeRange(face.unicodeRange)].sort((a, b) => a - b),
      );
      for (const required of ["head", "hhea", "glyf", "GSUB", "name"]) {
        if (required === "GSUB" && face.id.endsWith("translit")) continue;
        expect(tables.has(required), `${face.file} ${required}`).toBe(true);
      }
    }
  });

  it(`stay within ${BUDGET_BYTES / 1000} KB of woff2 across all faces`, () => {
    const total = fontManifest.faces.reduce((sum, f) => sum + statSync(join(fontsDir, f.file)).size, 0);
    expect(total).toBe(fontManifest.totalBytes);
    expect(total).toBeLessThanOrEqual(BUDGET_BYTES);
  });

  it("ship each package's OFL licence", () => {
    for (const key of Object.keys(fontManifest.packages)) {
      const text = readFileSync(join(fontsDir, "licenses", `${key}.txt`), "utf8");
      expect(text, key).toContain("SIL Open Font License");
    }
  });

  it("are all referenced by css/fonts.css and every url exists", () => {
    expect(faces.map((f) => f.file).sort()).toEqual(fontManifest.faces.map((f) => join(fontsDir, f.file)).sort());
    for (const f of faces) expect(existsSync(f.file)).toBe(true);
  });
});

describe("font coverage (through css/fonts.css unicode-range and each file's cmap)", () => {
  const missing = (families: readonly string[], style: string, cps: readonly number[]): string[] =>
    cps.filter((cp) => !stackCovers(families, style, cp)).map(hex);

  it("Hebrew serif stack covers letters, Yiddish digraphs, presentation forms, nikud and cantillation", () => {
    expect(HEBREW_REQUIRED.length).toBeGreaterThan(130);
    expect(missing(["Frank Ruhl Libre", "Emunas Hebrew Marks"], "normal", HEBREW_REQUIRED)).toEqual([]);
  });

  it("Frank Ruhl Libre itself has all letters, digraphs and nikud", () => {
    const core = [...span(0x05d0, 0x05ea), ...span(0x05f0, 0x05f4), ...span(0x05b0, 0x05bd), 0x05bf, 0x05c1, 0x05c2, 0x05c7];
    expect(missing(["Frank Ruhl Libre"], "normal", core)).toEqual([]);
  });

  it("Hebrew sans stack covers the same ranges", () => {
    expect(missing(["Noto Sans Hebrew"], "normal", HEBREW_REQUIRED)).toEqual([]);
  });

  it("Latin faces cover transliteration (ḥ, ’) in every style", () => {
    expect(missing(["Source Serif 4"], "normal", TRANSLIT_REQUIRED)).toEqual([]);
    expect(missing(["Source Serif 4"], "italic", TRANSLIT_REQUIRED)).toEqual([]);
    expect(missing(["Noto Sans"], "normal", TRANSLIT_REQUIRED)).toEqual([]);
  });

  it("Hebrew faces carry digits and punctuation so Yiddish runs do not switch fonts for them", () => {
    const punct = [..."0123456789 .,:;!?()[]-'\"–—…‘’“”"].map((ch) => ch.codePointAt(0) ?? 0);
    expect(missing(["Frank Ruhl Libre"], "normal", punct)).toEqual([]);
    expect(missing(["Noto Sans Hebrew"], "normal", punct)).toEqual([]);
  });
});

describe("preloadFonts", () => {
  it("names one body face per edition and role", () => {
    expect(preloadFonts("serif", "yi")).toEqual(["frank-ruhl-libre-hebrew.woff2"]);
    expect(preloadFonts("serif", "en")).toEqual(["source-serif-4-latin.woff2"]);
    expect(preloadFonts("sans", "yi")).toEqual(["noto-sans-hebrew-hebrew.woff2"]);
    expect(preloadFonts("sans", "en")).toEqual(["noto-sans-latin.woff2"]);
    // Hebrew takes the Hebrew body faces, as Yiddish does.
    expect(preloadFonts("serif", "he")).toEqual(["frank-ruhl-libre-hebrew.woff2"]);
    expect(preloadFonts("sans", "he")).toEqual(["noto-sans-hebrew-hebrew.woff2"]);
  });

  it("every interface language has a script, and every rtl language is set in Hebrew", () => {
    for (const l of UI_LANGS) {
      expect(LANG_SCRIPT[l]).toMatch(/^(latin|hebrew)$/);
      if (UI_DIR[l] === "rtl") expect(LANG_SCRIPT[l]).toBe("hebrew");
      expect(preloadFonts("serif", l)).toHaveLength(1);
    }
    expect(langsOfScript("hebrew")).toEqual(["yi", "he"]);
  });
});
