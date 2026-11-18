/**
 * C2.1: the index of names and the person pages on the mini corpus layer.
 */
import { LAYER_PERSON_GROUPS } from "@emunas/corpus/public";
import { personGroupLabel } from "@emunas/i18n";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEntryDataFrom, type EntryData } from "../../indexes/entries.ts";
import { buildMiniCorpus, type MiniCorpus } from "../../indexes/test/mini.ts";
import { isListed, namesIndex, personPage, personPageIds, type PersonLine } from "../model.ts";
import { EDS, type Ed } from "../../../lib/edition.ts";

let mini: MiniCorpus;
let d: EntryData;

beforeAll(() => {
  mini = buildMiniCorpus();
  d = loadEntryDataFrom(mini.dir);
}, 120_000);

afterAll(() => mini?.dispose());

const personLines = (ed: Ed): PersonLine[] =>
  namesIndex(d, ed).flatMap((g) => g.lines.filter((l): l is PersonLine => l.kind === "person"));

describe("names index (שמות)", () => {
  it("lists exactly the people the layer lists on Quiet, once each", () => {
    const want = d.layer.people.filter(isListed).map((p) => p.id).sort();
    expect(want.length).toBeGreaterThan(50);
    for (const ed of EDS) expect(personLines(ed).map((l) => l.id).sort()).toEqual(want);
  });

  it("leaves out type-other people below 3 shiurim and excluded people (the Mashgiach's family)", () => {
    const ids = new Set(personLines("en").map((l) => l.id));
    const other = d.layer.people.filter((p) => p.group === "other");
    expect(other.some((p) => p.count < 3)).toBe(true);
    for (const p of other) expect(ids.has(p.id), p.id).toBe(p.count >= 3);
    const excluded = d.layer.people.filter((p) => p.excluded !== null);
    expect(excluded.length).toBeGreaterThan(0);
    for (const p of excluded) expect(ids.has(p.id), p.id).toBe(false);
  });

  it("arranges the groups as a sefer does, alphabetical inside a group by the edition's name", () => {
    for (const ed of EDS) {
      const groups = namesIndex(d, ed);
      const order = groups.map((g) => LAYER_PERSON_GROUPS.indexOf(g.group));
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(groups[0]!.group).toBe("tanach");
      for (const g of groups) {
        expect(g.label).toBe(personGroupLabel(g.group, ed));
        for (const l of g.lines.filter((x): x is PersonLine => x.kind === "person")) expect(d.layer.person(l.id)!.group).toBe(g.group);
      }
    }
    const tanachYi = namesIndex(d, "yi")[0]!.lines.filter((l) => l.kind === "person");
    expect(tanachYi.map((l) => l.name.text)).toContain("אברהם אבינו");
    const i = tanachYi.findIndex((l) => l.name.text === "אברהם אבינו");
    const j = tanachYi.findIndex((l) => l.name.text === "אחשורוש");
    expect(i).toBeLessThan(j);
    // English edition: nameEn with nameHe beside it
    const avraham = personLines("en").find((l) => l.id === "avraham-avinu")!;
    expect(avraham.name.text).toBe("Avraham Avinu");
    expect(avraham.alt?.text).toBe(d.layer.person("avraham-avinu")!.nameHe);
  });

  it("ignores the article when filing (the Arizal under A, דער הייליגער אר\"י under ה)", () => {
    const en = personLines("en").find((l) => l.id === "arizal")!;
    expect(en.letter).toBe("A");
    const yi = personLines("yi").find((l) => l.id === "arizal")!;
    expect(yi.name.text).toBe('דער הייליגער אר"י');
    expect(yi.letter).toBe("ה");
  });

  it("shows aliases as 'also:' and files those in the edition's script as 'see' lines", () => {
    const en = namesIndex(d, "en");
    const avnei = en.flatMap((g) => g.lines).find((l) => l.kind === "person" && l.id === "avnei-nezer") as PersonLine;
    expect(avnei.also.map((r) => r.text)).toEqual(expect.arrayContaining(["the Eglei Tal", "the Sochatchover Rav"]));
    const sees = en.flatMap((g) => g.lines).filter((l) => l.kind === "see" && l.id === "avnei-nezer");
    expect(sees.map((s) => s.name.text)).toEqual(expect.arrayContaining(["the Eglei Tal", "the Sochatchover Rav"]));
    for (const s of sees) {
      expect(s.kind === "see" && s.target.text).toBe(avnei.name.text);
      expect(s.kind === "see" && s.href).toBe(avnei.href ?? `#${avnei.id}`);
    }
    // Latin aliases are not filed in the Yiddish alphabet
    const yiSees = namesIndex(d, "yi").flatMap((g) => g.lines).filter((l) => l.kind === "see");
    for (const s of yiSees) expect(/[א-ת]/.test(s.name.text)).toBe(true);
  });

  it("links a person with a page; lists the shiurim of anyone else; never links a shiur outside the visible set", () => {
    for (const l of personLines("en")) {
      const p = d.layer.person(l.id)!;
      if (p.pages.quiet) {
        expect(l.href).toBe(`/en/people/${p.id}/`);
        expect(l.cites).toEqual([]);
      } else {
        expect(l.href).toBeNull();
        expect(l.cites.map((c) => c.shiurId)).toEqual(p.shiurIds.filter((id) => d.visible(id)));
        expect(l.cites.length).toBeGreaterThan(0);
      }
      for (const c of l.cites) expect(d.rows.get(c.shiurId)!.status).toBe("full");
    }
  });
});

