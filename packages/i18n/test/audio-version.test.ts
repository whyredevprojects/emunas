import { describe, expect, it } from "vitest";
import {
  UI_LANGS,
  AUDIO_VERSION_KEY,
  AUDIO_VERSION_LABELS,
  AUDIO_VERSIONS,
  DEFAULT_AUDIO_VERSION,
  audioVersionLabel,
  parseAudioVersion,
  type AudioVersionLabelKey,
  type UiLang,
} from "../src/index.ts";

const KEYS = Object.keys(AUDIO_VERSION_LABELS.en) as AudioVersionLabelKey[];
const text = (lang: UiLang) => KEYS.map((k) => String(AUDIO_VERSION_LABELS[lang][k]));

describe("audio version vocabulary", () => {
  it("has the design's keys in every language", () => {
    expect([...KEYS].sort()).toEqual(
      [
        "about",
        "announce.cleaned",
        "announce.original",
        "cleaned.action",
        "cleaned.text",
        "original.action",
        "original.text",
        "partOriginal",
      ].sort(),
    );
    for (const lang of UI_LANGS) expect(Object.keys(AUDIO_VERSION_LABELS[lang]).sort()).toEqual([...KEYS].sort());
  });

  it("uses the approved English wording", () => {
    expect(audioVersionLabel("cleaned.text", "en")).toBe("Sound improved by AI");
    expect(audioVersionLabel("cleaned.action", "en")).toBe("Switch to the original");
    expect(audioVersionLabel("original.text", "en")).toBe("A version with the sound improved by AI is also available");
    expect(audioVersionLabel("original.action", "en")).toBe("Listen to it");
    expect(audioVersionLabel("announce.cleaned", "en")).toBe("Now playing the version improved by AI.");
    expect(audioVersionLabel("announce.original", "en")).toBe("Now playing the original recording.");
  });

  it("fills {part}", () => {
    expect(audioVersionLabel("partOriginal", "en", { part: 2 })).toBe("Part 2: original recording only");
    expect(audioVersionLabel("partOriginal", "yi", { part: 2 })).toBe("טייל 2: נאר די מקורית");
    expect(audioVersionLabel("partOriginal", "he", { part: 2 })).toBe("חלק 2: ההקלטה המקורית בלבד");
  });

  it("Yiddish says מקורית for the original, never אריגינאל", () => {
    for (const k of ["cleaned.action", "announce.original", "partOriginal", "about"] as const) {
      expect(audioVersionLabel(k, "yi")).toContain("מקורית");
    }
    expect(text("yi").join(" ")).not.toMatch(/אריגינ/);
  });

  it("Hebrew says הקלטה המקורית for the original, without nikud", () => {
    for (const k of ["cleaned.action", "announce.original", "partOriginal", "about"] as const) {
      expect(audioVersionLabel(k, "he")).toContain("הקלטה המקורית");
    }
    expect(text("he").join(" ")).not.toMatch(/[\u0591-\u05C7]/);
  });

  it("speaks only of the sound or the recording", () => {
    const all = UI_LANGS.flatMap(text).join(" ");
    expect(all).not.toMatch(/transcri|\basr\b|speech recognition|garbled|unclear|sidon|\bcleaned up\b|\bthe rav\b|shlit/i);
  });
});

describe("audio version preference", () => {
  it("one key, two values, original by default", () => {
    expect(AUDIO_VERSION_KEY).toBe("emunas.audioVersion");
    expect(AUDIO_VERSIONS).toEqual(["original", "cleaned"]);
    expect(DEFAULT_AUDIO_VERSION).toBe("original");
    expect(parseAudioVersion("original")).toBe("original");
    expect(parseAudioVersion("cleaned")).toBe("cleaned");
    for (const v of [null, undefined, "", "CLEANED", 1, {}]) expect(parseAudioVersion(v)).toBe("original");
  });
});
