import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it } from "vitest";
import CatalogHeader from "../src/components/CatalogHeader.astro";
import Coverage from "../src/components/Coverage.astro";
import HebrewYear from "../src/components/HebrewYear.astro";
import Listen from "../src/components/Listen.astro";
import NotesLabel from "../src/components/NotesLabel.astro";
import TimeLink from "../src/components/TimeLink.astro";
import Base from "../src/layouts/Base.astro";
import type { AudioRecording } from "../src/lib/audio.ts";
import { EDS, type Ed } from "../src/lib/edition.ts";
import { sampleRecordings, sampleShiur, sampleUncatalogued } from "../src/lib/sample.ts";

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

const render = (component: Parameters<AstroContainer["renderToString"]>[0], props: Record<string, unknown>, slots?: Record<string, string>) =>
  container.renderToString(component, { props, ...(slots ? { slots } : {}) });

/** Attribute values of every element matching a simple tag. */
function attrs(html: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "g"))) {
    const a: Record<string, string> = {};
    for (const p of (m[1] ?? "").matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) a[p[1]!] = p[2] ?? "";
    out.push(a);
  }
  return out;
}

const single: AudioRecording[] = [
  { id: "rec-1", offset: 0, duration: 4745, audioUrl: "https://media.example.org/Folder%20A/rec%201.mp3" },
];

describe("TimeLink", () => {
  it("links to the media URL at the recording-local second with player data", async () => {
    const html = await render(TimeLink, { ed: "en", recordings: sampleRecordings, t: 2100 });
    const [a] = attrs(html, "a");
    expect(a).toMatchObject({
      class: "time",
      href: "https://media.example.org/Sample%20Folder/Part%202.mp3#t=269.5",
      "data-rec": "sample-part-2",
      "data-t": "269.5",
      "data-g": "2100",
      "aria-label": "Play from 35:00 (part 2)",
    });
    expect(html).toContain('<bdi dir="ltr">35:00</bdi>');
    expect(html).not.toContain("/audio/");
  });

  it("keeps fractional seconds in the link and the player data (582.12, not 582)", async () => {
    const html = await render(TimeLink, { ed: "en", recordings: single, t: 582.12 });
    expect(attrs(html, "a")[0]).toMatchObject({ href: `${single[0]!.audioUrl}#t=582.12`, "data-t": "582.12", "data-g": "582.12" });
    expect(html).toContain('<bdi dir="ltr">9:42</bdi>');
  });

  it("names the action in the edition's language", async () => {
    const html = await render(TimeLink, { ed: "yi", recordings: single, t: 754 });
    expect(attrs(html, "a")[0]).toMatchObject({ href: `${single[0]!.audioUrl}#t=754`, "aria-label": "שפילן פון 12:34" });
  });

  it("renders plain text, not a dead link, when the recording is unavailable", async () => {
    const html = await render(TimeLink, { ed: "en", recordings: sampleRecordings, t: 3400 });
    expect(html).not.toContain("<a");
    expect(html).toContain("time-unavailable");
    expect(html).toContain("56:40");
  });
});

describe("Listen", () => {
  it("renders one native audio per playable recording with preload=none", async () => {
    const html = await render(Listen, { ed: "en", recordings: sampleRecordings });
    const audios = attrs(html, "audio");
    expect(audios).toHaveLength(2);
    for (const a of audios) {
      expect(a["preload"]).toBe("none");
      expect("controls" in a).toBe(true);
      expect(a["src"]).toMatch(/^https:\/\/media\.example\.org\/.+\.mp3$/);
    }
    expect(audios.map((a) => a["data-rec"])).toEqual(["sample-part-1", "sample-part-2"]);
    expect(html).toContain("Part 3: not yet available online.");
    expect(html).toContain("Part 1 of 3");
    expect(html).not.toContain("/audio/");
  });

  it("says the recording is not available when there is no URL", async () => {
    const html = await render(Listen, { ed: "yi", recordings: [{ ...single[0]!, audioUrl: null }] });
    expect(html).not.toContain("<audio");
    expect(html).toContain("די רעקארדירונג איז נאך נישט צוגעשטעלט אויפן אינטערנעט.");
  });

  it("treats a non-mp3 source as unavailable", async () => {
    const html = await render(Listen, { ed: "en", recordings: [{ ...single[0]!, audioUrl: "https://media.example.org/a.WMA" }] });
    expect(html).not.toContain("<audio");
    expect(html).toContain("not yet available online");
  });

  it("offers a download link per recording", async () => {
    const html = await render(Listen, { ed: "en", recordings: single });
    expect(html).toMatch(/<a class="download" href="https:\/\/media\.example\.org\/Folder%20A\/rec%201\.mp3" download>\s*Download\s*<\/a>/);
    expect(html).toContain("Length 1 hr 19 min");
  });
});

describe("CatalogHeader", () => {
  it("isolates the mixed-script title and builds the citation line", async () => {
    const html = await render(CatalogHeader, { ed: "en", shiur: sampleShiur, sectionHref: "/en/contents/" });
    expect(html).toMatch(/<h1 class="catalog-title"[^>]*><bdi lang="en" dir="ltr">The קדושה of צדיקים and the חשיבות of Learning תורה<\/bdi><\/h1>/);
    expect(html).toContain('<bdi lang="he" dir="rtl">נח</bdi>');
    expect(html).toContain("Pocket Guide p. 3");
    expect(html).toContain('<bdi lang="he" dir="rtl">תשמ&quot;ג</bdi>');
    expect(html).toContain("English");
    expect(html).toContain("1 hr 6 min");
    expect(html).not.toContain("catalog-notice");
  });

  it("marks rows that are not printed guide entries and shows path notes", async () => {
    const html = await render(CatalogHeader, { ed: "yi", shiur: sampleUncatalogued, level: 2 });
    expect(html).toContain("<h2");
    expect(html).toContain('class="catalog-notice"');
    expect(html).toContain("פאלדער");
    expect(html).toContain('<p class="path-note"><bdi lang="en" dir="ltr">for children (per file name)</bdi></p>');
    expect(html).toContain("אידיש");
  });
});

