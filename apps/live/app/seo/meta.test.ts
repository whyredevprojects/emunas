/** Route titles from the W4.5 root loader data (W5.4 `meta.ts`). */
import { describe, expect, it } from "vitest";
import type { RootSeoData, SeoPage } from "./head.ts";
import { contentTitle, kindTitle, seoMeta, seoPageFor } from "./meta.ts";

function page(over: Partial<SeoPage>): SeoPage {
  return {
    path: "/en/c/emunah",
    kind: "concept",
    ui: "en",
    title: "אמונה",
    description: "d",
    titleLang: null,
    canonical: null,
    alternates: [],
    url: null,
    ...over,
  };
}

const root = (p: SeoPage | null): RootSeoData => ({ seo: { hosts: null, page: p } });
const args = (pathname: string, data: RootSeoData | undefined, ui = pathname.split("/")[1]) => ({
  params: { ui },
  location: { pathname },
  matches: [{ id: "root", loaderData: data }, { id: "shell/ui-layout" }, undefined],
});

describe("seoMeta", () => {
  it("titles a prerendered content page by its name", () => {
    expect(seoMeta("page.concept")(args("/en/c/emunah", root(page({}))))).toEqual([{ title: "אמונה · Emunas — Listen" }]);
    const shiur = page({ path: "/yi/s/x", kind: "shiur", ui: "yi", title: "דרוש — חלק א", titleLang: null });
    const [t] = seoMeta("page.shiur")(args("/yi/s/x/", root(shiur)));
    expect(t!.title.startsWith("דרוש — חלק א · ")).toBe(true);
    expect(t!.title.endsWith("אמונת — הערן")).toBe(true);
  });

  it("reads the deprecated `data` field too", () => {
    const m = [{ id: "root", data: root(page({})) }];
    expect(seoPageFor("/en/c/emunah", m)?.title).toBe("אמונה");
  });

  it("falls back to the page kind after client navigation, without data, and on non-content pages", () => {
    const meta = seoMeta("page.person");
    // Loader data made for another path (the first page loaded).
    expect(meta(args("/en/p/someone", root(page({}))))).toEqual([{ title: kindTitle("en", "page.person") }]);
    expect(meta(args("/yi/p/someone", undefined))).toEqual([{ title: kindTitle("yi", "page.person") }]);
    expect(meta(args("/xx/p/someone", undefined))).toEqual([{ title: kindTitle("en", "page.person") }]);
    // Today has page data, but its title is the site name: keep the kind title.
    const today = page({ path: "/en/", kind: "today", title: "Emunas" });
    expect(seoMeta("page.today")(args("/en/", root(today)))).toEqual([{ title: kindTitle("en", "page.today") }]);
    expect(contentTitle(page({ title: "  " }))).toBeNull();
  });

  it("clips a long name like og:title", () => {
    const long = page({ title: `${"word ".repeat(60)}end` });
    const t = contentTitle(long)!;
    expect(t.endsWith("… · Emunas — Listen")).toBe(true);
    expect(t.length).toBeLessThan(150);
  });
});
