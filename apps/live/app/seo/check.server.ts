/**
 * Post-build SEO step and checks over `build/client` (W4.5 acceptance), run from `buildEnd` in
 * `react-router.config.ts`:
 *
 * - writes `robots.txt`;
 * - removes the `.data` files React Router writes next to each prerendered page because the root
 *   route has a `loader` (it never revalidates under `ssr: false`, so nothing requests them); refused
 *   when any other route module exports a server `loader`;
 * - checks every prerendered page: canonical on the Quiet origin (never `listen.*`), OG title and
 *   description on content pages, a `<title>` carrying the page's own name on content pages (W5.4),
 *   `noindex` on app-only pages and on the SPA fallback;
 * - checks the static file budget (≤ 18,000 files, tech-live §3.3).
 */
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { LIVE_SUBDOMAIN, hostOf, type Hosts } from "@emunas/links";
import { TITLE_SEPARATOR } from "./meta.ts";
import { APP_ONLY_KINDS, classifyLivePath, isIndexable, normalizeLivePath } from "./policy.ts";
import { ROBOTS_TXT } from "./robots.ts";

export const MAX_CLIENT_FILES = 18_000;
/** Cloudflare's SPA `not_found_handling` serves this file for every path without an asset. */
export const SPA_FALLBACK_FILE = "index.html";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const rel = (root: string, p: string) => relative(root, p).split(sep).join("/");

// ------------------------------------------------------------------ head parsing

export interface ParsedHead {
  canonical: string[];
  robots: string[];
  meta: Map<string, string>;
  alternates: { hrefLang: string; href: string }[];
  /** Text of the first `<title>`, entities decoded; null when there is none. */
  title: string | null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/gu, '"')
    .replace(/&#x27;|&#39;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&");
}

function attrs(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of tag.matchAll(/([a-zA-Z][\w:-]*)="([^"]*)"/gu)) out.set(m[1]!.toLowerCase(), decodeEntities(m[2]!));
  return out;
}

/** Reads the SEO-relevant tags of an HTML document's `<head>`. */
export function parseHead(html: string): ParsedHead {
  const end = html.indexOf("</head>");
  const head = end === -1 ? html : html.slice(0, end);
  const titleMatch = /<title>([^<]*)<\/title>/u.exec(head);
  const out: ParsedHead = {
    canonical: [],
    robots: [],
    meta: new Map(),
    alternates: [],
    title: titleMatch ? decodeEntities(titleMatch[1]!) : null,
  };
  for (const m of head.matchAll(/<(meta|link)\b[^>]*>/gu)) {
    const a = attrs(m[0]);
    if (m[1] === "link") {
      const relAttr = a.get("rel");
      const href = a.get("href");
      if (href === undefined) continue;
      if (relAttr === "canonical") out.canonical.push(href);
      else if (relAttr === "alternate" && a.has("hreflang")) out.alternates.push({ hrefLang: a.get("hreflang")!, href });
      continue;
    }
    const content = a.get("content");
    if (content === undefined) continue;
    const name = a.get("name") ?? a.get("property");
    if (name === undefined) continue;
    if (name === "robots") out.robots.push(content);
    else out.meta.set(name, content);
  }
  return out;
}

// ------------------------------------------------------------------ checks

export interface SeoFinding {
  file: string;
  problem: string;
}

/**
 * The page path a prerendered file stands for: `en/index.html` → `/en/`, `en/s/x.html` → `/en/s/x`
 * (also `en/s/x/index.html`, before `flattenPages`).
 */
export function pagePathOf(file: string): string {
  return normalizeLivePath(`/${file.replace(/(^|\/)index\.html$/u, "").replace(/\.html$/u, "")}`);
}

/**
 * Moves every prerendered page except the UI homes from `<path>/index.html` to `<path>.html`. Live
 * page URLs have no trailing slash (`/en/s/x`, integration-plan §2.2); with Cloudflare's default
 * `html_handling: "auto-trailing-slash"`, `/en/s/x` is then served from `en/s/x.html` directly
 * instead of being redirected to `/en/s/x/`. The UI homes (`/en/`, `/yi/`) keep `index.html`.
 */
export function flattenPages(clientDir: string): number {
  let moved = 0;
  for (const p of walk(clientDir)) {
    const file = rel(clientDir, p);
    if (!file.endsWith("/index.html") || file.startsWith("data/")) continue;
    if (pagePathOf(file).endsWith("/")) continue; // `/en/`, `/yi/`
    const dir = dirname(p);
    const target = `${dir}.html`;
    if (existsSync(target)) continue;
    renameSync(p, target);
    if (readdirSync(dir).length === 0) rmdirSync(dir);
    moved++;
  }
  return moved;
}

