/**
 * W3.3 acceptance on built pages: the repo's `data/` through `corpus:build` and the Quiet site build
 * (the shared build of test/site-builds.ts); checks the static HTML:
 * - every parsha and zman key has a page in both editions, and the indexes link to all of them;
 * - each occasion page lists exactly the aggregate's shiurim (Yiddish and English together, by
 *   year), seudah shiurim under a sub-heading, and no uncatalogued file-name guesses;
 * - the year pages list exactly years.json; "year not recorded" holds exactly the shiurim with no
 *   year and explains the gap;
 * - everything is in the HTML (no JS needed): plain links, no islands, internal links resolve;
 * - no transcript material reaches these pages (the CI guard post-pass scans all of dist/ too).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { OccasionShiurRef } from "@emunas/corpus/aggregate";
import { describe, expect, inject, it } from "vitest";
import { readCalendarData } from "./data.ts";
import { isGuessedRow, type CalendarData } from "./model.ts";
import { EDS } from "../../lib/edition.ts";

const { corpus, dist } = inject("quietSite");
const data: CalendarData = readCalendarData(corpus);

const page = (path: string): string => readFileSync(join(dist, path, "index.html"), "utf8");
const exists = (path: string): boolean => existsSync(join(dist, path, "index.html"));
const shiurIdsIn = (html: string): string[] => [...html.matchAll(/data-shiur="([^"]+)"/g)].map((m) => m[1]!);
const hrefsIn = (html: string): string[] => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
const firstYear = (r: OccasionShiurRef) => (r.years.length ? Math.min(...r.years) : Infinity);

function calendarPages(): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    const abs = join(dist, rel);
    for (const name of readdirSync(abs, { withFileTypes: true })) {
      if (name.isDirectory()) walk(join(rel, name.name));
      else if (name.name === "index.html") out.push(rel);
    }
  };
  for (const ed of EDS) {
    walk(join(ed, "calendar"));
    walk(join(ed, "years"));
  }
  return out;
}

describe("occasion pages", () => {
  it("exist for every parsha and zman key, in both editions, and the indexes link to each", () => {
    expect(data.occasions.parshiyos.length).toBeGreaterThan(0);
    for (const ed of EDS) {
      const pIndex = hrefsIn(page(`${ed}/calendar/parsha`));
      const zIndex = hrefsIn(page(`${ed}/calendar/zman`));
      for (const p of data.occasions.parshiyos) {
        expect(exists(`${ed}/calendar/parsha/${p.key}`), `${ed} parsha ${p.key}`).toBe(true);
        expect(pIndex, p.key).toContain(`/${ed}/calendar/parsha/${p.key}/`);
      }
      for (const z of data.occasions.zmanim) {
        expect(exists(`${ed}/calendar/zman/${z.key}`), `${ed} zman ${z.key}`).toBe(true);
        expect(zIndex, z.key).toContain(`/${ed}/calendar/zman/${z.key}/`);
      }
    }
    const built = readdirSync(join(dist, "en", "calendar", "parsha"), { withFileTypes: true }).filter((d) => d.isDirectory());
    expect(built.length).toBe(data.occasions.parshiyos.length);
  });

  it("list exactly the aggregate's shiurim, by year, with seudah shiurim under a sub-heading", () => {
    for (const ed of EDS) {
      for (const p of data.occasions.parshiyos) {
        expect(shiurIdsIn(page(`${ed}/calendar/parsha/${p.key}`)), p.key).toEqual(p.shiurim.map((s) => s.id));
        const ys = p.shiurim.map(firstYear);
        expect([...ys].sort((a, b) => a - b), p.key).toEqual(ys);
      }
      for (const z of data.occasions.zmanim) {
        const html = page(`${ed}/calendar/zman/${z.key}`);
        const subs = z.subs.filter((s) => s.shiurim.length > 0);
        expect(shiurIdsIn(html), z.key).toEqual([...z.shiurim, ...subs.flatMap((s) => s.shiurim)].map((s) => s.id));
        expect((html.match(/<section class="cal-sub"/g) ?? []).length, z.key).toBe(subs.length);
      }
    }
  });

  it("merge Yiddish and English shiurim on the same page", () => {
    const mixed = data.occasions.parshiyos.filter((p) => new Set(p.shiurim.map((s) => s.lang)).size === 2);
    expect(mixed.length).toBeGreaterThan(0);
    for (const p of mixed) {
      const html = page(`en/calendar/parsha/${p.key}`);
      expect(html).toContain('data-lang="yi"');
      expect(html).toContain('data-lang="en"');
    }
  });

  it("leave out uncatalogued rows whose parsha/zman is a file-name guess", () => {
    const guessed = new Set(data.index.shiurim.filter((r) => isGuessedRow(r) && (r.parsha || r.zman)).map((r) => r.id));
    expect(guessed.size).toBe(data.occasions.excluded.uncataloguedGuesses);
    for (const p of calendarPages().filter((x) => x.includes("calendar"))) {
      for (const id of shiurIdsIn(page(p))) expect(guessed.has(id), `${p}: ${id}`).toBe(false);
    }
  });

  it("show a sub-heading for the seudah where the data has one", () => {
    const withSeudah = data.occasions.zmanim.find((z) => z.subs.some((s) => s.sub === "seudah" && s.shiurim.length > 0));
    if (!withSeudah) return expect(data.occasions.zmanim.every((z) => z.subs.length === 0)).toBe(true);
    expect(page(`en/calendar/zman/${withSeudah.key}`)).toMatch(/<h2 id="sub-\d+">At the seudah<\/h2>/);
    expect(page(`yi/calendar/zman/${withSeudah.key}`)).toMatch(/<h2 id="sub-\d+">ביי דער סעודה<\/h2>/);
  });
});

describe("year pages", () => {
  it("one page per year listing exactly years.json, in its order", () => {
    for (const ed of EDS) {
      const idx = page(`${ed}/years`);
      for (const y of data.years.years) {
        expect(idx).toContain(`href="/${ed}/years/${y.year}/"`);
        expect(shiurIdsIn(page(`${ed}/years/${y.year}`)), String(y.year)).toEqual(y.shiurIds);
      }
    }
  });

  it("'year not recorded' holds exactly the shiurim without a year and explains the gap", () => {
    const noYear = data.index.shiurim.filter((r) => r.years.length === 0).map((r) => r.id);
    expect(data.years.unknown.count).toBe(noYear.length);
    for (const ed of EDS) {
      const html = page(`${ed}/years/unknown`);
      const ids = shiurIdsIn(html);
      expect(ids.length).toBe(noYear.length);
      expect(new Set(ids)).toEqual(new Set(noYear));
      expect(html).toContain(`data-count="${noYear.length}"`);
      expect(page(`${ed}/years`)).toContain(`href="/${ed}/years/unknown/"`);
    }
    expect(page("en/years/unknown")).toContain("were not dated in the 2012 Pocket Guide");
    expect(page("en/years")).toContain(
      `The year is recorded for ${(data.index.shiurim.length - noYear.length).toLocaleString("en")} of the ${data.index.shiurim.length.toLocaleString("en")} shiurim.`,
    );
  });
});

describe("all calendar and year pages", () => {
  it("work without JS: content is in the HTML, links are plain, internal calendar links resolve", () => {
    const pages = calendarPages();
    // per edition: /calendar/ (W4.9), the parsha and zman indexes, every occasion, the year index,
    // the unknown-year page and every year
    expect(pages.length).toBe(EDS.length * (3 + data.occasions.parshiyos.length + data.occasions.zmanim.length + 2 + data.years.years.length));
    for (const p of pages) {
      const html = page(p);
      expect(html, p).not.toContain("astro-island");
      expect(html, p).not.toMatch(/\son(click|load)=/);
      expect(html, p).toMatch(/<h1>/);
      for (const href of hrefsIn(html)) {
        if (/^\/(en|yi|he)\/(calendar|years)\//.test(href)) expect(exists(href.replace(/#.*$/, "")), `${p} → ${href}`).toBe(true);
      }
    }
  });

  it("/{ed}/calendar/ leads to the three ways in (W4.9)", () => {
    for (const ed of EDS) {
      const html = page(`${ed}/calendar`);
      const hrefs = hrefsIn(html);
      for (const want of [`/${ed}/calendar/parsha/`, `/${ed}/calendar/zman/`, `/${ed}/years/`]) expect(hrefs, ed).toContain(want);
    }
  });

  it("nav and breadcrumbs lead to /{ed}/calendar/ (W5.5)", () => {
    for (const ed of EDS) {
      const home = `/${ed}/calendar/`;
      const nav = (html: string): string => html.match(/<nav[^>]*class="site-nav[^"]*"[\s\S]*?<\/nav>/)?.[0] ?? "";
      const crumbs = (html: string): string => html.match(/<nav[^>]*class="breadcrumb[^"]*"[\s\S]*?<\/nav>/)?.[0] ?? "";
      for (const p of [`${ed}/calendar/parsha`, `${ed}/calendar/zman`, `${ed}/years`]) {
        const html = page(p);
        expect(hrefsIn(nav(html)), p).toContain(home);
        expect(hrefsIn(crumbs(html)), p).toContain(home);
        expect(hrefsIn(nav(html)), p).not.toContain(`/${ed}/calendar/parsha/`);
      }
      expect(hrefsIn(nav(page(`${ed}/calendar`)))).toContain(home);
    }
  });

  it("carry no transcript material", () => {
    for (const p of calendarPages()) {
      const html = page(p);
      for (const banned of ["transcripts/", "heardAs", "asrNotes", "transcriptKey", "audioKey", "startSeg", "questionSegs"]) {
        expect(html.includes(banned), `${p}: ${banned}`).toBe(false);
      }
    }
  });
});
