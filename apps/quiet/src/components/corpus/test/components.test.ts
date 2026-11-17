/**
 * C1.8: the shared corpus-entry components and their models: the AI label variants, the report
 * mail link, the three-grade shiur list, the entry head, and the title page's indexes block.
 */
import { corpusLabel } from "@emunas/i18n";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it } from "vitest";
import { catalogEn, catalogYi } from "../../catalog/strings.ts";
import type { Cite } from "../../indexes/model.ts";
import EntityLabel from "../EntityLabel.astro";
import EntryHead from "../EntryHead.astro";
import GradeList from "../GradeList.astro";
import IndexesBlock from "../IndexesBlock.astro";
import ReportEntry from "../ReportEntry.astro";
import {
  INDEX_LINE_ORDER,
  gradeListModel,
  headword,
  indexesBlock,
  reportEntryHref,
  reportEntryMail,
  type CiteFn,
} from "../model.ts";
import { corpusEn, corpusYi } from "../strings.ts";
import { navSectionOf } from "../../../lib/nav.ts";

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

const render = (component: Parameters<AstroContainer["renderToString"]>[0], props: Record<string, unknown>, slots?: Record<string, string>) =>
  container.renderToString(component, { props, ...(slots ? { slots } : {}) });

const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

describe("strings", () => {
  it("has every key in both editions, with the same placeholders", () => {
    expect(Object.keys(corpusYi).sort()).toEqual(Object.keys(corpusEn).sort());
    const ph = (m: unknown) =>
      [...new Set((typeof m === "string" ? [m] : Object.values(m as Record<string, string>)).flatMap((f) => [...f.matchAll(/\{(\w+)\}/g)].map((x) => x[1])))].sort();
    for (const k of Object.keys(corpusEn) as (keyof typeof corpusEn)[]) expect(ph(corpusYi[k]), k).toEqual(ph(corpusEn[k]));
  });

  it("has no wording that pairs a series with one in the other language", () => {
    expect(catalogEn).not.toHaveProperty("series.sibling");
    expect(catalogYi).not.toHaveProperty("series.sibling");
  });
});

describe("EntityLabel", () => {
  it("index: the compiled-by-AI line with the count, once", async () => {
    const html = await render(EntityLabel, { ed: "en", variant: "index", count: 993 });
    expect(text(html)).toBe(
      "Compiled by AI from the notes on 993 shiurim. Not reviewed by a person; entries may be wrongly joined or split.",
    );
    expect(html.match(/role="note"/g)).toHaveLength(1);
  });

  it("entry: not reviewed by default; reviewed drops only that clause, with no verified mark", async () => {
    const plain = text(await render(EntityLabel, { ed: "en", variant: "entry" }));
    const reviewed = await render(EntityLabel, { ed: "en", variant: "entry", reviewed: true });
    expect(plain).toBe("Notes prepared by AI; not reviewed. The recordings are the source.");
    expect(text(reviewed)).toBe("Notes prepared by AI. The recordings are the source.");
    expect(reviewed).toContain('data-reviewed="true"');
    expect(text(reviewed)).not.toMatch(/verified|not reviewed/i);
    const yi = text(await render(EntityLabel, { ed: "yi", variant: "entry" }));
    expect(yi).toBe(corpusLabel("label.entry", "yi"));
    expect(text(await render(EntityLabel, { ed: "yi", variant: "entry", reviewed: true }))).toBe(corpusLabel("label.entry.reviewed", "yi"));
  });

  it("entry: the report link sits beside the label (slot)", async () => {
    const html = await render(EntityLabel, { ed: "en", variant: "entry" }, { default: '<p class="report-entry"><a href="mailto:x@y.org">Report</a></p>' });
    expect(html).toMatch(/<footer class="corpus-label-entry"[^>]*>.*Notes prepared by AI.*report-entry.*<\/footer>/s);
  });

  it("story: retold from N tellings", async () => {
    expect(text(await render(EntityLabel, { ed: "en", variant: "story", count: 3 }))).toMatch(/^Retold here from 3 tellings/);
    expect(text(await render(EntityLabel, { ed: "en", variant: "story", count: 1 }))).toMatch(/^Retold here from 1 telling\./);
  });
});

