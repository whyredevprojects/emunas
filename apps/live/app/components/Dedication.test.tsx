/**
 * The dedication (corpus-wave-plan F.3): exact text, Hebrew RTL, the last line of its footer, once
 * per document. Every built HTML file is checked by the post-build step (`app/seo/check.server.ts`,
 * run from `buildEnd`), so a build whose pages lack it, or carry it twice, fails.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEDICATION, DEDICATION_CLASSES, Dedication } from "./Dedication.tsx";
import { dedicationProblems } from "./dedication-text.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("Dedication", () => {
  it("has the owner's exact text", () => {
    expect(DEDICATION).toBe("לעילוי נשמת אשר בן ישראל");
  });

  it("renders one Hebrew RTL line as the whole footer, with no link, image or icon", () => {
    const html = renderToStaticMarkup(createElement(Dedication));
    expect(dedicationProblems(`<html><body><main></main>${html}</body></html>`)).toEqual([]);
    expect(html).toMatch(/^<footer\b[^>]*><p\b[^>]*>[^<]+<\/p><\/footer>$/u);
    expect(html).not.toMatch(/<(a|img|svg|hr)\b/u);
  });

  it("is rendered once by the root layout, after the page and before the scripts", () => {
    const root = readFileSync(join(here, "..", "root.tsx"), "utf8");
    expect(root.match(/<Dedication \/>/gu)).toHaveLength(1);
    const layout = root.slice(root.indexOf("export function Layout"), root.indexOf("export default function App"));
    expect(layout).toMatch(/\{children\}\s*<Dedication \/>\s*<ScrollRestoration \/>/u);
  });

  it("lists exactly the classes of its stylesheet, and the stylesheet adds no border", () => {
    const css = readFileSync(join(here, "Dedication.module.css"), "utf8");
    const declared = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/gu)].map((m) => m[1]));
    expect([...declared].sort()).toEqual([...DEDICATION_CLASSES].sort());
    expect(css.replace(/\/\*[\s\S]*?\*\//gu, "")).not.toMatch(/\bborder\b/u);
  });
});

describe("dedicationProblems", () => {
  const line = `<p dir="rtl" lang="he">${DEDICATION}</p>`;
  it("accepts the line at the end of a footer, also after other footer lines", () => {
    expect(dedicationProblems(`<footer>${line}</footer>`)).toEqual([]);
    expect(dedicationProblems(`<footer class="x"><p>About</p> ${line} </footer>`)).toEqual([]);
  });

  it("flags a missing, doubled, misplaced or unmarked line", () => {
    expect(dedicationProblems("<footer><p>x</p></footer>")).toEqual(["no dedication line"]);
    expect(dedicationProblems(`<footer>${line}</footer><footer>${line}</footer>`)).toEqual(["the dedication appears 2 times"]);
    expect(dedicationProblems(`<main>${line}</main>`)).toEqual(["the dedication is not the last line of a <footer>"]);
    expect(dedicationProblems(`<footer>${line}<p>x</p></footer>`)).toEqual(["the dedication is not the last line of a <footer>"]);
    expect(dedicationProblems(`<footer><p lang="he">${DEDICATION}</p></footer>`)).toEqual(['the dedication is not marked dir="rtl"']);
  });
});
