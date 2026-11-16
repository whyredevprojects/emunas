import { describe, expect, it } from "vitest";
import { tanya, tvbb, tvbbWriteupEn } from "./test-fixtures.ts";
import { TRANSCRIPT_VIEW } from "./flags.ts";
import {
  activeParagraphId,
  chapterAt,
  hasPlayableAudio,
  momentSpan,
  parseTimeParam,
  resolveDeepLink,
  sefariaUrl,
  topicTargets,
} from "./model.ts";
import { printableUrl, quietOrigin } from "./quiet-link.ts";
import { roomEn, roomYi } from "./strings.ts";

const full = tvbb;
const catalogOnly = tanya;
const writeupEn = tvbbWriteupEn;
const notes = full.notes!;

describe("deep links", () => {
  it("parses ?t= values", () => {
    expect(parseTimeParam("754")).toBe(754);
    expect(parseTimeParam("754.5")).toBe(754.5);
    expect(parseTimeParam("12m34s")).toBe(754);
    expect(parseTimeParam("1h")).toBe(3600);
    expect(parseTimeParam("")).toBeNull();
    expect(parseTimeParam("-3")).toBeNull();
    expect(parseTimeParam("abc")).toBeNull();
    expect(parseTimeParam(null)).toBeNull();
  });

  it("starts at t", () => {
    expect(resolveDeepLink(full, "?t=754")).toEqual({ start: 754, momentId: null });
  });

  it("a known timed moment wins over t", () => {
    const story = notes.stories[0]!;
    expect(resolveDeepLink(full, `?t=10&m=${encodeURIComponent(story.id)}`)).toEqual({ start: story.t, momentId: story.id });
    const ch = notes.chapters[3]!;
    expect(resolveDeepLink(full, `?m=${ch.id}`)).toEqual({ start: ch.t, momentId: ch.id });
  });

  it("falls back to t for an unknown moment or one of another shiur", () => {
    expect(resolveDeepLink(full, "?t=754&m=yi-zmanim-tv-bb-04~i999")).toEqual({ start: 754, momentId: null });
    expect(resolveDeepLink(full, "?t=754&m=other~s1")).toEqual({ start: 754, momentId: null });
    expect(resolveDeepLink(full, "?t=754&m=garbage")).toEqual({ start: 754, momentId: null });
  });

  it("ignores t outside the shiur", () => {
    expect(resolveDeepLink(full, "?t=999999").start).toBeNull();
    expect(resolveDeepLink(full, "").start).toBeNull();
  });

  it("works for catalog-only shiurim (t only)", () => {
    expect(resolveDeepLink(catalogOnly, "?t=120&m=yi-tanya-1-01~s0")).toEqual({ start: 120, momentId: null });
  });

  it("finds every moment kind", () => {
    const q = notes.questions[0]!;
    expect(momentSpan(full, q.id)).toEqual({ t: q.tq, end: null });
    const i = notes.insights[0]!;
    expect(momentSpan(full, i.id)).toEqual({ t: i.t, end: i.end });
    const kp = notes.summary.keyPoints[0]!;
    expect(momentSpan(full, kp.id)).toEqual({ t: kp.t, end: kp.end });
    if (notes.takeaways[0]) expect(momentSpan(full, notes.takeaways[0].id)?.t).toBe(notes.takeaways[0].t);
  });
});

describe("catalog topics", () => {
  it("maps each topic to the first chapter that names it", () => {
    expect(topicTargets(1, notes)).toEqual([0]);
    const synthetic = {
      chapters: [
        { t: 0, catalogTopicIdx: [] },
        { t: 50, catalogTopicIdx: [1] },
        { t: 90, catalogTopicIdx: [0, 1] },
      ],
    } as unknown as Pick<NonNullable<typeof full.notes>, "chapters">;
    expect(topicTargets(3, synthetic)).toEqual([90, 50, null]);
  });

  it("is untimed without notes", () => {
    expect(topicTargets(3, catalogOnly.notes)).toEqual([null, null, null]);
  });
});

