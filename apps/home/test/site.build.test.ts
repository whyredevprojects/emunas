/**
 * The home site on a real build (`astro build` into a temporary directory, hosts from
 * EMUNAS_DOMAIN): every page ends with the dedication alone in its footer, is self-canonical on
 * the apex, follows the naming and CSP rules, and links only /files/ paths in the manifest.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT } from "@emunas/tokens";
import { DEDICATION } from "../src/components/dedication.ts";
import { checkFiles } from "../src/lib/check-files.ts";
import { ASIDES } from "../src/lib/content.ts";
import { ASIDE_LANGS, asideTexts } from "../src/lib/langs.ts";
import { SITEMAP_PATHS } from "../src/lib/seo.ts";
import { astroBuild } from "./astro-build.ts";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = join(app, "src", "data", "legacy-files.json");
const DOMAIN = "example.org";

let work = "";
let dist = "";

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "home-build-"));
  dist = join(work, "dist");
  const b = astroBuild(app, dist, { EMUNAS_DOMAIN: DOMAIN, EMUNAS_DEPLOY: "", CI: "" });
  if (b.status !== 0) throw new Error(`astro build failed:\n${b.stdout.slice(-4000)}\n${b.stderr.slice(-4000)}`);
}, 300_000);

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function htmlFiles(): string[] {
  return walk(dist)
    .filter((f) => f.endsWith(".html"))
    .map((f) => relative(dist, f).split(sep).join("/"))
    .sort();
}

const read = (f: string) => readFileSync(join(dist, f), "utf8");
const pathOf = (f: string) => (f === "index.html" ? "/" : `/${f.replace(/index\.html$/, "")}`);

describe("the built home site", () => {
  it("builds the expected pages", () => {
    expect(htmlFiles()).toEqual([
      "404.html",
      "about/index.html",
      "contact/index.html",
      "essays/index.html",
      "index.html",
      "sefarim/index.html",
      "weekly-devar-torah/index.html",
    ]);
  });

  it("ends every page's footer with the dedication, alone, in Hebrew", () => {
    const bad: string[] = [];
    for (const f of htmlFiles()) {
      const html = read(f);
      if (html.split(DEDICATION).length - 1 !== 1) bad.push(`${f}: not exactly once`);
      const footer = /<footer class="site-foot"[^>]*>([\s\S]*?)<\/footer>/u.exec(html)?.[1] ?? "";
      const last = /<p\b([^>]*)>([^<]*)<\/p>\s*$/u.exec(footer);
      if (!last || last[2] !== DEDICATION) bad.push(`${f}: not the footer's last line`);
      else if (!/lang="he"/.test(last[1] ?? "") || !/dir="rtl"/.test(last[1] ?? "")) bad.push(`${f}: not lang="he" dir="rtl"`);
      const after = html.slice(html.lastIndexOf("</footer>") + "</footer>".length).replace(/\s+/g, "");
      if (after !== "</body></html>") bad.push(`${f}: content after the footer`);
    }
    expect(bad).toEqual([]);
  });

  it("is self-canonical on the apex; 404 is noindex", () => {
    for (const f of htmlFiles()) {
      const html = read(f);
      if (f === "404.html") {
        expect(html).toContain('<meta name="robots" content="noindex">');
        expect(html).not.toContain('rel="canonical"');
        continue;
      }
      expect(html, f).toContain(`<link rel="canonical" href="https://${DOMAIN}${pathOf(f)}">`);
      expect(html, f).not.toContain('name="robots"');
      expect(html.match(/<h1\b/g), f).toHaveLength(1);
      expect(html, f).toMatch(/<meta name="description" content="[^"]{40,}">/);
    }
  });

  it("lists every page but 404 in the sitemap, and robots.txt names it", () => {
    const pages = htmlFiles().filter((f) => f !== "404.html").map(pathOf).sort();
    expect([...SITEMAP_PATHS].sort()).toEqual(pages);
    const xml = read("sitemap.xml");
    for (const p of pages) expect(xml).toContain(`<loc>https://${DOMAIN}${p}</loc>`);
    expect(read("robots.txt")).toContain(`Sitemap: https://${DOMAIN}/sitemap.xml`);
  });

  it("links Library and Analyze on their own subdomains", () => {
    const html = read("index.html");
    expect(html).toContain(`href="https://library.${DOMAIN}/en/"`);
    expect(html).toContain(`href="https://listen.${DOMAIN}/en/"`);
  });

  it("links every other edition of Library and Analyze, and shows each aside in every language", () => {
    const html = read("index.html");
    for (const lang of ASIDE_LANGS) {
      expect(html).toContain(`href="https://library.${DOMAIN}/${lang}/"`);
      expect(html).toContain(`href="https://listen.${DOMAIN}/${lang}/"`);
    }
    for (const a of [ASIDES.mashgiach, ASIDES.startHere, ASIDES.libraryName, ASIDES.analyzeName, ASIDES.archive]) {
      for (const x of asideTexts(a)) expect(html).toContain(`lang="${x.lang}" dir="${x.dir}">${x.text}<`);
    }
    const about = read("about/index.html");
    for (const x of asideTexts(ASIDES.about)) expect(about).toContain(`lang="${x.lang}" dir="${x.dir}">${x.text}<`);
  });

  it("puts the Library first and emphasized, Analyze second", () => {
    const html = read("index.html");
    expect(html).toMatch(/<a class="pill pill--ink" href="https:\/\/library\.[^"]+">Library /);
    expect(html).toMatch(/<a class="pill" href="https:\/\/listen\.[^"]+">Analyze /);
    expect(html).toMatch(/class="door door--library door--primary"[\s\S]*class="door door--listen"/);
  });

  it("follows the naming rules and never mentions transcripts", () => {
    for (const f of htmlFiles()) {
      const text = read(f).replace(/<[^>]+>/g, " ");
      expect(text, f).not.toMatch(/\bthe Ro?v\b|\bthe Rav\b|דער רב|shlit|שליט|transcri|\bASR\b|תמלול|תמליל/i);
    }
  });

  it("loads nothing from outside the site and has no inline styles or scripts but the theme init", () => {
    const init = `<script>${THEME_INIT_SCRIPT}</script>`;
    for (const f of htmlFiles()) {
      const html = read(f);
      expect(html, f).not.toMatch(/<link(?![^>]*rel="canonical")[^>]+href="https?:/);
      // Exactly one inline script, the colour-theme init, byte for byte (the CSP allows its hash),
      // in <head> before any stylesheet.
      expect(html.split(init).length - 1, f).toBe(1);
      expect(html.indexOf(init), f).toBeLessThan(html.indexOf('rel="stylesheet"'));
      expect(html.replace(init, ""), f).not.toMatch(/<script\b(?![^>]*\bsrc=)/);
      expect(html, f).not.toMatch(/<style\b/);
      expect(html, f).not.toMatch(/\sstyle=/);
      expect(html, f).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
    }
  });

  it("links only /files/ paths that are in the manifest, including every essay", () => {
    const r = checkFiles(dist, manifest);
    expect(r.missing).toEqual([]);
    const essays = read("essays/index.html");
    const manifestEssays = (JSON.parse(readFileSync(manifest, "utf8")) as { kind: string; path: string }[]).filter((x) => x.kind === "essay");
    for (const e of manifestEssays) expect(essays, e.path).toContain(`href="${e.path}"`);
  });
});

describe("checkFiles", () => {
  it("reports a /files/ link that is not in the manifest", () => {
    const d = join(work, "fake");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "index.html"), '<a href="/files/essays/noach.pdf">ok</a><a href="/files/essays/nope.pdf">bad</a>');
    expect(checkFiles(d, manifest).missing).toEqual(["/files/essays/nope.pdf (in index.html)"]);
  });

  it("fails when the manifest is missing", () => {
    expect(() => checkFiles(dist, join(work, "no-such.json"))).toThrow(/missing/);
  });
});
