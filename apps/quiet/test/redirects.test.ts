/**
 * C1.8 acceptance for the Quiet legacy redirects (corpus-wave-plan §5, D12) on the mini corpus:
 *   corpus build (layer included) → astro build → scripts/redirects.ts (CLI) → checks on dist.
 *
 * - every old address resolves to exactly one target, in one hop: its page is still built, or one
 *   `_redirects` rule, or one stub page; the target exists in dist or is an index page;
 * - `_redirects` passes the platform limits (≤ 2,000 static rules, line length) and the cap;
 * - stubs are noindex, with rel=canonical to the target, meta refresh 0 and a visible link;
 * - the same with the old pages gone (as after C2 replaces them), through the planner;
 * - the series page carries no link pairing it with the other language.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCorpusWithAggregates } from "@emunas/corpus/build/aggregate";
import { legacyPaths } from "@emunas/links";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findLayerDir, loadQuietLayer, type QuietLayer } from "../src/components/corpus/layer.ts";
import { MAX_REDIRECT_LINE, MAX_STATIC_REDIRECTS, parseRedirects, type RedirectRule } from "../worker/redirects-file.ts";
import {
  DEFAULT_MAX_RULES,
  STUB_MARK,
  distExists,
  entityWeights,
  legacyWeights,
  pageFile,
  planRedirects,
  readMaxRules,
  stubHtml,
  type PlannedRedirect,
} from "../scripts/redirects.ts";
import { astroBuild } from "./astro-build.ts";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(app, "../..");
const corpusPkg = join(repo, "packages/corpus");
const MINI_POLICY = join(corpusPkg, "test/fixtures/mini/site-policy");
const QUIET = "https://quiet.example.org";
const CAP = 3;

let work = "";
let corpus = "";
let dist = "";
let layer: QuietLayer;
let rules: RedirectRule[] = [];
let cliOut = "";

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "quiet-redirects-"));
  corpus = join(work, "corpus");
  dist = join(work, "dist");
  buildCorpusWithAggregates({
    dataDir: join(corpusPkg, "test/fixtures/mini/data"),
    policyDir: MINI_POLICY,
    outDir: corpus,
    mediaOrigin: "https://media.example.org",
    dataSha: null,
  });
  const b = astroBuild(app, dist, { EMUNAS_CORPUS_DIR: corpus, EMUNAS_QUIET_ORIGIN: QUIET, EMUNAS_LIVE_ORIGIN: "https://listen.quiet.example.org" });
  if (b.status !== 0) throw new Error(`astro build failed:\n${b.stdout}\n${b.stderr}`);
  const tsx = join(repo, "node_modules", ".bin", "tsx");
  const r = spawnSync(
    tsx,
    [join(app, "scripts", "redirects.ts"), "--dist", dist, "--corpus", corpus, "--policy-dir", MINI_POLICY, "--max-rules", String(CAP)],
    { cwd: app, env: { ...process.env, EMUNAS_QUIET_ORIGIN: QUIET, EMUNAS_LIVE_ORIGIN: "https://listen.quiet.example.org" }, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`redirects failed:\n${r.stdout}\n${r.stderr}`);
  cliOut = r.stdout;
  layer = loadQuietLayer(findLayerDir(corpus));
  rules = parseRedirects(readFileSync(join(dist, "_redirects"), "utf8"));
}, 300_000);

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

/** Every page path in dist (`/en/x/` for `en/x/index.html`), stubs included. */
function pagePaths(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f === "index.html") out.push(`/${relative(root, d).split(sep).join("/")}/`.replace(/^\/\/$/, "/"));
    }
  };
  walk(root);
  return out;
}

const bare = (to: string) => to.replace(/#.*$/, "");
const isIndexPage = (p: string) => /^\/(?:yi|en)\/(?:(?:inyanim|erachim|people|sources|stories)\/)?$/.test(p);
const encodePath = (p: string) => p.split("/").map((s) => encodeURIComponent(s)).join("/");

function stubAt(path: string): string | null {
  const f = pageFile(dist, path);
  if (f === null || !existsSync(f)) return null;
  const html = readFileSync(f, "utf8");
  return html.includes(STUB_MARK) ? html : null;
}

function targetOfStub(html: string): string {
  return /<meta http-equiv="refresh" content="0; url=([^"]+)">/.exec(html)![1]!.replace(/&amp;/g, "&");
}

/** Old Quiet addresses of every legacy key that had a page, and of every retired corpus id. */
function oldPaths(): string[] {
  const out = new Set<string>();
  for (const row of layer.redirects.legacy) {
    if (row.hadPage.quiet !== true) continue;
    for (const p of legacyPaths("quiet", row.kind, row.oldKey, layer.links)) out.add(p.path);
  }
  const dirs: Record<string, string | null> = { topics: "inyanim", concepts: "erachim", people: "people", works: "sources", stories: "stories", threads: null };
  for (const [kind, map] of Object.entries(layer.redirects.corpus)) {
    const dir = dirs[kind];
    if (!dir) continue;
    for (const from of Object.keys(map)) for (const ed of ["yi", "en"]) out.add(`/${ed}/${dir}/${encodeURIComponent(from)}/`);
  }
  return [...out].sort();
}

