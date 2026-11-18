import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import { LAYER_PERSON_GROUPS, type LayerPersonGroup } from "../../corpus/src/public/corpus-layer.ts";
import {
  CORPUS_LABELS,
  CORPUS_LABEL_STATUS,
  PERSON_GROUP_ORDER,
  TOPIC_GRADES,
  UI_LANGS,
  corpusEntryLabel,
  corpusLabel,
  personGroupLabel,
  scriptOf,
  topicGradeLabel,
  type CorpusLabelKey,
  type Message,
  type PersonGroup,
} from "../src/index.ts";

const KEYS = Object.keys(CORPUS_LABELS.en) as CorpusLabelKey[];

function forms(m: Message): string[] {
  return typeof m === "string" ? [m] : Object.values(m).filter((v): v is string => typeof v === "string");
}

function placeholders(m: Message): string[] {
  return [...new Set(forms(m).flatMap((f) => [...f.matchAll(/\{(\w+)\}/g)].map((x) => x[1] as string)))].sort();
}

describe("corpus vocabulary: every key exists in every language", () => {
  it("has the same keys in every table", () => {
    for (const lang of UI_LANGS) expect(Object.keys(CORPUS_LABELS[lang]).sort(), lang).toEqual([...KEYS].sort());
    expect(KEYS.length).toBeGreaterThan(40);
  });

  it("types: every table is complete over one key union", () => {
    expectTypeOf(CORPUS_LABELS.he).toHaveProperty("thread.heading");
    expectTypeOf<keyof typeof CORPUS_LABELS.yi>().toEqualTypeOf<CorpusLabelKey>();
    expectTypeOf<keyof typeof CORPUS_LABELS.he>().toEqualTypeOf<CorpusLabelKey>();
    expectTypeOf<keyof typeof CORPUS_LABELS.en>().toEqualTypeOf<CorpusLabelKey>();
  });

  const others = UI_LANGS.filter((l) => l !== "en");
  for (const key of KEYS) {
    it(`${key}: non-empty, same shape and placeholders, Yiddish and Hebrew in Hebrew script`, () => {
      const en = CORPUS_LABELS.en[key];
      for (const f of forms(en)) expect(scriptOf(f.replace(/\{\w+\}/g, ""))).toBe("latin");
      for (const lang of others) {
        const m = CORPUS_LABELS[lang][key];
        expect(typeof m, lang).toBe(typeof en);
        // Same plural forms as English; Hebrew may add its dual (`two`).
        if (typeof en !== "string" && typeof m !== "string") {
          expect(Object.keys(m).filter((k) => k !== "two").sort(), lang).toEqual(Object.keys(en).sort());
        }
        for (const f of forms(m)) expect(f.trim()).not.toBe("");
        expect(placeholders(m), lang).toEqual(placeholders(en));
        // "AI" is the one Latin word allowed in the Yiddish and Hebrew wording
        for (const f of forms(m)) expect(scriptOf(f.replace(/\{\w+\}/g, "").replace(/\bAI\b/g, "")), lang).toBe("he");
      }
    });
  }

  it("names the Mashgiach as דער משגיח / המשגיח wherever English says the Mashgiach", () => {
    for (const key of KEYS) {
      const en = forms(CORPUS_LABELS.en[key]).join(" ");
      const yi = forms(CORPUS_LABELS.yi[key]).join(" ");
      const he = forms(CORPUS_LABELS.he[key]).join(" ");
      if (/\bthe Mashgiach\b/.test(en)) {
        expect(yi, key).toContain("דער משגיח");
        expect(he, key).toContain("המשגיח");
      }
      expect(en, key).not.toMatch(/\bthe R[ao]v\b/i);
      expect(yi, key).not.toMatch(/\bRav\b|רב'ס|דעם רב\b/);
      expect(he, key).not.toMatch(/(^|[\s(])הרב(?=[\s,.;:)]|$)|שליט"א/);
    }
  });

  it("writes Hebrew without nikud", () => {
    for (const key of KEYS) for (const f of forms(CORPUS_LABELS.he[key])) expect(f, key).not.toMatch(/[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/u);
  });

  it("is marked as proposed wording", () => {
    expect(CORPUS_LABEL_STATUS).toBe("proposed");
  });
});

describe("corpus labels", () => {
  it("Quiet C6 wording, with the reviewed variant dropping only the not-reviewed clause", () => {
    expect(corpusLabel("label.index", "en", { count: 993 })).toBe(
      "Compiled by AI from the notes on 993 shiurim. Not reviewed by a person; entries may be wrongly joined or split.",
    );
    expect(corpusEntryLabel("quiet", false, "en")).toBe("Notes prepared by AI; not reviewed. The recordings are the source.");
    expect(corpusEntryLabel("quiet", true, "en")).toBe("Notes prepared by AI. The recordings are the source.");
    for (const lang of UI_LANGS) {
      expect(corpusEntryLabel("quiet", true, lang).length).toBeLessThan(corpusEntryLabel("quiet", false, lang).length);
    }
    expect(corpusEntryLabel("quiet", true, "yi")).not.toContain("נישט איבערגעקוקט");
    expect(corpusLabel("label.story", "en", { count: 14 })).toBe(
      "Retold here from 14 tellings; details differ from one to another. Hear it in the shiur.",
    );
    expect(corpusLabel("report.entry", "en")).toBe("Report an error in this entry");
  });

  it("Live E.3 wording and its reviewed variant", () => {
    expect(corpusEntryLabel("live", false, "en")).toBe("Grouped and named by AI across all the shiurim. Not reviewed by a person.");
    expect(corpusEntryLabel("live", true, "en")).toBe("Reviewed");
    expect(corpusEntryLabel("live", true, "yi")).toBe("איבערגעקוקט");
    expect(corpusEntryLabel("live", true, "he")).toBe("נבדק");
    expect(corpusLabel("thread.heading", "he")).toBe("לימוד שהמשגיח חוזר אליו");
    expect(corpusLabel("thread.heading", "en")).toBe("A teaching the Mashgiach returns to");
  });

  it("counts pick plural forms and fill placeholders", () => {
    expect(corpusLabel("count.toldInOther", "en", { count: 1 })).toBe("told in 1 other shiur");
    expect(corpusLabel("count.toldInOther", "en", { count: 13 })).toBe("told in 13 other shiurim");
    expect(corpusLabel("count.toldInOther", "yi", { count: 13 })).toBe("דערציילט אין נאך 13 שיעורים");
    expect(corpusLabel("count.retoldFrom", "en", { count: 2 })).toBe("retold from 2 tellings");
    expect(corpusLabel("count.taughtInOtherYears", "en", { count: 7, from: "תשמ\"ח", to: "תשס\"ט" })).toBe(
      "taught in 7 other shiurim, תשמ\"ח to תשס\"ט",
    );
    expect(corpusLabel("alsoTaughtIn", "en", { shiur: "Tanya (English) no. 19", year: "תשס\"ג" })).toBe(
      "also taught in Tanya (English) no. 19, תשס\"ג",
    );
    expect(corpusLabel("throughout", "yi")).toBe("אומעטום");
    expect(corpusLabel("count.toldInOther", "he", { count: 1 })).toBe("סופר בעוד שיעור אחד");
    expect(corpusLabel("count.toldInOther", "he", { count: 2 })).toBe("סופר בעוד שני שיעורים");
    expect(corpusLabel("count.toldInOther", "he", { count: 13 })).toBe("סופר בעוד 13 שיעורים");
    expect(corpusLabel("label.index", "he", { count: 1997 })).toContain("1,997 שיעורים");
    expect(corpusLabel("notesNotPrepared", "en")).toBe("notes not prepared yet");
  });
});

describe("person groups and topic grades", () => {
  it("mirror the layer's person groups, in sefer order", () => {
    expectTypeOf<PersonGroup>().toEqualTypeOf<LayerPersonGroup>();
    expect(PERSON_GROUP_ORDER).toEqual(LAYER_PERSON_GROUPS);
    expect(PERSON_GROUP_ORDER).toEqual(["tanach", "malach", "chazal", "rishon", "acharon", "chassidic_rebbe", "ruler", "other"]);
    expect(PERSON_GROUP_ORDER.map((g) => personGroupLabel(g, "yi"))).toEqual([
      "תנ\"ך",
      "מלאכים",
      "חז\"ל",
      "ראשונים",
      "אחרונים",
      "צדיקי החסידות",
      "מלכים און הערשער",
      "אנדערע",
    ]);
    expect(PERSON_GROUP_ORDER.map((g) => personGroupLabel(g, "en"))).toEqual([
      "Tanach",
      "Malachim",
      "Chazal",
      "Rishonim",
      "Acharonim",
      "Chassidic Rebbes",
      "Kings and rulers",
      "Others",
    ]);
    expect(PERSON_GROUP_ORDER.map((g) => personGroupLabel(g, "he"))).toEqual([
      "תנ\"ך",
      "מלאכים",
      "חז\"ל",
      "ראשונים",
      "אחרונים",
      "צדיקי החסידות",
      "מלכים ושליטים",
      "אחרים",
    ]);
  });

  it("has a line for stories whose tellings differ on the attribution", () => {
    expect(corpusLabel("story.attributionVaries", "en")).toBe("The tellings differ on whom this happened with.");
    expect(corpusLabel("story.attributionVaries", "yi")).toMatch(/פארשידענע/);
  });

  it("shows a type the data adds later as itself", () => {
    expect(personGroupLabel("angel", "en")).toBe("angel");
    expect(personGroupLabel("toString", "yi")).toBe("toString");
  });

  it("names the three topic grades", () => {
    expect(TOPIC_GRADES.map((g) => topicGradeLabel(g, "en"))).toEqual([
      "The shiur is about this",
      "Discussed in the shiur",
      "Touched on in one part",
    ]);
    for (const g of TOPIC_GRADES) {
      expect(scriptOf(topicGradeLabel(g, "yi"))).toBe("he");
      expect(scriptOf(topicGradeLabel(g, "he"))).toBe("he");
    }
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const tsc = join(dirname(createRequire(import.meta.url).resolve("typescript/package.json")), "bin/tsc");

function compile(fixture: string): { ok: boolean; output: string } {
  try {
    const out = execFileSync(process.execPath, [tsc, "--noEmit", "-p", join(here, "fixtures/tsc", fixture)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output: out };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("corpus tables under tsc", () => {
  it("the shipped tables compile as complete tables", () => {
    const result = compile("corpus-ok");
    expect(result.output).toBe("");
    expect(result.ok).toBe(true);
  });

  it("a Hebrew table missing a key fails tsc", () => {
    const result = compile("corpus-incomplete");
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/error TS2741/);
    expect(result.output).toContain('"thread.heading"');
  });
});
