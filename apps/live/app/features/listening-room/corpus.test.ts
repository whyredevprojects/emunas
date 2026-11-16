/**
 * The listening room's corpus-layer helpers (concept-live-corpus D, C.1, E.2, F.1) on the committed
 * fixtures, with small changes where a fixture has no example (a thread with a page).
 */
import { describe, expect, it } from "vitest";
import {
  chapterTopics,
  endOfShiur,
  groupSourcesByWork,
  insightMark,
  mainTopics,
  storyMark,
  threadsThrough,
} from "./corpus.ts";
import { roomEn, roomYi } from "./strings.ts";
import { brshys03, clone, misc01, misc01WithThread, tanya, tvbb } from "./test-fixtures.ts";

describe("header: main topics", () => {
  it("takes the top three topics with salience 0.5 and above, highest first", () => {
    expect(mainTopics(tvbb).map((t) => t.id)).toEqual(["tu-bav-nechamah", "yiras-shamayim", "tachlis-hagalus"]);
    for (const t of mainTopics(tvbb)) expect(t.label.en.length).toBeGreaterThan(0);
  });

  it("never shows a topic below 0.5, even when fewer than three remain", () => {
    const s = clone(tvbb);
    s.corpus!.topics = [
      { id: "teshuvah", salience: 0.49 },
      { id: "yiras-shamayim", salience: 0.5 },
    ];
    expect(mainTopics(s).map((t) => t.id)).toEqual(["yiras-shamayim"]);
  });

  it("skips a topic the file carries no label for, and reads a file without the corpus block", () => {
    const s = clone(tvbb);
    delete s.corpus!.topicLabels["tu-bav-nechamah"];
    expect(mainTopics(s).map((t) => t.id)).toEqual(["yiras-shamayim", "tachlis-hagalus", "teshuvah"]);
    expect(mainTopics(tanya)).toEqual([]);
    const loose = clone(tvbb);
    (loose as { corpus: unknown }).corpus = {};
    expect(mainTopics(loose)).toEqual([]);
    expect(chapterTopics(loose, 0)).toEqual([]);
    expect(insightMark(loose, "x~i0")).toBeNull();
    expect(storyMark(loose, "x~st0")).toBeNull();
    expect(threadsThrough(loose)).toEqual([]);
  });
});

describe("chapter topic chips", () => {
  it("lists a chapter's topics with labels; a chapter with none has no chips", () => {
    expect(chapterTopics(tvbb, 0).map((t) => t.id)).toEqual(["yiras-shamayim", "sefer-devarim", "teshuvah"]);
    expect(chapterTopics(tvbb, 2)).toEqual([]);
    expect(chapterTopics(tvbb, 99)).toEqual([]);
  });

  it("drops a topic without a page", () => {
    const s = clone(tvbb);
    s.corpus!.topicLabels["sefer-devarim"]!.page = false;
    expect(chapterTopics(s, 0).map((t) => t.id)).toEqual(["yiras-shamayim", "teshuvah"]);
  });
});

describe("insight thread marks", () => {
  it("a thread with a page: other shiurim and the year span", () => {
    const s = misc01WithThread();
    expect(insightMark(s, s.corpus!.insights[0]!.momentId)).toEqual({
      kind: "thread",
      threadId: "torah-chacham-name-is-torah",
      others: 7,
      years: [5735, 5769],
    });
  });

  it("a two-shiur thread is the inline pair, never a thread page", () => {
    const x = misc01.corpus!.insights[0]!;
    const mark = insightMark(misc01, x.momentId);
    expect(mark?.kind).toBe("pair");
    if (mark?.kind !== "pair") return;
    expect(mark.other).toEqual({ shiurId: "en-miscellaneous-en-02", momentId: "en-miscellaneous-en-02~i1", t: 555.04, year: 5735, lang: "en" });
  });

  it("a page flag on a thread below three shiurim is not trusted as a page", () => {
    const s = clone(misc01);
    s.corpus!.insights[0]!.page = true;
    expect(insightMark(s, s.corpus!.insights[0]!.momentId)?.kind).toBe("pair");
  });

  it("nothing to show: not in a thread, or a two-shiur thread whose other member is not visible", () => {
    expect(insightMark(misc01, "en-miscellaneous-en-01~i99")).toBeNull();
    const s = clone(misc01);
    delete s.corpus!.insights[0]!.other;
    expect(insightMark(s, s.corpus!.insights[0]!.momentId)).toBeNull();
  });

  it("threads through this shiur: page threads only, once each", () => {
    expect(threadsThrough(misc01)).toEqual([]);
    const s = misc01WithThread();
    s.corpus!.insights.push({ ...s.corpus!.insights[0]! });
    const got = threadsThrough(s);
    expect(got.map((t) => t.threadId)).toEqual(["torah-chacham-name-is-torah"]);
    expect(got[0]!.text).toEqual(s.notes!.insights.find((i) => i.id === got[0]!.momentId)!.text);
    expect(got[0]!.others).toBe(7);
  });
});