describe("dist/_redirects and stubs on the mini corpus", () => {
  it("prints the rule and stub counts", () => {
    expect(cliOut).toMatch(/\d+ rules in _redirects \(cap 3\), \d+ stub pages, \d+ old paths skipped/);
  });

  it("passes the platform limits and the cap", () => {
    expect(rules.length).toBeLessThanOrEqual(Math.min(CAP, MAX_STATIC_REDIRECTS));
    expect(rules.length).toBe(CAP);
    for (const r of rules) {
      expect(r.status).toBe(301);
      expect(`${r.from} ${r.to} ${r.status}`.length).toBeLessThanOrEqual(MAX_REDIRECT_LINE);
    }
  });

  it("resolves every old address to exactly one target that exists or is an index page, in one hop", () => {
    const paths = oldPaths();
    expect(paths.length).toBeGreaterThan(100);
    const exists = distExists(dist);
    const sources = new Set(rules.map((r) => r.from));
    let redirected = 0;
    for (const p of paths) {
      const rule = rules.filter((r) => r.from === p);
      const stub = stubAt(p);
      const live = exists(p);
      expect([rule.length > 0, stub !== null, live].filter(Boolean), p).toHaveLength(1);
      expect(rule.length, p).toBeLessThanOrEqual(1);
      if (live) continue;
      redirected++;
      const to = rule[0]?.to ?? targetOfStub(stub!);
      expect(exists(bare(to)) || isIndexPage(bare(to)), `${p} → ${to}`).toBe(true);
      expect(sources.has(bare(to)), `${p} → ${to} is itself redirected`).toBe(false);
      expect(stubAt(bare(to)), `${p} → ${to} is a stub`).toBeNull();
    }
    // The retired story ids redirect in both editions (rules or stubs).
    expect(redirected).toBeGreaterThanOrEqual(2);
    expect(paths).toContain("/en/stories/the-sanzer-rav-and-the-business-competitor/");
  });

  it("writes stubs beyond the cap: noindex, canonical to the target, refresh 0, a visible link", () => {
    const stubs = pagePaths(dist).filter((p) => stubAt(p) !== null);
    expect(stubs.length).toBeGreaterThan(0);
    for (const p of stubs) {
      const html = stubAt(p)!;
      const to = targetOfStub(html);
      expect(html).toContain('<meta name="robots" content="noindex">');
      expect(html).toContain(`<link rel="canonical" href="${QUIET}${bare(to)}">`);
      expect(html).toMatch(/<a href="[^"]+">/);
      expect(html).toContain(`href="${to.replace(/&/g, "&amp;")}"`);
      expect(html).not.toMatch(/<script|style=/);
      expect(sourcesOf(rules)).not.toContain(p);
    }
  });

  it("keeps the old pages that are still built (nothing redirects away from a live page)", () => {
    const exists = distExists(dist);
    for (const r of rules) expect(exists(r.from), r.from).toBe(false);
    expect(cliOut).toMatch(/[1-9]\d* old paths skipped/);
  });
});

const sourcesOf = (rs: readonly RedirectRule[]) => rs.map((r) => r.from);

describe("the planner with the old pages gone (as after the C2 entry pages replace them)", () => {
  it("maps every old address once, to a built page or an index page, most-cited first", () => {
    const old = new Set(oldPaths());
    const built = new Set(pagePaths(dist).filter((p) => stubAt(p) === null && !old.has(p)));
    const exists = (p: string) => built.has(p) || built.has(encodePath(decodeURIComponent(p)));
    const plan = planRedirects({
      redirects: layer.redirects,
      links: layer.links,
      exists,
      legacyWeight: legacyWeights(corpus),
      entityWeight: entityWeights(layer),
      maxRules: 50,
    });
    const all: PlannedRedirect[] = [...plan.rules, ...plan.stubs];
    expect(plan.rules).toHaveLength(50);
    expect(plan.skippedExisting).toBe(0);
    expect(new Set(all.map((r) => r.from)).size).toBe(all.length);
    const planned = new Set(all.map((r) => r.from));
    for (const p of planned) expect(old.has(p), p).toBe(true);
    // An old address left out is the merged entry's own address (same key, a Quiet page there).
    const sameAddress = new Set<string>();
    for (const row of layer.redirects.legacy) {
      if (row.hadPage.quiet !== true || row.target === null || row.target.id !== row.oldKey) continue;
      if (row.target.kind !== row.kind || !layer.hasPage(row.target.kind, row.target.id)) continue;
      for (const p of legacyPaths("quiet", row.kind, row.oldKey, layer.links)) sameAddress.add(p.path);
    }
    for (const p of old) if (!planned.has(p)) expect(sameAddress.has(p), p).toBe(true);
    expect(planned.size).toBeGreaterThan(50);
    for (const r of all) expect(exists(bare(r.to)) || isIndexPage(bare(r.to)), `${r.from} → ${r.to}`).toBe(true);
    const weights = all.map((r) => r.weight);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
    // Unmatched old keys go to their index page.
    const unmatched = layer.redirects.legacy.find((r) => r.target === null && r.hadPage.quiet);
    if (unmatched) {
      const r = all.find((x) => x.key === unmatched.oldKey && x.source === "legacy");
      expect(r?.to).toMatch(/^\/(?:yi|en)\/(?:people|sources|erachim)?\/?$/);
    }
  });
});