describe("HebrewYear", () => {
  it("renders the Hebrew year and civil pair as separate isolates, sorted", async () => {
    const html = await render(HebrewYear, { year: [5743, 5736] });
    expect(html.replace(/<!--.*?-->/g, "")).toBe(
      '<span class="hebrew-year"><span class="year" data-year="5736"><bdi lang="he" dir="rtl">תשל&quot;ו</bdi> <bdi dir="ltr" class="civil">(1975–76)</bdi></span>, ' +
        '<span class="year" data-year="5743"><bdi lang="he" dir="rtl">תשמ&quot;ג</bdi> <bdi dir="ltr" class="civil">(1982–83)</bdi></span></span>',
    );
  });

  it("falls back to digits for an unwritable year and can omit the civil pair", async () => {
    expect(await render(HebrewYear, { year: 12 })).toContain('<bdi dir="ltr" class="year" data-year="12">12</bdi>');
    expect(await render(HebrewYear, { year: 5743, civil: false })).not.toContain("1982");
  });
});

describe("NotesLabel and Coverage", () => {
  it("links the standing AI label to About", async () => {
    const html = await render(NotesLabel, { ed: "en" });
    expect(html).toContain('href="/en/about/#notes"');
    expect(html).toContain("Notes prepared by AI from the recording; not reviewed, and not the Mashgiach&#39;s words. The recording is the source.");
  });

  it("states coverage with ordinary digits", async () => {
    expect(await render(Coverage, { ed: "en", withNotes: 518, total: 997 })).toContain(
      "Compiled from the 518 shiurim that have notes so far, of 997.",
    );
  });
});

describe("Base layout", () => {
  const page = (ed: Ed, path: string) =>
    render(Base, { ed, title: "The קדושה of צדיקים", path, crumbs: [{ label: "Contents", href: `/${ed}/contents/` }, { label: "here" }] }, { default: "<p>body</p>" });

  it("sets lang and dir per edition", async () => {
    expect(await page("yi", "/yi/shiur/x/")).toMatch(/<html lang="yi" dir="rtl">/);
    expect(await page("en", "/en/shiur/x/")).toMatch(/<html lang="en" dir="ltr">/);
    expect(await page("he", "/he/shiur/x/")).toMatch(/<html lang="he" dir="rtl">/);
  });

  it("has a skip link, one nav line, a breadcrumb, main and footer", async () => {
    const html = await page("en", "/en/shiur/x/");
    expect(html).toContain('<a class="skip-link" href="#main">Skip to the text</a>');
    expect(html).toContain('<main id="main"');
    expect(html).toContain("<footer");
    const navLinks = [...html.matchAll(/<nav class="site-nav"[\s\S]*?<\/nav>/g)][0]![0];
    expect([...navLinks.matchAll(/>([^<>]+)<\/a>/g)].map((m) => m[1])).toEqual(["Contents", "Calendar", "Indexes", "Search", "About"]);
    expect(navLinks).toMatch(/href="\/en\/contents\/" aria-current="true"/);
    expect(html).toMatch(/<nav class="breadcrumb" aria-label="You are here">/);
    expect(html).toContain('<span aria-current="page"><bdi>here</bdi></span>');
  });

  it("links the edition switch to the same path in every other edition, each named in its own language", async () => {
    const html = await page("yi", "/yi/shiur/x/");
    const switches = attrs(html, "a").filter((a) => "data-edition-switch" in a);
    // header: one link per other edition; footer: "this page in …" per other edition
    expect(switches).toHaveLength(4);
    expect(switches.map((a) => a["href"])).toEqual(["/en/shiur/x/", "/he/shiur/x/", "/en/shiur/x/", "/he/shiur/x/"]);
    expect(switches.map((a) => a["hreflang"])).toEqual(["en", "he", "en", "he"]);
    expect(switches[0]).toMatchObject({ lang: "en", dir: "ltr" });
    expect(switches[1]).toMatchObject({ lang: "he", dir: "rtl" });
    expect(html).toContain(">English</a>");
    expect(html).toContain(">עברית</a>");
    expect(html).toContain("דער בלאט אויף ענגליש");

    const he = await page("he", "/he/shiur/x/#p0-1");
    const heSwitches = attrs(he, "a").filter((a) => "data-edition-switch" in a);
    expect(heSwitches.map((a) => a["href"])).toEqual(["/en/shiur/x/#p0-1", "/yi/shiur/x/#p0-1", "/en/shiur/x/#p0-1", "/yi/shiur/x/#p0-1"]);
    expect(he).toContain(">אידיש</a>");
    expect(he).toContain("הדף הזה באנגלית");
    expect(he).toContain("הדף הזה באידיש");
  });

  it("ends every page with the dedication, in every edition", async () => {
    for (const ed of EDS) {
      const html = await page(ed, `/${ed}/`);
      const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
      expect(footer.trimEnd()).toMatch(/לעילוי נשמת אשר בן ישראל<\/p>$/);
    }
  });

  it("isolates a catalog title in <title> and preloads the edition's body font", async () => {
    const html = await page("yi", "/yi/shiur/x/");
    expect(html).toContain("<title>⁨The קדושה of צדיקים⁩ · די שיעורים פון דעם משגיח</title>");
    expect(html).toContain('<link rel="preload" href="/fonts/frank-ruhl-libre-hebrew.woff2" as="font" type="font/woff2" crossorigin>');
  });
});
