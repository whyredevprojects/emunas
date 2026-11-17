/**
 * C2.2: the topic-index components rendered with the Astro container: the tree (gates, runs,
 * run-in subtopics, counts), the three grades (headings in words, principal weight, language and
 * year on every row, occasion marks, part links), the topic head (definition, notes, calendar line)
 * and the one-line calendar rule; and the string tables of both editions.
 */
import { corpusLabel } from "@emunas/i18n";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it } from "vitest";
import { calendarEn, calendarYi } from "../../calendar/strings.ts";
import TopicGrades from "../TopicGrades.astro";
import TopicHead from "../TopicHead.astro";
import TopicTree from "../TopicTree.astro";
import type { TopicGrades as Grades, TopicPage, TreeGate } from "../model.ts";
import { topicsEn, topicsYi } from "../strings.ts";

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

const render = (component: Parameters<AstroContainer["renderToString"]>[0], props: Record<string, unknown>) =>
  container.renderToString(component, { props });
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const he = (t: string) => ({ text: t, lang: "he" as const, dir: "rtl" as const });
const en = (t: string) => ({ text: t, lang: "en" as const, dir: "ltr" as const });

const placeholders = (m: unknown) =>
  [...new Set((typeof m === "string" ? [m] : Object.values(m as Record<string, string>)).flatMap((f) => [...f.matchAll(/\{(\w+)\}/g)].map((x) => x[1])))].sort();

describe("strings", () => {
  it("has every key in both editions, with the same placeholders", () => {
    expect(Object.keys(topicsYi).sort()).toEqual(Object.keys(topicsEn).sort());
    for (const k of Object.keys(topicsEn) as (keyof typeof topicsEn)[]) expect(placeholders(topicsYi[k]), k).toEqual(placeholders(topicsEn[k]));
    expect(placeholders(calendarYi["cal.topicLine"])).toEqual(placeholders(calendarEn["cal.topicLine"]));
    expect(placeholders(calendarEn["cal.topicLine"])).toEqual(["count", "occasion"]);
  });

  it("speaks of the Mashgiach in Yiddish as דער משגיח, never דער רב", () => {
    for (const v of [...Object.values(topicsYi), calendarYi["cal.topicLine"]]) expect(JSON.stringify(v)).not.toContain("דער רב");
  });
});

const gates: TreeGate[] = [
  {
    id: "emunah",
    name: { title: he("אמונה"), alt: en("Emunah") },
    count: 539,
    href: "/en/inyanim/emunah/",
    topics: [
      { id: "bitachon", name: { title: he("בטחון"), alt: en("Bitachon") }, count: 80, href: "/en/inyanim/bitachon/", sub: [] },
      {
        id: "ikvesa",
        name: { title: he("עקבתא דמשיחא"), alt: null },
        count: 1201,
        href: "/en/inyanim/ikvesa/",
        sub: [
          { id: "avodas-dor", name: { title: he("עבודת הדור האחרון"), alt: null }, count: 134, href: "/en/inyanim/avodas-dor/" },
          { id: "simanim", name: { title: he("סימני עקבתא דמשיחא"), alt: null }, count: 87, href: null },
        ],
      },
    ],
  },
];

describe("TopicTree", () => {
  it("prints each gate as a heading with its count, topics as a run, subtopics after a dash", async () => {
    const html = await render(TopicTree, { ed: "en", gates });
    expect(html).toMatch(/<h2 id="g-emunah-h">/);
    expect(text(html)).toContain("אמונה Emunah · 539");
    expect(text(html)).toContain("בטחון Bitachon 80");
    expect(text(html)).toContain("עקבתא דמשיחא 1,201 — עבודת הדור האחרון 134 סימני עקבתא דמשיחא 87");
    expect(html).toContain('href="/en/inyanim/bitachon/"');
    expect(html).not.toContain('href="null"');
    // the unlinked subtopic is printed without a link
    expect(html.match(/<a href=/g)).toHaveLength(4);
    expect(html).toContain('<bdi lang="he" dir="rtl">אמונה</bdi>');
    // real lists, no aria-label on generic elements
    expect(html).toContain('<ul role="list" class="tree-run"');
    expect(html).toContain('<ul role="list" class="tree-sub"');
    expect(html).not.toMatch(/aria-label=/);
  });
});