describe("time helpers", () => {
  it("finds the active paragraph from its evidence span", () => {
    const p = writeupEn.blocks[0]!.paragraphs[0]!;
    expect(activeParagraphId(writeupEn.blocks, p.t! + 1)).toBe(p.id);
    expect(activeParagraphId(writeupEn.blocks, -5)).toBeNull();
  });

  it("finds the chapter at t", () => {
    expect(chapterAt(notes.chapters, 0)).toBe(0);
    expect(chapterAt(notes.chapters, notes.chapters[3]!.t + 1)).toBe(3);
    expect(chapterAt(notes.chapters, full.duration)).toBe(notes.chapters.length - 1);
  });
});

describe("sources", () => {
  it("links only resolved sources to Sefaria", () => {
    expect(sefariaUrl({ resolution: "resolved", sefariaRef: "Deuteronomy 10:12" })).toBe("https://www.sefaria.org/Deuteronomy.10.12");
    expect(sefariaUrl({ resolution: "resolved", sefariaRef: "Song of Songs 1:6" })).toBe("https://www.sefaria.org/Song_of_Songs.1.6");
    expect(sefariaUrl({ resolution: "resolved", sefariaRef: "Sotah 2a" })).toBe("https://www.sefaria.org/Sotah.2a");
    expect(sefariaUrl({ resolution: "resolved", sefariaRef: "Mishnah Taanit 4:8" })).toBe("https://www.sefaria.org/Mishnah_Taanit.4.8");
    expect(sefariaUrl({ resolution: "inferred", sefariaRef: "Genesis 7:1" })).toBeNull();
    expect(sefariaUrl({ resolution: "resolved", sefariaRef: null })).toBeNull();
  });
});

describe("printable page link (Quiet)", () => {
  it("uses the configured origin", () => {
    expect(quietOrigin({ VITE_EMUNAS_QUIET_ORIGIN: "https://example.org/" }, null)).toBe("https://example.org");
    expect(quietOrigin({ VITE_EMUNAS_DOMAIN: "example.org" }, null)).toBe("https://example.org");
  });

  it("derives Quiet from the Live host", () => {
    expect(quietOrigin({}, { protocol: "https:", host: "listen.example.org" })).toBe("https://example.org");
    expect(quietOrigin({}, { protocol: "https:", host: "emunas-live.acct.workers.dev" })).toBe(
      "https://emunas-quiet.acct.workers.dev",
    );
    expect(quietOrigin({}, { protocol: "https:", host: "emunas-live-staging.acct.workers.dev" })).toBe(
      "https://emunas-quiet-staging.acct.workers.dev",
    );
    expect(quietOrigin({}, { protocol: "http:", host: "localhost:5173" })).toBeNull();
  });

  it("builds the Quiet shiur URL via @emunas/links", () => {
    expect(printableUrl("https://example.org", "yi", "yi-tanya-1-01")).toBe("https://example.org/yi/shiur/yi-tanya-1-01/");
    expect(printableUrl("https://example.org", "en", "x", 754)).toBe("https://example.org/en/shiur/x/#t=754");
    expect(printableUrl(null, "en", "x")).toBeNull();
  });
});

describe("misc", () => {
  it("knows when a shiur has playable audio", () => {
    expect(hasPlayableAudio(full)).toBe(true);
    expect(hasPlayableAudio({ recordings: [{ ...full.recordings[0]!, audioUrl: null, playable: false }] })).toBe(false);
  });

  it("keeps the transcript view off", () => {
    expect(TRANSCRIPT_VIEW).toBe(false);
  });

  it("has the same string keys in both languages", () => {
    expect(Object.keys(roomYi).sort()).toEqual(Object.keys(roomEn).sort());
    for (const v of Object.values(roomYi)) expect(typeof v === "string" ? v.length : 1).toBeGreaterThan(0);
  });
});