describe("ReportEntry", () => {
  const url = "https://quiet.example.org/en/people/the-sanzer-rav/";

  it("is a mailto link pre-filled with the kind, the id and the three options", async () => {
    const html = await render(ReportEntry, { ed: "en", kind: "person", id: "divrei-chaim", address: "errors@example.org", pageUrl: url });
    const href = decode(/href="([^"]+)"/.exec(html)![1]!);
    expect(href.startsWith("mailto:errors@example.org?subject=")).toBe(true);
    const q = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(q.get("subject")).toBe("Error in person divrei-chaim");
    const body = q.get("body")!;
    expect(body).toContain("person divrei-chaim");
    expect(body).toContain(url);
    expect(body).toContain("These are two different people or stories");
    expect(body).toContain("This is the same as another entry");
    expect(body).toContain("This shiur does not belong here");
    expect(text(html)).toBe("Report an error in this entry");
    expect(html).toContain('data-report-kind="person"');
    expect(html).toContain('data-report-id="divrei-chaim"');
  });

  it("speaks the edition's language and names the kind", () => {
    const { subject, body } = reportEntryMail("yi", "story", "the-divrei-chaim-and-the-man-who-shamed", url);
    expect(subject).toBe(corpusLabel("report.subject", "yi", { kind: corpusLabel("kind.story", "yi"), id: "the-divrei-chaim-and-the-man-who-shamed" }));
    expect(body).toContain(corpusLabel("report.twoDifferent", "yi"));
    expect(body).toContain(corpusLabel("report.doesNotBelong", "yi"));
  });

  it("renders nothing without a valid address", async () => {
    expect(reportEntryHref(undefined, "en", "topic", "emunah", url)).toBeNull();
    expect(reportEntryHref("not an address", "en", "topic", "emunah", url)).toBeNull();
    expect((await render(ReportEntry, { ed: "en", kind: "topic", id: "emunah", address: null, pageUrl: url })).trim()).toBe("");
  });
});

const cite = (shiurId: string): Cite => ({
  shiurId,
  href: `/en/shiur/${shiurId}/`,
  title: { text: `Title of ${shiurId}`, lang: "en", dir: "ltr" },
  occasion: { text: `Occasion of ${shiurId}`, lang: "en", dir: "ltr" },
  years: [5770],
  lang: "en",
  t: null,
});
const citeFn: CiteFn = (id) => (id.startsWith("gone") ? null : cite(id));