describe("person pages", () => {
  it("are built for exactly the people with a Quiet page flag, never for type other", () => {
    const { pages } = personPageIds(d);
    expect(pages.sort()).toEqual(d.layer.people.filter((p) => p.pages.quiet).map((p) => p.id).sort());
    for (const id of pages) expect(d.layer.person(id)!.group).not.toBe("other");
  });

  it("have names, his seforim, stories (merged, from the layer), then the shiurim", () => {
    const tanya = d.layer.person("baal-hatanya")!;
    const page = personPage(d, "en", tanya);
    expect(page.head.title.text).toBe(tanya.nameEn);
    expect(page.also.map((r) => r.text)).toEqual(expect.arrayContaining(["the Alter Rebbe"]));
    expect(page.seforim.map((s) => s.id)).toEqual(["tanya"]);
    expect(page.seforim[0]!.href).toBe(d.layer.work("tanya")!.pages.quiet ? "/en/sources/tanya/" : "/en/sources/#tanya");
    expect(page.stories.map((s) => s.id)).toEqual(tanya.storyIds);
    for (const s of page.stories) expect(s.label.text).toBe(d.layer.story(s.id)!.title.en);
    expect(page.shiurim.map((c) => c.shiurId)).toEqual(tanya.shiurIds);
    expect(page.allHref).toBeNull();
  });

  it("puts a passim person's list on all/ (policy threshold)", () => {
    const p = { ...d.layer.people.find((x) => x.pages.quiet)!, quietAllList: true };
    const main = personPage(d, "yi", p);
    expect(main.shiurim).toEqual([]);
    expect(main.allHref).toBe(`/yi/people/${p.id}/all/`);
    const all = personPage(d, "yi", p, true);
    expect(all.shiurim.length).toBe(p.shiurIds.length);
    expect(all.allHref).toBeNull();
  });

  it("points to the same subject only through sameAs (a topic), never by a matching slug", () => {
    const moshe = d.layer.person("moshe-rabbeinu")!;
    const page = personPage(d, "en", moshe);
    expect(page.seeAlso.map((s) => s.href)).toContain(`/en/inyanim/${moshe.sameAsTopic}/`);
    // a person whose id matches a work id but has no sameAs gets no pointer to that work
    const slug = d.layer.people.find((p) => p.sameIdWork !== null && p.sameAsTopic === null && p.pages.quiet);
    if (slug) expect(personPage(d, "en", slug).seeAlso.some((s) => s.href.includes(`/sources/${slug.id}`))).toBe(false);
  });

  it("carries the reviewed flag for the label", () => {
    const p = d.layer.people.find((x) => x.pages.quiet)!;
    expect(personPage(d, "en", p).reviewed).toBe(false);
    expect(personPage(d, "en", { ...p, reviewed: true }).reviewed).toBe(true);
  });
});