describe("story counts", () => {
  it("a merged story told elsewhere: other tellings and its page", () => {
    expect(storyMark(brshys03, "yi-parshas-hashavua-brshys-03~st0")).toEqual({
      storyId: "chizkiyahu-sleeps-during-sanherivs-siege",
      others: 1,
      page: true,
    });
  });

  it("a story told once has no line", () => {
    expect(storyMark(brshys03, "yi-parshas-hashavua-brshys-03~st1")).toBeNull();
    expect(storyMark(brshys03, "yi-parshas-hashavua-brshys-03~st9")).toBeNull();
  });
});

describe("sources grouped by merged work", () => {
  it("puts sources the layer merged into one group under the corpus work id", () => {
    // "Gemara Yoma" (work key bavli-yoma) is the corpus work `yoma`; add a "Yoma" spelling of it.
    const s = clone(misc01);
    const yoma = s.notes!.sources.find((x) => x.workKey === "bavli-yoma")!;
    const other = { ...yoma, id: "en-miscellaneous-en-01~src99", idx: 99, work: "Yoma", workKey: "yoma", t: (yoma.t ?? 0) + 1 };
    s.notes!.sources.push(other);
    s.corpus!.sources.push({ momentId: other.id, workId: "yoma", page: true });
    const groups = groupSourcesByWork(s);
    const g = groups.filter((x) => x.workId === "yoma");
    expect(g).toHaveLength(1);
    expect(g[0]!.sources.map((x) => x.id)).toEqual([yoma.id, other.id]);
    expect(g[0]!.page).toBe(true);
    expect(groups.reduce((n, x) => n + x.sources.length, 0)).toBe(s.notes!.sources.length);
    const keys = groups.map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("names a group by the spelling its sources use most", () => {
    const s = clone(misc01);
    const avos = s.notes!.sources.filter((x) => x.workKey === "pirkei-avos");
    expect(avos.length).toBeGreaterThan(1);
    const extra = { ...avos[0]!, id: "en-miscellaneous-en-01~src98", idx: 98, work: "Avos", workKey: "avos" };
    s.notes!.sources.unshift(extra);
    s.corpus!.sources.push({ momentId: extra.id, workId: "pirkei-avos", page: true });
    expect(groupSourcesByWork(s).find((x) => x.workId === "pirkei-avos")!.work).toBe("Pirkei Avos");
  });

  it("a source the layer did not resolve keeps its own work key", () => {
    const s = clone(misc01);
    const first = s.notes!.sources[0]!;
    s.corpus!.sources = s.corpus!.sources.filter((x) => x.momentId !== first.id);
    const g = groupSourcesByWork(s).find((x) => x.sources.some((y) => y.id === first.id))!;
    expect(g.workId).toBeNull();
    expect(g.key).toBe(first.workKey);
  });
});

describe("end of shiur", () => {
  it("the next part when the shiur is in a series", () => {
    expect(endOfShiur(tanya)).toEqual({ kind: "next", shiurId: "yi-tanya-1-10" });
  });

  it("otherwise a thread from this shiur", () => {
    const got = endOfShiur(misc01WithThread());
    expect(got?.kind).toBe("thread");
  });

  it("otherwise more on the top topic, even when a next shiur exists outside a series", () => {
    expect(misc01.related.next).not.toBeNull();
    expect(endOfShiur(misc01)).toEqual({ kind: "topic", topic: mainTopics(misc01)[0] });
  });

  it("nothing when there is neither", () => {
    const s = clone(tanya);
    s.series = null;
    expect(endOfShiur(s)).toBeNull();
  });
});

describe("strings", () => {
  it("never pair a shiur with one in the other language", () => {
    for (const table of [roomEn, roomYi]) {
      const text = JSON.stringify(table);
      expect(text).not.toMatch(/counterpart|other language|translation/iu);
    }
  });
});
