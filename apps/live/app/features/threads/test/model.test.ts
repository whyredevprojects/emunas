/**
 * The thread page's pure rules (C3.3): year order with the undated group last, the timeline/list
 * switch, and the "Play the thread" queue with the shiur-language filter and its left-out counts.
 */
import { describe, expect, it } from "vitest";
import type { CorpusMember } from "../../../data/index.ts";
import { cleanMembers, orderMembers, threadLayout, threadQueue, TIMELINE_MIN_DATED, type ThreadMember } from "../model.ts";

const m = (id: string, year: number | null, lang: "en" | "yi" = "en", t: number | null = 10): ThreadMember => ({
  shiurId: `${lang}-${id}`,
  momentId: `${lang}-${id}~i0`,
  t,
  year,
  lang,
  title: id,
  chapterTitle: null,
  text: { en: `insight ${id}`, yi: `insight ${id}` },
});

const ids = (xs: readonly Pick<CorpusMember, "momentId">[]) => xs.map((x) => x.momentId.replace(/~i0$/u, ""));

describe("orderMembers", () => {
  it("orders by Hebrew year, earliest first, with the undated last and ties in input order", () => {
    const out = orderMembers([m("c", 5771), m("u1", null), m("a", 5741), m("b1", 5752), m("u2", null, "yi"), m("b2", 5752, "yi")]);
    expect(ids(out)).toEqual(["en-a", "en-b1", "yi-b2", "en-c", "en-u1", "yi-u2"]);
  });

  it("does not change its input", () => {
    const input = [m("b", 5760), m("a", 5740)];
    orderMembers(input);
    expect(ids(input)).toEqual(["en-b", "en-a"]);
  });
});

describe("threadLayout", () => {
  const three = [m("c", 5769), m("a", 5741), m("u", null), m("b", 5752)];

  it("is a timeline when the build marks it and groups members by year, the undated apart", () => {
    const l = threadLayout({ timeline: true }, [...three, m("b2", 5752, "yi")]);
    expect(l.timeline).toBe(true);
    expect(l.years.map((g) => g.year)).toEqual([5741, 5752, 5769]);
    expect(ids(l.years[1]!.members)).toEqual(["en-b", "yi-b2"]);
    expect(ids(l.undated)).toEqual(["en-u"]);
    expect(l.shiurCount).toBe(5);
  });

  it("is a plain list when the build says no", () => {
    const l = threadLayout({ timeline: false }, three);
    expect(l.timeline).toBe(false);
    expect(ids(l.undated)).toEqual(["en-u"]);
  });

  it("without a flag (shape change) falls back to three dated members", () => {
    expect(TIMELINE_MIN_DATED).toBe(3);
    expect(threadLayout({}, three).timeline).toBe(true);
    expect(threadLayout({}, [m("a", 5741), m("b", 5752), m("u", null), m("v", null)]).timeline).toBe(false);
  });

  it("never draws a line with fewer than two dated rows, whatever the flag", () => {
    expect(threadLayout({ timeline: true }, [m("a", 5741), m("u", null), m("v", null)]).timeline).toBe(false);
  });

  it("counts distinct shiurim, not moments", () => {
    const twice = { ...m("a", 5741), momentId: "en-a~i9" };
    expect(threadLayout({ timeline: true }, [m("a", 5741), twice, m("b", 5752)]).shiurCount).toBe(2);
  });
});

describe("threadQueue", () => {
  const members = [m("y2", 5769, "yi"), m("e1", 5741), m("y1", 5745, "yi"), m("eu", null), m("y3", null, "yi"), m("e2", 5760)];

  it("with both languages queues every member in year order, undated last", () => {
    const q = threadQueue(members, "both");
    expect(ids(q.items)).toEqual(["en-e1", "yi-y1", "en-e2", "yi-y2", "en-eu", "yi-y3"]);
    expect(q.leftOut).toEqual([]);
    expect(q.items[0]).toEqual({ shiurId: "en-e1", momentId: "en-e1~i0", start: 10, lang: "en" });
  });

  it("honours the shiur-language filter and counts what was left out per language", () => {
    const en = threadQueue(members, "en");
    expect(ids(en.items)).toEqual(["en-e1", "en-e2", "en-eu"]);
    expect(en.leftOut).toEqual([{ lang: "yi", count: 3 }]);
    const yi = threadQueue(members, "yi");
    expect(ids(yi.items)).toEqual(["yi-y1", "yi-y2", "yi-y3"]);
    expect(yi.leftOut).toEqual([{ lang: "en", count: 3 }]);
  });

  it("leaves out members with no time and counts them apart", () => {
    const q = threadQueue([m("a", 5741), m("b", 5745, "en", null), m("c", 5750, "yi", null)], "en");
    expect(ids(q.items)).toEqual(["en-a"]);
    expect(q.untimed).toBe(1);
    expect(q.leftOut).toEqual([{ lang: "yi", count: 1 }]);
  });

  it("is empty when the filter lets nothing through", () => {
    const q = threadQueue([m("a", 5741, "yi"), m("b", 5745, "yi")], "en");
    expect(q.items).toEqual([]);
    expect(q.leftOut).toEqual([{ lang: "yi", count: 2 }]);
  });
});

describe("cleanMembers", () => {
  it("reads members defensively: bad rows dropped, duplicates once, odd fields defaulted", () => {
    const out = cleanMembers([
      m("a", 5741),
      m("a", 5741),
      { shiurId: "x" },
      null,
      { shiurId: "en-b", momentId: "en-b~i1", t: Number.NaN, year: "5750", lang: "fr", extra: 1 },
    ]);
    expect(out.map((x) => x.momentId)).toEqual(["en-a~i0", "en-b~i1"]);
    expect(out[1]).toEqual({ shiurId: "en-b", momentId: "en-b~i1", t: null, year: null, lang: "en", title: "", chapterTitle: null, text: null });
    expect(cleanMembers(undefined)).toEqual([]);
  });
});
