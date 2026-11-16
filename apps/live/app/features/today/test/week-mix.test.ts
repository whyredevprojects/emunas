/**
 * Which occasion's mix the "This week" button plays (C3.4): the most specific occasion of the week
 * with a mix, in the moment-of-the-day priority; one whose head has a section in the listener's
 * language wins over one that would need the topic file first.
 */
import { describe, expect, it } from "vitest";
import { buildToday, weekMix } from "../model.ts";
import type { TodayFile } from "../live-data.ts";
import { todayFixture } from "./fixtures.ts";

const today = todayFixture as unknown as TodayFile;
const clone = (): TodayFile => structuredClone(today);

describe("weekMix", () => {
  it("Noach week: the parsha's mix, its head in order, its catalog and no skip", () => {
    const v = buildToday({ date: "2026-10-14", israel: false, audio: "both", today });
    expect(v.mix).not.toBeNull();
    const m = v.mix!;
    expect([m.key, m.topicId, m.label.en]).toEqual(["noach", "noach-mabul", "Noach and the Mabul"]);
    expect(m.head.map((x) => x.id)).toEqual(today.occasions["noach"]!.mix!.first.map((x) => x.id));
    expect(m.head.map((x) => x.lang)).toEqual(["en", "yi"]);
    expect(m.catalog).toEqual(["en-parsha-en-nch-01"]);
    expect(m.skip).toEqual([]);
    expect([m.sections, m.shiurim]).toEqual([10, 3]);
  });

  it("an active occasion comes before the parsha", () => {
    const m = weekMix([["chanukah"], ["vayeishev"]], today, "both")!;
    expect(m.key).toBe("chanukah");
  });

  it("a combined parsha uses the first part with a mix and both parts' catalog shiurim", () => {
    const t = clone();
    t.occasions["noach"]!.mix = null;
    const m = weekMix([["bereishis-noach", "bereishis", "noach"]], t, "both")!;
    expect(m.key).toBe("bereishis");
    expect(m.keys).toEqual(["bereishis-noach", "bereishis", "noach"]);
    expect(m.catalog).toContain("en-parsha-en-nch-01");
    expect(m.catalog).toContain("yi-parshas-hashavua-brshys-01");
  });

  it("prefers an occasion whose head plays in the listener's language; else the first with a mix", () => {
    const t = clone();
    // Purim's head is Yiddish only; Pesach's leads in English.
    expect(weekMix([["purim"], ["pesach"]], t, "en")!.key).toBe("pesach");
    expect(weekMix([["purim"]], t, "en")!.head).toEqual([]);
    expect(weekMix([["purim"]], t, "en")!.key).toBe("purim");
  });

  it("drops skipped head items; no mix anywhere is null", () => {
    const t = clone();
    t.occasions["noach"]!.mix!.skip = ["en-parsha-en-nch-01"];
    expect(weekMix([["noach"]], t, "both")!.head.map((x) => x.shiurId)).toEqual(["yi-parshas-hashavua-brshys-03"]);
    expect(weekMix([["other"], ["no-such-key"]], t, "both")).toBeNull();
  });

  it("is deterministic", () => {
    const a = buildToday({ date: "2026-12-08", israel: false, audio: "both", today });
    const b = buildToday({ date: "2026-12-08", israel: false, audio: "both", today });
    expect(b.mix).toEqual(a.mix);
  });
});