const grades: Grades = {
  main: [
    { shiurId: "a", href: "/en/shiur/a/", title: "The Lesson of the מגילה", lang: "en", years: [5749], occasion: "Purim", onOccasion: { kind: "zman", key: "purim", name: "Purim", he: "פורים", href: "/en/calendar/zman/purim/" } },
  ],
  discussed: [{ shiurId: "b", href: "/en/shiur/b/", title: "ועזוז נוראותיך", lang: "yi", years: [], occasion: null, onOccasion: null }],
  touched: [
    {
      shiurId: "c",
      href: "/en/shiur/c/",
      title: "נח",
      lang: "yi",
      years: [5743],
      occasion: "נח",
      onOccasion: null,
      parts: [
        { idx: 6, t: 1732.6, time: "28:52", href: "/en/shiur/c/#s6", title: "Tehillim: Your right hand holds me" },
        { idx: 8, t: 2880, time: "48:00", href: "/en/shiur/c/#s8", title: null },
      ],
    },
  ],
};

describe("TopicGrades", () => {
  it("names the grades in words, sets the principal rows in weight, and states language and year", async () => {
    const html = await render(TopicGrades, { ed: "en", grades });
    expect([...html.matchAll(/data-grade="(\w+)"/g)].map((m) => m[1])).toEqual(["main", "discussed", "touched"]);
    expect(text(html)).toContain(corpusLabel("grade.main", "en"));
    expect(text(html)).not.toContain(`${corpusLabel("grade.main", "en")} (1)`);
    expect(text(html)).toContain(corpusLabel("grade.discussed", "en"));
    expect(text(html)).toContain(corpusLabel("grade.touched", "en"));
    expect(html).toMatch(/class="topic-row principal" data-shiur="a"/);
    expect(html).toMatch(/class="topic-row" data-shiur="b"/);
    // language on every row (in the edition's words), even when it is the edition's own
    expect(html.match(/data-lang="(yi|en)"/g)).toHaveLength(3);
    expect(text(html)).toContain("English");
    expect(text(html)).toContain("Yiddish");
    // year: the Hebrew year, or "year not recorded"
    expect(html).toContain('data-year="5749"');
    expect(text(html)).toContain("year not recorded");
    // the occasion mark links to the calendar page
    expect(html).toContain('data-on-occasion="zman:purim"');
    expect(html).toContain('<a href="/en/calendar/zman/purim/">said on Purim</a>');
    // touched: each part's title and time as the link to the section
    expect(html).toContain('href="/en/shiur/c/#s6"');
    expect(text(html)).toContain("Tehillim: Your right hand holds me 28:52");
    expect(html).toContain('href="/en/shiur/c/#s8"');
  });

  it("leaves out an empty grade", async () => {
    const html = await render(TopicGrades, { ed: "yi", grades: { main: [], discussed: grades.discussed, touched: [] } });
    expect([...html.matchAll(/data-grade="(\w+)"/g)].map((m) => m[1])).toEqual(["discussed"]);
    expect(text(html)).toContain(corpusLabel("grade.discussed", "yi"));
    expect(text(html)).toContain("יאר נישט פארצייכנט");
  });
});

const page: TopicPage = {
  id: "chanukah",
  name: { title: he("חנוכה"), alt: en("Chanukah") },
  count: 130,
  path: [{ id: "zmanim", name: { title: he("ימים טובים וזמנים"), alt: en("Yamim Tovim") }, href: "/en/inyanim/zmanim/" }],
  seeAlso: [{ label: he("ימים טובים וזמנים"), href: "/en/inyanim/zmanim/", rel: "parent" }],
  description: "The Mashgiach teaches about the lights.",
  definition: "The eight days of light.",
  occasions: [{ kind: "zman", key: "chanukah", name: "Chanukah", he: "חנוכה", href: "/en/calendar/zman/chanukah/" }],
  hubs: [],
  gateway: false,
  children: [],
  reviewed: false,
};

describe("TopicHead", () => {
  it("prints the headword, count, see also, definition, description and the calendar days", async () => {
    const html = await render(TopicHead, { ed: "en", page });
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(text(html)).toContain("חנוכה Chanukah");
    expect(text(html)).toContain("130 shiurim");
    expect(text(html)).not.toContain("In the index");
    expect(html).toContain('class="see-also"');
    expect(html).toContain("data-definition");
    expect(text(html)).toContain("The eight days of light.");
    expect(html).toContain("data-description");
    expect(html).toContain('href="/en/calendar/zman/chanukah/"');
  });

  it("leaves out what is missing, and the notes on a continuation page", async () => {
    const bare = { ...page, description: null, definition: null, occasions: [], path: [], seeAlso: [] };
    const html = await render(TopicHead, { ed: "yi", page: bare });
    expect(html).not.toContain("voice-notes");
    const all = await render(TopicHead, { ed: "en", page, meta: "all the shiurim", notes: false });
    expect(text(all)).toContain("all the shiurim · 130 shiurim");
    expect(all).not.toContain("data-description");
    expect(all).not.toContain("see-also");
  });
});

