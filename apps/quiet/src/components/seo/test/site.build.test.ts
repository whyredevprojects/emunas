/**
 * W4.6 acceptance on a real build (integration-plan §8 W4.6):
 *   corpus (today's data, into a temp dir) → astro build with production hosts → checks on dist:
 * - every edition page is self-canonical with the yi/en/x-default hreflang set and OG tags;
 * - each edition sitemap lists exactly the pages built for that edition, every shiur among them;
 *   the sitemap index and robots.txt name them;
 * - the About page exists in both editions with `#notes`, every page links to it, and it holds
 *   only headings, placeholder marks and the report address (no generated text);
 * - link checker over every page: internal links and anchors resolve, cross-site links to the
 *   listening app match the Live route table (apps/live/app/routes.ts) and map back to a built
 *   Quiet page through @emunas/links; the only other external links are the media host, Sefaria
 *   and the report address.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createLinks } from "@emunas/links";
import { buildCorpus } from "./corpus-build.ts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { astroBuild } from "../../../../test/astro-build.ts";
import { ABOUT_PARTS, ABOUT_STRINGS } from "../../../pages/[ed]/about/_strings.ts";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const repo = resolve(app, "../..");
const DOMAIN = "emunas.example";
const QUIET = `https://${DOMAIN}`;
const LIVE = `https://listen.${DOMAIN}`;
const MEDIA = "https://media.example.org";
const FEEDBACK = "errors@emunas.example";
const EDS = ["yi", "en"] as const;
const links = createLinks({ hosts: { quiet: QUIET, live: LIVE } });

let tmp = "";
let corpus = "";
let dist = "";

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "quiet-seo-"));
  corpus = join(tmp, "corpus");
  dist = join(tmp, "dist");
  buildCorpus(repo, corpus, MEDIA);
  const b = astroBuild(app, dist, {
    EMUNAS_CORPUS_DIR: corpus,
    EMUNAS_DOMAIN: DOMAIN,
    EMUNAS_FEEDBACK_EMAIL: FEEDBACK,
    // Never let a caller's own host settings leak into this build.
    EMUNAS_QUIET_ORIGIN: "",
    EMUNAS_LIVE_ORIGIN: "",
    EMUNAS_WORKERS_SUBDOMAIN: "",
    EMUNAS_STAGE: "",
    EMUNAS_SHELL_SAMPLE: "",
  });
  if (b.status !== 0) throw new Error(`astro build failed:\n${b.stdout.slice(-4000)}\n${b.stderr.slice(-4000)}`);
}, 300_000);

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

// ------------------------------------------------------------------ helpers

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Built HTML pages as root-relative paths (`/en/about/`) → file. */
function htmlPages(): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of walk(dist)) {
    if (!f.endsWith(`${sep}index.html`)) continue;
    const rel = relative(dist, dirname(f)).split(sep).map(encodeURIComponent).join("/");
    out.set(rel === "" ? "/" : `/${rel}/`, f);
  }
  return out;
}

let pagesCache: Map<string, string> | undefined;
const pages = () => (pagesCache ??= htmlPages());
const html = (path: string): string => readFileSync(pages().get(path) ?? join(dist, path, "index.html"), "utf8");
const head = (h: string): string => h.slice(h.indexOf("<head>"), h.indexOf("</head>"));
const mainOf = (h: string): string => h.slice(h.indexOf("<main"), h.indexOf("</main>") + 7);
const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]?.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const tags = (h: string, name: string): string[] => [...h.matchAll(new RegExp(`<${name}\\s[^>]*>`, "g"))].map((m) => m[0]);
const editionOf = (p: string) => /^\/(yi|en)\//.exec(p)?.[1] as "yi" | "en" | undefined;
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));

const idCache = new Map<string, Set<string>>();
function idsOf(path: string): Set<string> {
  let ids = idCache.get(path);
  if (!ids) {
    ids = new Set([...html(path).matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]!));
    idCache.set(path, ids);
  }
  return ids;
}