/** Checks one prerendered page. `hosts` null: canonical/hreflang are not required (no hosts configured). */
export function checkPage(file: string, html: string, hosts: Hosts | null): SeoFinding[] {
  const f: SeoFinding[] = [];
  const bad = (problem: string) => f.push({ file, problem });
  const head = parseHead(html);
  const kind = classifyLivePath(pagePathOf(file)).kind;
  const noindex = head.robots.some((r) => /\bnoindex\b/u.test(r));

  if (head.canonical.length > 1) bad("more than one canonical link");
  for (const c of head.canonical) {
    if (hostOf(c.replace(/^(https?:\/\/[^/]+).*$/u, "$1")).startsWith(`${LIVE_SUBDOMAIN}.`)) {
      bad(`canonical points at a ${LIVE_SUBDOMAIN}.* host: ${c}`);
    }
    if (hosts && !c.startsWith(`${hosts.quiet}/`)) bad(`canonical is not on the Quiet origin ${hosts.quiet}: ${c}`);
    if (c.includes("#")) bad(`canonical has a fragment: ${c}`);
  }
  if (hosts && head.canonical.length === 0) bad("no canonical link");
  if (APP_ONLY_KINDS.has(kind) && !noindex) bad(`app-only page (${kind}) without noindex`);
  if (isIndexable(kind)) {
    if (noindex) bad(`content page (${kind}) is noindex`);
    const ogTitle = head.meta.get("og:title");
    if (!ogTitle) bad("no og:title");
    else if (!head.title?.startsWith(`${ogTitle}${TITLE_SEPARATOR}`)) bad("<title> does not carry the page's name (og:title)");
    if (!head.meta.get("og:description")) bad("no og:description");
    if (!head.meta.get("description")) bad("no meta description");
    if (hosts && head.alternates.length === 0) bad("no hreflang alternates");
  } else if (kind === "today") {
    if (!head.meta.get("og:title")) bad("no og:title");
  } else if (!noindex && !APP_ONLY_KINDS.has(kind)) {
    bad(`page of kind ${kind} without noindex`);
  }
  return f;
}

/** The SPA fallback is served for every unknown path: it must be `noindex` and carry no canonical. */
export function checkFallback(html: string): SeoFinding[] {
  const head = parseHead(html);
  const f: SeoFinding[] = [];
  if (!head.robots.some((r) => /\bnoindex\b/u.test(r))) f.push({ file: SPA_FALLBACK_FILE, problem: "SPA fallback without noindex" });
  if (head.canonical.length) f.push({ file: SPA_FALLBACK_FILE, problem: "SPA fallback carries a canonical link" });
  if (head.alternates.length) f.push({ file: SPA_FALLBACK_FILE, problem: "SPA fallback carries hreflang links" });
  return f;
}

// ------------------------------------------------------------------ server loaders

/** True when a route module source exports a server `loader` (root's comes from `app/seo`). */
export function exportsServerLoader(source: string): boolean {
  return (
    /export\s+(async\s+)?function\s+loader\b/u.test(source) ||
    /export\s+(const|let|var)\s+loader\b/u.test(source) ||
    /export\s*\{[^}]*\bloader\b(?!\s*as)[^}]*\}/u.test(source) ||
    /export\s*\{[^}]*\bas\s+loader\b[^}]*\}/u.test(source)
  );
}

// ------------------------------------------------------------------ the post-build step

export interface PostBuildOptions {
  clientDir: string;
  hosts: Hosts | null;
  /** Route module files other than root (absolute paths), to refuse `.data` removal when one has a loader. */
  routeFiles: readonly string[];
  maxFiles?: number;
}

export interface PostBuildResult {
  pages: number;
  removedDataFiles: number;
  /** Pages moved from `x/index.html` to `x.html`. */
  flattened: number;
  files: number;
  findings: SeoFinding[];
  /** Reported, not failing. */
  warnings: SeoFinding[];
}

export function postBuild(opts: PostBuildOptions): PostBuildResult {
  const { clientDir } = opts;
  const findings: SeoFinding[] = [];
  const warnings: SeoFinding[] = [];
  writeFileSync(join(clientDir, "robots.txt"), ROBOTS_TXT);

  const withLoader = opts.routeFiles.filter((f) => existsSync(f) && exportsServerLoader(readFileSync(f, "utf8")));
  let removedDataFiles = 0;
  if (withLoader.length === 0) {
    for (const p of walk(clientDir)) {
      if (p.endsWith(".data")) {
        rmSync(p);
        removedDataFiles++;
      }
    }
  } else {
    for (const f of withLoader) {
      warnings.push({ file: f, problem: "route exports a server loader: prerendered .data files are kept" });
    }
  }

  const flattened = flattenPages(clientDir);

  let pages = 0;
  const all = walk(clientDir);
  for (const p of all) {
    const file = rel(clientDir, p);
    if (!file.endsWith(".html") || file.startsWith("data/")) continue;
    const html = readFileSync(p, "utf8");
    if (file === SPA_FALLBACK_FILE) {
      findings.push(...checkFallback(html));
      continue;
    }
    pages++;
    findings.push(...checkPage(file, html, opts.hosts));
  }
  const max = opts.maxFiles ?? MAX_CLIENT_FILES;
  if (all.length > max) findings.push({ file: ".", problem: `${all.length} files in build/client, budget ${max}` });
  return { pages, removedDataFiles, flattened, files: all.length, findings, warnings };
}