describe("planner rules", () => {
  const redirects = {
    corpus: { topics: {}, concepts: {}, people: { "old-person": "new-person" }, works: {}, stories: {}, threads: { "old-thread": "new-thread" } },
    legacy: [
      { kind: "person" as const, oldKey: "rare", hadPage: { quiet: true, live: true }, target: { kind: "person" as const, id: "rare-new" }, via: "name" as const },
      { kind: "person" as const, oldKey: "famous", hadPage: { quiet: true, live: true }, target: { kind: "person" as const, id: "famous-new" }, via: "name" as const },
      { kind: "work" as const, oldKey: "no-page", hadPage: { quiet: false, live: true }, target: null, via: null },
      { kind: "work" as const, oldKey: "lost", hadPage: { quiet: true, live: true }, target: null, via: null },
      { kind: "concept" as const, oldKey: "kept", hadPage: { quiet: true, live: true }, target: { kind: "concept" as const, id: "kept-new" }, via: "slug" as const },
    ],
  };
  const pages = new Set(["/en/", "/yi/", "/en/people/", "/yi/people/", "/en/sources/", "/yi/sources/", "/en/people/famous-new/", "/yi/people/famous-new/", "/en/inyanim/kept/", "/yi/inyanim/kept/"]);
  const links = { hasPage: (_site: string, _kind: string, id: string) => id.endsWith("-new") };
  const plan = (maxRules: number, maxLine?: number) =>
    planRedirects({
      redirects,
      links,
      exists: (p) => pages.has(p),
      legacyWeight: (_k, key) => (key === "famous" ? 120 : key === "rare" ? 3 : undefined),
      entityWeight: () => 7,
      maxRules,
      ...(maxLine !== undefined ? { maxLine } : {}),
    });

  it("orders by old shiur count, caps rules and sends the rest to stubs", () => {
    const p = plan(2);
    expect(p.rules.map((r) => r.from)).toEqual(["/en/people/famous/", "/yi/people/famous/"]);
    expect(p.rules[0]).toMatchObject({ to: "/en/people/famous-new/", fallback: null, weight: 120 });
    expect(p.stubs.map((r) => r.from)).toContain("/en/people/rare/");
    expect(p.skippedExisting).toBe(2); // /{ed}/inyanim/kept/ is still built
  });

  it("falls back to the index page for an unbuilt target, and leaves anchor-only keys and Quiet threads out", () => {
    const all = [...plan(100).rules, ...plan(100).stubs];
    expect(all.find((r) => r.from === "/en/people/rare/")).toMatchObject({ to: "/en/people/", fallback: "index" });
    expect(all.find((r) => r.from === "/en/sources/lost/")).toMatchObject({ to: "/en/sources/", fallback: null });
    // A live id without a Quiet page: its index line (the anchor), the index page being built.
    expect(all.find((r) => r.from === "/en/people/old-person/")).toMatchObject({ to: "/en/people/#new-person", fallback: null, source: "corpus" });
    expect(all.some((r) => r.from.includes("no-page"))).toBe(false);
    expect(all.some((r) => r.from.includes("thread"))).toBe(false);
  });

  it("turns a rule that would be too long into a stub", () => {
    const p = plan(100, 20);
    expect(p.rules).toEqual([]);
    expect(p.stubs.length).toBeGreaterThan(0);
  });

  it("renders a stub with escaped text in the edition's direction", () => {
    const html = stubHtml({ ed: "yi", to: '/yi/people/"x"/' }, QUIET);
    expect(html).toContain('<html lang="yi" dir="rtl">');
    expect(html).toContain("&quot;x&quot;");
    expect(html).not.toContain('"x"/');
  });

  it("reads the cap from the corpus policy (default 1,900, never above 2,000)", () => {
    expect(readMaxRules(MINI_POLICY)).toBe(DEFAULT_MAX_RULES);
    expect(readMaxRules(join(repo, "site-policy"))).toBe(1900);
    expect(readMaxRules(join(work, "no-such-dir"))).toBe(DEFAULT_MAX_RULES);
  });

  it("never maps a path outside dist", () => {
    expect(pageFile("/d", "/en/../../etc/")).toBeNull();
    expect(pageFile("/d", "/en/%2e%2e/x/")).toBeNull();
    expect(pageFile("/d", "/en/people/%D7%90/")).toBe(join("/d", "en", "people", "א", "index.html"));
  });
});

describe("pairing removal", () => {
  it("the series page has no link to a series in the other language", () => {
    for (const ed of ["yi", "en"]) {
      const html = readFileSync(join(dist, ed, "series", "tanya-yi", "index.html"), "utf8");
      expect(html).not.toContain("data-sibling");
      expect(html).not.toContain(`href="/${ed}/series/tanya-en/"`);
      expect(html).not.toContain("series-sibling");
    }
  });
});