/** The Live route table as path regexes (`:param` = one segment; the `*` not-found route is left out). */
function liveRoutes(): RegExp[] {
  const text = readFileSync(join(repo, "apps/live/app/routes.ts"), "utf8");
  const children = text.slice(text.indexOf("UI_CHILD_ROUTES"), text.indexOf("export default"));
  const toRe = (pattern: string) => pattern.split("/").map((s) => (s.startsWith(":") ? "[^/?#]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/");
  const out: RegExp[] = [/^\/$/, /^\/(?:en|yi)\/$/];
  for (const m of children.matchAll(/route\("([^"]+)"/g)) {
    if (m[1] === "*") continue;
    out.push(new RegExp(`^/(?:en|yi)/${toRe(m[1]!)}$`));
  }
  expect(out.length, "live route table parsed").toBeGreaterThan(10);
  return out;
}

// ------------------------------------------------------------------ head tags

describe("head tags on every page", () => {
  it("are self-canonical with hreflang yi/en/x-default and OG title, description and url", () => {
    const bad: string[] = [];
    let n = 0;
    for (const [path] of pages()) {
      const h = head(html(path));
      const ed = editionOf(path);
      if (ed === undefined && path !== "/") continue;
      if (/\/(?:shell-sample)\//.test(path)) continue;
      n++;
      const canonical = tags(h, "link").filter((t) => attr(t, "rel") === "canonical");
      if (canonical.length !== 1 || attr(canonical[0]!, "href") !== QUIET + path) bad.push(`${path}: canonical`);
      const alt = tags(h, "link")
        .filter((t) => attr(t, "rel") === "alternate")
        .map((t) => `${attr(t, "hreflang")} ${attr(t, "href")}`);
      const rest = path === "/" ? "/" : path.slice(3);
      const want = [`yi ${QUIET}/yi${rest}`, `en ${QUIET}/en${rest}`, `x-default ${QUIET}/`];
      if (JSON.stringify(alt) !== JSON.stringify(want)) bad.push(`${path}: hreflang ${JSON.stringify(alt)}`);
      const og = new Map(tags(h, "meta").filter((t) => attr(t, "property")).map((t) => [attr(t, "property")!, attr(t, "content") ?? ""]));
      for (const p of ["og:title", "og:description", "og:site_name"]) if (!og.get(p)?.trim()) bad.push(`${path}: ${p}`);
      if (og.get("og:url") !== QUIET + path) bad.push(`${path}: og:url`);
      if (/name="robots"/.test(h)) bad.push(`${path}: robots meta on an indexable page`);
    }
    expect(bad.slice(0, 20)).toEqual([]);
    expect(n).toBeGreaterThan(4000);
  });

  it("take the shiur page's OG title from the catalog and description from the one-liner", () => {
    const index = JSON.parse(readFileSync(join(corpus, "index.json"), "utf8")) as {
      shiurim: { id: string; status: string; catalog: { titleOriginal: string } }[];
    };
    const full = index.shiurim.find((s) => s.status === "full")!;
    const shiur = JSON.parse(readFileSync(join(corpus, "shiurim", `${full.id}.json`), "utf8")) as {
      notes: { summary: { oneLiner: { en: string; yi: string } } };
    };
    for (const ed of EDS) {
      const h = head(html(`/${ed}/shiur/${full.id}/`));
      const og = new Map(tags(h, "meta").filter((t) => attr(t, "property")).map((t) => [attr(t, "property")!, attr(t, "content") ?? ""]));
      expect(og.get("og:title")).toBe(full.catalog.titleOriginal);
      expect(og.get("og:description")).toBe(shiur.notes.summary.oneLiner[ed]);
      expect(og.get("og:type")).toBe("article");
    }
  });
});

// ------------------------------------------------------------------ sitemaps, robots

describe("sitemaps and robots.txt", () => {
  it("list exactly the pages built in each edition, every shiur among them", () => {
    const index = JSON.parse(readFileSync(join(corpus, "index.json"), "utf8")) as { shiurim: { id: string }[] };
    expect(index.shiurim.length).toBeGreaterThan(900);
    for (const ed of EDS) {
      const xml = readFileSync(join(dist, `sitemap-${ed}.xml`), "utf8");
      const listed = locs(xml);
      expect(new Set(listed).size, "no duplicates").toBe(listed.length);
      const built = [...pages().keys()].filter((p) => editionOf(p) === ed && !p.includes("/shell-sample/")).map((p) => QUIET + p);
      expect([...listed].sort()).toEqual(built.sort());
      const set = new Set(listed);
      for (const s of index.shiurim) expect(set.has(`${QUIET}/${ed}/shiur/${encodeURIComponent(s.id)}/`), s.id).toBe(true);
      expect(set.has(`${QUIET}/${ed}/about/`)).toBe(true);
      expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    }
  });

  it("are named by the sitemap index and robots.txt", () => {
    expect(locs(readFileSync(join(dist, "sitemap-index.xml"), "utf8"))).toEqual([`${QUIET}/sitemap-yi.xml`, `${QUIET}/sitemap-en.xml`]);
    const robots = readFileSync(join(dist, "robots.txt"), "utf8");
    expect(robots).toContain("User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\n");
    expect(robots).toContain(`Sitemap: ${QUIET}/sitemap-index.xml`);
  });
});

// ------------------------------------------------------------------ About

describe("About", () => {
  it("exists in both editions with the notes anchor and every part", () => {
    for (const ed of EDS) {
      const ids = idsOf(`/${ed}/about/`);
      for (const p of ABOUT_PARTS) expect(ids.has(p), `${ed} #${p}`).toBe(true);
      expect(ids.has("notes")).toBe(true);
    }
  });

  it("is linked from every page", () => {
    const missing: string[] = [];
    for (const [path] of pages()) {
      const h = html(path);
      const eds = editionOf(path) ? [editionOf(path)!] : EDS;
      for (const ed of eds) if (!h.includes(`href="/${ed}/about/"`)) missing.push(`${path} → /${ed}/about/`);
    }
    expect(missing.slice(0, 20)).toEqual([]);
  });

  it("holds no generated text: only headings, placeholder marks and the report address", () => {
    for (const ed of EDS) {
      const s = ABOUT_STRINGS[ed];
      const main = mainOf(html(`/${ed}/about/`));
      const text = main
        .replace(/<[^>]+>/g, "\n")
        .split("\n")
        .map((l) => l.replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim())
        .filter((l) => l !== "");
      const allowed = new Set([
        s.title,
        ...Object.values(s.headings),
        `${s.placeholderLabel}:`,
        s.placeholder,
        s.reportAddress,
        FEEDBACK,
      ]);
      expect(text.filter((l) => !allowed.has(l))).toEqual([]);
      expect(main).toContain(`href="mailto:${FEEDBACK}"`);
      expect(main.match(/data-placeholder=/g)).toHaveLength(ABOUT_PARTS.length);
    }
  });
});

// ------------------------------------------------------------------ link checker

describe("link checker", () => {
  it("every link resolves: internal pages and anchors, Live routes, and only known external hosts", () => {
    const live = liveRoutes();
    const broken: string[] = [];
    let internal = 0;
    let crossSite = 0;
    const exists = (path: string): boolean => {
      if (pages().has(path)) return true;
      let decoded: string;
      try {
        decoded = decodeURIComponent(path);
      } catch {
        return false;
      }
      return existsSync(join(dist, decoded)) && statSync(join(dist, decoded)).isFile();
    };
    for (const [page] of pages()) {
      const h = html(page);
      const hrefs = [...tags(h, "a"), ...tags(h, "link")].map((t) => attr(t, "href")).filter((x): x is string => x !== undefined);
      for (const href of hrefs) {
        const bad = (why: string) => broken.push(`${page} → ${href}: ${why}`);
        if (href.startsWith("mailto:")) {
          if (!href.startsWith(`mailto:${FEEDBACK}`)) bad("unexpected mail address");
          continue;
        }
        if (href.startsWith(`${LIVE}/`)) {
          crossSite++;
          const path = href.slice(LIVE.length).replace(/[?#].*$/, "");
          if (!live.some((re) => re.test(path))) bad("no such Live route");
          const back = links.equivalent(href);
          if (back === null || !back.startsWith(`${QUIET}/`)) bad("does not map back to Quiet");
          else if (!exists(back.slice(QUIET.length).replace(/[?#].*$/, ""))) bad(`maps back to a missing page ${back}`);
          continue;
        }
        if (href.startsWith(`${MEDIA}/`) || /^https:\/\/(?:www\.)?sefaria\.org\//.test(href)) continue;
        let local = href;
        if (href.startsWith(`${QUIET}/`)) local = href.slice(QUIET.length);
        else if (/^[a-z]+:/i.test(href) || href.startsWith("//")) {
          bad("unexpected external link");
          continue;
        }
        if (local.startsWith("#")) local = page + local;
        if (!local.startsWith("/")) {
          bad("relative link");
          continue;
        }
        internal++;
        const [pathQ, frag] = local.split("#") as [string, string | undefined];
        const path = pathQ.replace(/\?.*$/, "");
        if (!exists(path)) {
          bad("no such page or file");
          continue;
        }
        if (frag === undefined || frag === "" || /^t=\d+(?:\.\d+)?$/.test(frag)) continue;
        if (!pages().has(path) || !idsOf(path).has(decodeURIComponent(frag))) bad("no such anchor");
      }
    }
    expect(broken.slice(0, 30)).toEqual([]);
    expect(internal).toBeGreaterThan(100_000);
    expect(crossSite).toBeGreaterThan(900);
  }, 120_000);
});
