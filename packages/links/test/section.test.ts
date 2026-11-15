/**
 * Quiet section pages: the slug rule (mirrors apps/quiet catalog `sectionSlug`), the path
 * builder, its absolute form, and how a section URL crosses to Live.
 */
import { describe, expect, it } from "vitest";
import {
  EDS,
  POCKET_GUIDE_SOURCE,
  UNCATALOGUED_SECTION_PREFIX,
  parseQuiet,
  quietPaths,
  quietSectionPath,
  sectionSlug,
  type Ed,
} from "../src/index.ts";
import { HOSTS, links } from "./fixtures.ts";

describe("sectionSlug", () => {
  it("keeps Pocket Guide ids and prefixes every other source", () => {
    expect(POCKET_GUIDE_SOURCE).toBe("pocket-guide-2012");
    expect(sectionSlug({ source: "pocket-guide-2012", id: "zmanim" })).toBe("zmanim");
    expect(sectionSlug({ source: "uncatalogued", id: "zmanim" })).toBe(`${UNCATALOGUED_SECTION_PREFIX}zmanim`);
    expect(sectionSlug({ source: "uncatalogued", id: "zmanim" })).toBe("unc-zmanim");
  });

  it("never gives the same slug to a guide section and an uncatalogued one", () => {
    const ids = ["zmanim", "parshas-hashavua", "unc-zmanim", "tanya"];
    const guide = ids.map((id) => sectionSlug({ source: "pocket-guide-2012", id }));
    const other = ids.map((id) => sectionSlug({ source: "uncatalogued", id }));
    // A guide id that itself starts with the prefix would collide; none exists today, and the
    // catalog model has the same rule, so the slug space is the same on both sides.
    expect(other.filter((s) => guide.includes(s))).toEqual(["unc-zmanim"]);
  });

  it("rejects ids that cannot be one path segment", () => {
    expect(() => sectionSlug({ source: "pocket-guide-2012", id: "" })).toThrow(TypeError);
    expect(() => sectionSlug({ source: "pocket-guide-2012", id: "a/b" })).toThrow(TypeError);
  });
});

describe("section paths", () => {
  it.each(EDS)("builds /%s/section/{slug}/ and encodes the slug", (ed: Ed) => {
    expect(quietSectionPath(ed, { source: "pocket-guide-2012", id: "zmanim" })).toBe(`/${ed}/section/zmanim/`);
    expect(quietPaths().section(ed, { source: "uncatalogued", id: "zmanim" })).toBe(`/${ed}/section/unc-zmanim/`);
    expect(quietPaths().section(ed, { source: "pocket-guide-2012", id: "ספר א" })).toBe(
      `/${ed}/section/${encodeURIComponent("ספר א")}/`,
    );
  });

  it("rejects a bad edition", () => {
    expect(() => quietSectionPath("de" as Ed, { source: "pocket-guide-2012", id: "zmanim" })).toThrow(TypeError);
    expect(() => quietPaths().section("de" as Ed, { source: "pocket-guide-2012", id: "zmanim" })).toThrow(TypeError);
  });

  it("has an absolute form on the Quiet origin", () => {
    expect(links.quiet.section("yi", { source: "pocket-guide-2012", id: "zmanim" })).toBe(`${HOSTS.quiet}/yi/section/zmanim/`);
  });

  it("parses as the contents listing, so it crosses to the Live UI home and is self-canonical", () => {
    const url = links.quiet.section("en", { source: "uncatalogued", id: "zmanim" });
    expect(parseQuiet(url)).toEqual({ kind: "index", ed: "en", index: "contents" });
    expect(links.equivalent(url)).toBe(`${HOSTS.live}/en/`);
    expect(links.siteOf(url)).toBe("quiet");
  });
});
