/**
 * C2.3 acceptance on the real corpus, end to end:
 *   corpus:build (repo data, layer included) → astro build → checks on dist (the shared build of
 *   test/site-builds.ts).
 *
 * - story pages: exactly the stories whose layer Quiet page flag is set, in both editions; the
 *   survivor of an upstream merge is listed (with a page when its flag says so) and the retired id
 *   has no page and no anchor;
 * - the merged retelling appears only on its story page, once, after the story label, and nowhere
 *   on the index;
 * - the index lists every story with a citable telling, each with exactly one anchor, and every
 *   link on the stories pages resolves (pages, anchors, shiurim and their sections);
 * - series pages: shabbos-tefilah-en has no page (and no synthesis), a series without a synthesis
 *   has no intro block, tanya-yi has its intro and keeps its part without notes as a row saying
 *   "notes not prepared yet"; no page links one series to another (no pairing).
 *
 * Reads the repository's data folder only through the corpus CLI, like CI does.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SeriesFile } from "@emunas/corpus/aggregate";
import type { CorpusIndex, LayerInfo, LayerPeopleFile, LayerStoriesFile, PublicShiur } from "@emunas/corpus/public";
import { corpusLabel, pickText, type LocalizedText } from "@emunas/i18n";
import { describe, expect, inject, it } from "vitest";
import { EDS } from "../../../lib/edition.ts";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..");
const { corpus, dist } = inject("quietSite");

const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

const page = (path: string): string => readFileSync(join(dist, path, "index.html"), "utf8");
const mainOf = (html: string): string => {
  const a = html.indexOf("<main");
  const b = html.indexOf("</main>");
  if (a < 0 || b < a) throw new Error("no <main>");
  return html.slice(a, b);
};
const idsOf = (html: string): string[] => [...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]!);
const hrefsOf = (html: string): string[] => [...html.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
const dirsUnder = (p: string): string[] =>
  existsSync(p) ? readdirSync(p).filter((n) => statSync(join(p, n)).isDirectory()).sort() : [];
/** Text as Astro escapes it in HTML. */
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const count = (hay: string, needle: string): number => hay.split(needle).length - 1;