describe("GradeList", () => {
  const grades = {
    main: [{ shiurId: "a", salience: 0.9 }, { shiurId: "gone-1", salience: 0.8 }],
    discussed: [{ shiurId: "b", salience: 0.4 }, { shiurId: "b", salience: 0.3 }],
    touched: [{ shiurId: "c", chapters: [{ idx: 2, t: 754 }, { idx: 5, t: 3723 }] }],
  };

  it("models three grades, dropping shiurim that cannot be cited and repeats", () => {
    const m = gradeListModel("en", grades, citeFn);
    expect(m.main.map((c) => c.shiurId)).toEqual(["a"]);
    expect(m.discussed.map((c) => c.shiurId)).toEqual(["b"]);
    expect(m.touched).toHaveLength(1);
    expect(m.touched[0]!.parts).toEqual([
      { idx: 2, t: 754, href: "/en/shiur/c/#s2", time: "12:34" },
      { idx: 5, t: 3723, href: "/en/shiur/c/#s5", time: "1:02:03" },
    ]);
  });

  it("reads odd input defensively", () => {
    expect(gradeListModel("en", null, citeFn)).toEqual({ main: [], discussed: [], touched: [] });
    const odd = gradeListModel("en", { touched: [{ shiurId: "c", chapters: [{ idx: 1.5, t: 3 }, { idx: 1, t: Number.NaN }] }] } as never, citeFn);
    expect(odd.touched[0]!.parts).toEqual([]);
  });

  it("renders principal, plain and one-line section rows under the grade names", async () => {
    const html = await render(GradeList, { ed: "en", model: gradeListModel("en", grades, citeFn) });
    const order = [...html.matchAll(/data-grade="(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["main", "discussed", "touched"]);
    expect(html).toContain("The shiur is about this");
    expect(html).toContain("Discussed in the shiur");
    expect(html).toContain("Touched on in one part");
    expect(html).toMatch(/<li class="grade-row principal" data-shiur="a"><strong><a class="cite" href="\/en\/shiur\/a\/">/);
    expect(html).toMatch(/<li class="grade-row" data-shiur="b"><a class="cite"/);
    expect(html).toMatch(/<li class="grade-row touched" data-shiur="c">.*href="\/en\/shiur\/c\/#s2".*12:34.*href="\/en\/shiur\/c\/#s5".*1:02:03/s);
    expect(html).not.toContain("gone-1");
  });

  it("leaves an empty grade out and can nest under h3", async () => {
    const html = await render(GradeList, { ed: "yi", model: gradeListModel("yi", { main: [], discussed: [{ shiurId: "b", salience: 0.2 }], touched: [] }, citeFn), level: 3, idPrefix: "t1" });
    expect([...html.matchAll(/data-grade="(\w+)"/g)].map((m) => m[1])).toEqual(["discussed"]);
    expect(html).toContain('<h3 id="t1-discussed">');
    expect(html).toContain(corpusLabel("grade.discussed", "yi"));
  });
});

describe("EntryHead", () => {
  it("puts the Hebrew beside the English and prints the see-also line", async () => {
    const hw = headword("en", { en: "Hester Panim", he: "הסתר פנים" });
    expect(hw.title.text).toBe("Hester Panim");
    expect(hw.alt).toMatchObject({ text: "הסתר פנים", dir: "rtl" });
    const html = await render(EntryHead, {
      ed: "en",
      ...hw,
      meta: "12 shiurim",
      seeAlso: [{ label: { text: "Hester panim (concept)", lang: "en", dir: "ltr" }, href: "/en/erachim/hester-panim/" }],
    });
    expect(html).toMatch(/<h1><bdi lang="en" dir="ltr">Hester Panim<\/bdi> <span class="alt-name"><bdi lang="he" dir="rtl">הסתר פנים<\/bdi>/);
    expect(text(html)).toContain("See also: Hester panim (concept)");
    expect(html).toContain('href="/en/erachim/hester-panim/"');
    expect(html).toContain('class="entry-meta"');
  });

  it("uses the Yiddish name in the Yiddish edition and omits a repeated Hebrew", async () => {
    const hw = headword("yi", { en: "Emunah", yi: "אמונה", he: "אמונה" });
    expect(hw.title.text).toBe("אמונה");
    expect(hw.alt).toBeNull();
    expect(headword("yi", { en: "the Abudraham", yi: "דער אבודרהם", he: "אבודרהם" }).alt?.text).toBe("אבודרהם");
    expect(headword("en", { he: "אבודרהם" }).title.text).toBe("אבודרהם");
    const html = await render(EntryHead, { ed: "yi", ...hw, seeAlso: [] });
    expect(html).not.toContain("see-also");
    expect(html).not.toContain("alt-name");
  });
});

describe("indexes block (title page)", () => {
  it("lists the indexes in the order of Quiet C5, without counts", () => {
    expect(INDEX_LINE_ORDER).toEqual(["topics", "glossary", "names", "sources", "stories", "calendar", "years"]);
    const lines = indexesBlock("yi");
    expect(lines.map((l) => l.label)).toEqual(["ענינים", "ערכים", "שמות", "מראי מקומות", "מעשיות", "לוח", "שנים"]);
    expect(lines.map((l) => l.href)).toEqual([
      "/yi/inyanim/",
      "/yi/erachim/",
      "/yi/people/",
      "/yi/sources/",
      "/yi/stories/",
      "/yi/calendar/",
      "/yi/years/",
    ]);
    const en = indexesBlock("en");
    expect(en.filter((l) => l.generated).map((l) => l.id)).toEqual(["topics", "glossary", "names", "sources", "stories"]);
    expect(en.find((l) => l.id === "calendar")!.sub.map((s) => s.href)).toEqual(["/en/calendar/parsha/", "/en/calendar/zman/"]);
  });

  it("leaves out pages that are not built", () => {
    const lines = indexesBlock("en", (href) => href !== "/en/erachim/");
    expect(lines.map((l) => l.id)).toEqual(["topics", "names", "sources", "stories", "calendar", "years"]);
  });

  it("renders #indexes with one AI label and one line per index", async () => {
    const html = await render(IndexesBlock, { ed: "en", heading: "Indexes", lines: indexesBlock("en"), visibleShiurim: 993 });
    expect(html).toContain('id="indexes"');
    expect([...html.matchAll(/data-index="(\w+)"/g)].map((m) => m[1])).toEqual([...INDEX_LINE_ORDER]);
    expect(html.match(/corpus-label-index/g)).toHaveLength(1);
    expect(html).toContain("Compiled by AI from the notes on 993 shiurim.");
    expect(html).not.toContain('class="count"');
  });
});

describe("nav section matcher", () => {
  it("files every corpus index under Indexes (ענינים, ערכים, שמות, מראי מקומות, מעשיות)", () => {
    for (const dir of ["inyanim", "erachim", "people", "sources", "stories"]) {
      expect(navSectionOf(`/yi/${dir}/`), dir).toBe("indexes");
      expect(navSectionOf(`/en/${dir}/some-id/`), dir).toBe("indexes");
    }
    expect(navSectionOf("/en/calendar/")).toBe("calendar");
    expect(navSectionOf("/en/years/")).toBe("calendar");
  });
});
