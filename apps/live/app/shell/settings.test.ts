import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  audioAllows,
  parseSettingsQuery,
  readingLang,
  settingsStore,
  settingsToQuery,
} from "./settings.ts";
import { readStoredUi, storeUi } from "./ui-preference.ts";

describe("language settings", () => {
  beforeEach(() => settingsStore.getState().reset());

  it("defaults to both audio languages and reading in the interface language", () => {
    expect(settingsStore.getState()).toMatchObject(DEFAULT_SETTINGS);
    expect(readingLang(settingsStore.getState(), "yi")).toBe("yi");
    expect(readingLang({ read: "en" }, "yi")).toBe("en");
  });

  it("parses the query string", () => {
    expect(parseSettingsQuery("?audio=yi,en&read=en")).toEqual({ audio: "both", read: "en" });
    expect(parseSettingsQuery("audio=en")).toEqual({ audio: "en" });
    expect(parseSettingsQuery("audio=fr&read=de")).toEqual({});
    // Any interface language can be the reading language; Hebrew is not an audio language.
    expect(parseSettingsQuery("read=he")).toEqual({ read: "he" });
    expect(parseSettingsQuery("audio=he")).toEqual({});
    expect(parseSettingsQuery("")).toEqual({});
  });

  it("writes only non-default values and keeps other params", () => {
    expect(settingsToQuery(DEFAULT_SETTINGS, new URLSearchParams("q=x&audio=yi&read=en")).toString()).toBe("q=x");
    expect(settingsToQuery({ audio: "yi", read: "en" }, new URLSearchParams("t=5")).toString()).toBe(
      "t=5&audio=yi&read=en",
    );
  });

  it("round-trips", () => {
    for (const s of [
      { audio: "both", read: null },
      { audio: "yi", read: "en" },
      { audio: "en", read: "yi" },
      { audio: "yi", read: "he" },
    ] as const) {
      expect({ ...DEFAULT_SETTINGS, ...parseSettingsQuery(settingsToQuery(s)) }).toEqual(s);
    }
  });

  it("filters by audio language", () => {
    expect(audioAllows("both", "yi")).toBe(true);
    expect(audioAllows("en", "yi")).toBe(false);
    expect(audioAllows("yi", "yi")).toBe(true);
  });

  it("store actions update state", () => {
    const s = settingsStore.getState();
    s.setAudio("en");
    s.setRead("yi");
    expect(settingsStore.getState()).toMatchObject({ audio: "en", read: "yi" });
  });

  it("interface preference storage tolerates missing storage (node)", () => {
    expect(() => storeUi("yi")).not.toThrow();
    expect(readStoredUi()).toBeNull();
  });
});