describe("C2.3 stories on the real corpus", () => {
  it("builds a story page for exactly the stories with the Quiet page flag", () => {
    const stories = readJson<LayerStoriesFile>(join(corpus, "layer", "stories.json")).stories;
    const info = readJson<LayerInfo>(join(corpus, "layer", "layer.json"));
    const want = stories.filter((s) => s.pages.quiet).map((s) => s.id).sort();
    expect(want.length).toBe(info.counts.pages.quiet.stories);
    expect(want.length).toBeGreaterThan(200);
    for (const ed of EDS) expect(dirsUnder(join(dist, ed, "stories"))).toEqual(want);
  });

  it("follows upstream merges: the retired id has no page and no anchor, the survivor is listed", () => {
    const redirects = readJson<{ stories?: Record<string, unknown> }>(join(repo, "data", "derived", "corpus", "redirects.json")).stories ?? {};
    const stories = new Map(readJson<LayerStoriesFile>(join(corpus, "layer", "stories.json")).stories.map((s) => [s.id, s]));
    const merges = Object.entries(redirects).filter((e): e is [string, string] => typeof e[1] === "string");
    expect(merges.length).toBeGreaterThan(0);
    expect(merges.map(([from]) => from)).toContain("the-sanzer-rav-and-the-business-competitor");
    for (const ed of EDS) {
      const index = page(`${ed}/stories`);
      const ids = new Set(idsOf(index));
      for (const [from, to] of merges) {
        expect(existsSync(join(dist, ed, "stories", from)), from).toBe(false);
        expect(ids.has(from), from).toBe(false);
        const survivor = stories.get(to);
        if (!survivor) continue;
        expect(existsSync(join(dist, ed, "stories", to, "index.html")), to).toBe(survivor.pages.quiet);
        expect(ids.has(to), to).toBe(true);
      }
    }
  });

  it("prints a retelling only under its label, on its own page", () => {
    const stories = readJson<LayerStoriesFile>(join(corpus, "layer", "stories.json")).stories;
    for (const ed of EDS) {
      const index = page(`${ed}/stories`);
      let checked = 0;
      for (const s of stories) {
        // the edition's retelling, else the fallback's (no Hebrew translations in today's data)
        const text = pickText(s.retelling, ed).text.trim();
        if (text === "") continue;
        const needle = esc(text);
        if (!s.pages.quiet) continue;
        const html = page(`${ed}/stories/${s.id}`);
        expect(count(html, needle), `${ed} ${s.id}`).toBe(1);
        const at = html.indexOf(needle);
        const label = html.indexOf("corpus-label-story");
        expect(label, `${ed} ${s.id} label`).toBeGreaterThan(-1);
        expect(label).toBeLessThan(at);
        expect(html.slice(html.lastIndexOf("<p", at), at)).toContain("data-retelling");
        expect(index.includes(needle.slice(0, 60)), `${ed} index has ${s.id}`).toBe(false);
        checked++;
      }
      expect(checked).toBeGreaterThan(200);
    }
  });

  it("each story page has its label once, the tellings, and the entry label at the foot", () => {
    const stories = readJson<LayerStoriesFile>(join(corpus, "layer", "stories.json")).stories.filter((s) => s.pages.quiet);
    for (const ed of EDS) {
      for (const s of stories) {
        const main = mainOf(page(`${ed}/stories/${s.id}`));
        expect(count(main, "corpus-label-story"), s.id).toBe(1);
        expect(count(main, 'class="telling"'), s.id).toBeGreaterThanOrEqual(2);
        expect(count(main, "corpus-label-entry"), s.id).toBe(1);
        expect((main.match(/<h1\b/g) ?? []).length).toBe(1);
        if (s.attributionVaries) expect(main).toContain(esc(corpusLabel("story.attributionVaries", ed)));
      }
    }
  });

  it("prints only corpus entities' display names as story people, each marked for the guard (C3.1)", () => {
    const stories = readJson<LayerStoriesFile>(join(corpus, "layer", "stories.json")).stories;
    const people = readJson<LayerPeopleFile>(join(corpus, "layer", "people.json")).people;
    const concepts = readJson<{ concepts: { label: { en: string; yi: string }; canonicalHe: string }[] }>(join(corpus, "layer", "concepts.json")).concepts;
    const display = new Set<string>([
      ...people.flatMap((p) => [p.nameEn, p.nameHe, p.nameYi, ...(p.aliases ?? [])]),
      ...concepts.flatMap((c) => [c.label.en, c.label.yi, c.canonicalHe]),
    ].filter((x): x is string => typeof x === "string" && x !== "").map(esc));
    // The layer itself: a plain name is always some entity's display name.
    for (const s of stories) for (const p of s.people) if ("name" in p) expect(display.has(esc(p.name)), `${s.id}`).toBe(true);
    let checked = 0;
    for (const ed of EDS) {
      for (const s of stories.filter((x) => x.pages.quiet)) {
        for (const m of mainOf(page(`${ed}/stories/${s.id}`)).matchAll(/<bdi[^>]*\sdata-story-person[^>]*>([^<]*)<\/bdi>/g)) {
          checked++;
          expect(display.has(m[1]!), `${ed}/stories/${s.id}`).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("lists every story with a telling, each anchored once, under the index label", () => {
    const stories = readJson<LayerStoriesFile>(join(corpus, "layer", "stories.json")).stories;
    for (const ed of EDS) {
      const html = page(`${ed}/stories`);
      const ids = idsOf(html);
      const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
      expect(dup).toEqual([]);
      const set = new Set(ids);
      const missing = stories.filter((s) => s.tellings.length > 0 && !set.has(s.id)).map((s) => s.id);
      expect(missing).toEqual([]);
      expect(count(mainOf(html), "corpus-label-index")).toBe(1);
      for (const part of ["part~most-retold", "part~by-person", "part~without-name"]) expect(set.has(part), part).toBe(true);
    }
  });

  it("every link on the stories pages resolves", () => {
    const index = readJson<CorpusIndex>(join(corpus, "index.json"));
    const rows = new Map(index.shiurim.map((r) => [r.id, r]));
    const people = new Map(readJson<LayerPeopleFile>(join(corpus, "layer", "people.json")).people.map((x) => [x.id, x]));
    const chapters = new Map<string, Set<number>>();
    const chaptersOf = (id: string): Set<number> => {
      let s = chapters.get(id);
      if (!s) {
        const shiur = readJson<PublicShiur>(join(corpus, "shiurim", `${id}.json`));
        s = new Set((shiur.notes?.chapters ?? []).map((c) => c.idx));
        chapters.set(id, s);
      }
      return s;
    };
    const idCache = new Map<string, Set<string>>();
    const idsAt = (path: string): Set<string> => {
      let s = idCache.get(path);
      if (!s) idCache.set(path, (s = new Set(idsOf(readFileSync(join(dist, path, "index.html"), "utf8")))));
      return s;
    };
    const broken: string[] = [];
    let shiurLinks = 0;
    for (const ed of EDS) {
      const paths = [`${ed}/stories`, ...dirsUnder(join(dist, ed, "stories")).map((d) => `${ed}/stories/${d}`)];
      for (const path of paths) {
        for (const href of hrefsOf(mainOf(page(path)))) {
          const bad = (why: string) => broken.push(`/${path}/ → ${href}: ${why}`);
          if (href.startsWith("mailto:")) continue;
          if (href.startsWith("#")) {
            if (!idsAt(path).has(decodeURIComponent(href.slice(1)))) bad("no such anchor");
            continue;
          }
          if (/^[a-z]+:/i.test(href)) {
            bad("external link");
            continue;
          }
          const [p, frag] = href.split("#") as [string, string | undefined];
          if (!p.startsWith(`/${ed}/`)) bad("crosses editions");
          const shiur = /^\/(en|yi|he)\/shiur\/([^/]+)\/$/.exec(p);
          if (shiur) {
            shiurLinks++;
            const row = rows.get(decodeURIComponent(shiur[2]!));
            if (!row) bad("unknown shiur");
            else if (frag !== undefined) {
              const t = /^t=(\d+(?:\.\d+)?)$/.exec(frag);
              const s = /^s(\d+)$/.exec(frag);
              if (t) {
                if (Number(t[1]) > Math.ceil(row.duration)) bad("time beyond the shiur");
              } else if (s) {
                if (!chaptersOf(row.id).has(Number(s[1]))) bad("no such section");
              } else bad("unknown fragment");
            }
            continue;
          }
          const rel = p.replace(/^\//, "").replace(/\/$/, "");
          // Person pages and the index of names are C2.1's (built from the same layer flags):
          // a person link must name a person with a Quiet page, or point at the index of names.
          const personPage = /^\/(?:en|yi|he)\/people\/([^/]+)\/$/.exec(p);
          if (personPage) {
            if (people.get(decodeURIComponent(personPage[1]!))?.pages.quiet !== true) bad("person without a Quiet page");
            continue;
          }
          if (/^\/(?:en|yi|he)\/people\/$/.test(p)) {
            const id = frag === undefined ? null : decodeURIComponent(frag);
            const person = id === null ? undefined : people.get(id);
            if (!person || person.listed.quiet !== true || person.pages.quiet) bad("not an index line of a listed person without a page");
            continue;
          }
          if (!existsSync(join(dist, rel, "index.html"))) {
            bad("no such page");
            continue;
          }
          // anchors into the stories index are checked; the index of names is C2.1's page
          if (frag !== undefined && /\/stories$/.test(rel) && !idsAt(rel).has(decodeURIComponent(frag))) bad("no such anchor");
        }
      }
    }
    expect(broken.slice(0, 20)).toEqual([]);
    expect(shiurLinks).toBeGreaterThan(1_000);
  });
});

describe("C2.3 series introductions on the real corpus", () => {
  it("shabbos-tefilah-en has no page and no synthesis", () => {
    expect(existsSync(join(corpus, "layer", "series", "shabbos-tefilah-en.json"))).toBe(false);
    for (const ed of EDS) expect(existsSync(join(dist, ed, "series", "shabbos-tefilah-en"))).toBe(false);
  });

  it("shows the intro exactly where the layer has a synthesis", () => {
    const series = readJson<SeriesFile>(join(corpus, "series.json")).series.filter((s) => s.parts.length > 0);
    let withIntro = 0;
    for (const ed of EDS) {
      for (const s of series) {
        const html = page(`${ed}/series/${s.id}`);
        const synth = existsSync(join(corpus, "layer", "series", `${s.id}.json`));
        expect(html.includes("data-series-intro"), `${ed} ${s.id}`).toBe(synth);
        if (synth) withIntro++;
        expect(count(mainOf(html), 'class="notes-label"'), `${ed} ${s.id}`).toBeLessThanOrEqual(1);
        // no pairing: a series page never links to another series
        const other = hrefsOf(mainOf(html)).filter((h) => /\/series\//.test(h) && !h.includes(`/series/${s.id}/`));
        expect(other, `${ed} ${s.id}`).toEqual([]);
        expect(html).not.toMatch(/sibling/i);
      }
    }
    expect(withIntro).toBeGreaterThan(10);
  });

  it("tanya-yi keeps its part without notes as a row: notes not prepared yet", () => {
    const synth = readJson<{ missing: number[]; title: LocalizedText }>(join(corpus, "layer", "series", "tanya-yi.json"));
    expect(synth.missing.length).toBeGreaterThan(0);
    const parts = readJson<SeriesFile>(join(corpus, "series.json")).series.find((s) => s.id === "tanya-yi")!.parts;
    for (const ed of EDS) {
      const html = page(`${ed}/series/tanya-yi`);
      const label = esc(corpusLabel("notesNotPrepared", ed));
      expect(count(html, label)).toBe(synth.missing.length);
      for (const n of synth.missing) {
        const id = parts[n - 1]!.id;
        const at = html.indexOf(`id="row-${id}"`);
        expect(at, id).toBeGreaterThan(-1);
        expect(html.slice(at, html.indexOf("</tr>", at))).toContain(label);
      }
      // the generated title is a subtitle in the notes area; the catalog name stays the h1
      const subtitle = esc(pickText(synth.title, ed).text);
      expect(html).toContain(subtitle);
      expect(html.slice(html.indexOf("<h1"), html.indexOf("</h1>"))).not.toContain(subtitle);
    }
  });
});
