import { describe, expect, it } from "vitest";
import {
  MAX_DYNAMIC_REDIRECTS,
  MAX_REDIRECT_LINE,
  MAX_STATIC_REDIRECTS,
  formatRedirects,
  formatRule,
  isDynamic,
  parseRedirects,
} from "../redirects-file.ts";

const rule = (i: number) => ({ from: `/en/people/old-${i}/`, to: `/en/people/new-${i}/`, status: 301 });

describe("_redirects parser and writer (Workers static assets limits)", () => {
  it("round-trips rules with comments and a fragment target", () => {
    const text = formatRedirects([rule(1), { from: "/yi/sources/x/", to: "/yi/sources/#x", status: 301 }], ["generated"]);
    expect(text.split("\n")[0]).toBe("# generated");
    expect(parseRedirects(text)).toEqual([rule(1), { from: "/yi/sources/x/", to: "/yi/sources/#x", status: 301 }]);
  });

  it("defaults the status to 302 like the platform", () => {
    expect(parseRedirects("/a/ /b/\n")[0]!.status).toBe(302);
  });

  it("allows exactly 2,000 static rules and refuses one more", () => {
    const max = Array.from({ length: MAX_STATIC_REDIRECTS }, (_, i) => rule(i));
    expect(parseRedirects(formatRedirects(max))).toHaveLength(MAX_STATIC_REDIRECTS);
    expect(() => formatRedirects([...max, rule(MAX_STATIC_REDIRECTS)])).toThrow(/static rules/);
  });

  it("counts splats and placeholders against the dynamic limit", () => {
    expect(isDynamic("/en/p/*")).toBe(true);
    expect(isDynamic("/en/p/:id/")).toBe(true);
    expect(isDynamic("/en/people/a:b/")).toBe(false);
    const dyn = Array.from({ length: MAX_DYNAMIC_REDIRECTS + 1 }, (_, i) => ({ from: `/d${i}/*`, to: "/", status: 301 }));
    expect(() => formatRedirects(dyn)).toThrow(/dynamic rules/);
  });

  it("refuses long lines, duplicate sources, bad paths and statuses", () => {
    expect(() => formatRule({ from: `/${"a".repeat(MAX_REDIRECT_LINE)}/`, to: "/", status: 301 })).toThrow(/longer than/);
    expect(() => parseRedirects("/a/ /b/ 301\n/a/ /c/ 301\n")).toThrow(/duplicate/);
    expect(() => parseRedirects("a/ /b/ 301\n")).toThrow(/start with \//);
    expect(() => parseRedirects("/a/#x /b/ 301\n")).toThrow(/bare path/);
    expect(() => parseRedirects("/a/ ftp://x 301\n")).toThrow(/target/);
    expect(() => parseRedirects("/a/ /b/ 418\n")).toThrow(/status/);
    expect(() => parseRedirects("/a/\n")).toThrow(/expected/);
  });
});
