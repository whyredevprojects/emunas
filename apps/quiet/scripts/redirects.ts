/**
 * Quiet legacy redirects (corpus-wave-plan §5, D12; concept-quiet-corpus C5 "Published links should
 * not break"). Runs after `astro build` (and after the search index, so stubs are never indexed):
 *
 *   tsx scripts/redirects.ts [--dist <dir>] [--corpus <dir>] [--policy-dir <dir>] [--max-rules <n>]
 *
 * Defaults: `--dist dist` (relative to the working directory), `--corpus` as the pages find it
 * (`EMUNAS_CORPUS_DIR`, else the nearest `.corpus/`), `--policy-dir <repo>/site-policy`, the rule
 * cap from `corpus-policy.json` `quiet.redirects.maxRules` (default 1,900; the platform allows
 * 2,000 static rules).
 *
 * What it does:
 *  1. Reads `.corpus/layer/redirects.json`: `legacy` (old normalize-keyed person, work and concept
 *     keys → merged corpus entity, or null) and `corpus` (retired corpus id → live id, chains already
 *     resolved). Each row becomes old paths → new path through `@emunas/links` `legacyRedirects` /
 *     `corpusRedirects` (so the addresses are the ones the pages use). A Quiet key that never had
 *     its own page gives nothing (an index anchor cannot be redirected by a server).
 *  2. Skips every old path whose page still exists in dist.
 *  3. Checks each target against dist: a target page that is not built falls back to its index
 *     page, and an index that is not built to the edition home. Unmatched old keys already go to
 *     the index page. So every redirect lands on a page that exists, in one hop.
 *  4. Orders by the old entity's shiur count (most-cited first), then path, and writes the first
 *     `maxRules` as `301` lines to `dist/_redirects` (added to any rules already there, within the
 *     platform limits; see worker/redirects-file.ts).
 *  5. Every old path beyond the cap gets a static stub page at that path: meta refresh 0,
 *     rel=canonical to the target, robots noindex, and a visible link.
 *
 * Without a corpus layer it does nothing (a shell-only build). Exit codes: 0 ok, 1 error, 2 usage.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { LayerRedirectKind, LayerRedirectsFile, LegacyKind } from "@emunas/corpus/public";
import { REPO_ROOT } from "@emunas/corpus/build";
import { corpusRedirects, legacyRedirects, type CorpusKind, type Ed, type LinkData, type RedirectPair } from "@emunas/links";
import { findCorpusDir } from "../src/components/indexes/corpus.ts";
import { findLayerDir, loadQuietLayer, type QuietLayer } from "../src/components/corpus/layer.ts";
import { siteEnv } from "../src/components/seo/site-env.ts";
import { MAX_STATIC_REDIRECTS, formatRedirects, isDynamic, parseRedirects, type RedirectRule } from "../worker/redirects-file.ts";

/** Default rule cap (D12) when the policy file does not set one. */
export const DEFAULT_MAX_RULES = 1900;
export const REDIRECT_STATUS = 301;

const KIND_OF: Readonly<Record<LayerRedirectKind, CorpusKind>> = {
  topics: "topic",
  concepts: "concept",
  people: "person",
  works: "work",
  stories: "story",
  threads: "thread",
};

/** The index directory of each kind (where an unbuilt target falls back to). */
const INDEX_DIR: Readonly<Record<CorpusKind, string | null>> = {
  topic: "inyanim",
  concept: "erachim",
  person: "people",
  work: "sources",
  story: "stories",
  thread: null,
};

export interface PlannedRedirect {
  readonly ed: Ed;
  readonly from: string;
  readonly to: string;
  /** Old shiur count: most-cited first. */
  readonly weight: number;
  readonly source: "legacy" | "corpus";
  readonly kind: CorpusKind;
  /** Old key or retired id. */
  readonly key: string;
  /** The target was not built: `index` (its index page) or `home` (the edition home). */
  readonly fallback: "index" | "home" | null;
}

export interface RedirectPlan {
  /** Written as `_redirects` lines (at most the cap). */
  readonly rules: PlannedRedirect[];
  /** Beyond the cap (or too long for a rule line): static stub pages. */
  readonly stubs: PlannedRedirect[];
  /** Old paths skipped because their page still exists. */
  readonly skippedExisting: number;
  /** Old paths that two rows claimed (the most-cited one wins). */
  readonly duplicates: number;
  readonly fallbacks: { readonly index: number; readonly home: number };
}

export interface PlanInput {
  readonly redirects: LayerRedirectsFile;
  /** Page flags from the layer (`QuietLayer.links`). */
  readonly links: LinkData;
  /** Whether a root-relative page path (`/en/people/x/`) exists in dist. */
  readonly exists: (path: string) => boolean;
  /** Old shiur count of a legacy key, when the build still knows it. */
  readonly legacyWeight?: (kind: LegacyKind, oldKey: string) => number | undefined;
  /** Visible shiur count of a corpus entity. */
  readonly entityWeight?: (kind: CorpusKind, id: string) => number | undefined;
  readonly maxRules: number;
  /** Rule line length limit (`_redirects`). */
  readonly maxLine?: number;
}

const bare = (to: string): string => to.replace(/[?#].*$/, "");

function settle(pair: RedirectPair, kind: CorpusKind, exists: (p: string) => boolean): { to: string; fallback: PlannedRedirect["fallback"] } {
  if (exists(bare(pair.to))) return { to: pair.to, fallback: null };
  const dir = INDEX_DIR[kind];
  const index = dir === null ? null : `/${pair.ed}/${dir}/`;
  if (index !== null && exists(index)) return { to: index, fallback: "index" };
  return { to: `/${pair.ed}/`, fallback: "home" };
}

/** Turns the layer's redirects into rules and stubs (pure; `exists` is the only view of dist). */
export function planRedirects(input: PlanInput): RedirectPlan {
  const maxLine = input.maxLine ?? 1000;
  const all: PlannedRedirect[] = [];
  let skippedExisting = 0;
  const push = (pair: RedirectPair, kind: CorpusKind, key: string, weight: number, source: PlannedRedirect["source"]) => {
    if (input.exists(pair.from)) {
      skippedExisting++;
      return;
    }
    const { to, fallback } = settle(pair, kind, input.exists);
    if (bare(to) === pair.from) return;
    all.push({ ed: pair.ed, from: pair.from, to, weight, source, kind, key, fallback });
  };

  for (const row of input.redirects.legacy) {
    const targetWeight = row.target ? input.entityWeight?.(row.target.kind, row.target.id) : undefined;
    const weight = input.legacyWeight?.(row.kind, row.oldKey) ?? targetWeight ?? 0;
    for (const pair of legacyRedirects("quiet", row, input.links)) push(pair, row.target?.kind ?? row.kind, row.oldKey, weight, "legacy");
  }
  for (const [group, map] of Object.entries(input.redirects.corpus) as [LayerRedirectKind, Record<string, string>][]) {
    const kind = KIND_OF[group];
    if (kind === undefined) continue;
    for (const [from, to] of Object.entries(map)) {
      if (from === "" || to === "" || from.includes("/") || to.includes("/")) continue;
      const weight = input.entityWeight?.(kind, to) ?? 0;
      for (const pair of corpusRedirects("quiet", kind, from, to, input.links)) push(pair, kind, from, weight, "corpus");
    }
  }

  all.sort((a, b) => b.weight - a.weight || (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const seen = new Set<string>();
  const unique: PlannedRedirect[] = [];
  let duplicates = 0;
  for (const r of all) {
    if (seen.has(r.from)) {
      duplicates++;
      continue;
    }
    seen.add(r.from);
    unique.push(r);
  }
  const rules: PlannedRedirect[] = [];
  const stubs: PlannedRedirect[] = [];
  for (const r of unique) {
    const fits = `${r.from} ${r.to} ${REDIRECT_STATUS}`.length <= maxLine;
    if (fits && rules.length < input.maxRules) rules.push(r);
    else stubs.push(r);
  }
  return {
    rules,
    stubs,
    skippedExisting,
    duplicates,
    fallbacks: {
      index: unique.filter((r) => r.fallback === "index").length,
      home: unique.filter((r) => r.fallback === "home").length,
    },
  };
}

// ---------------------------------------------------------------- stub pages

const STUB_TEXT: Readonly<Record<Ed, { title: string; moved: string }>> = {
  en: { title: "This page has moved", moved: "This page has moved. Continue to the new page:" },
  yi: { title: "דער בלאט איז אריבער", moved: "דער בלאט איז אריבער. גייט ווייטער צום נייעם בלאט:" },
};

/** Marks a stub page, so a second run over the same dist does not take it for a built page. */
export const STUB_MARK = "emunas-redirect-stub";

/** Marks the generated block of `_redirects` (a second run replaces it). */
const RULES_HEADER = "Quiet legacy and retired-id redirects (apps/quiet/scripts/redirects.ts; corpus-wave-plan §5).";

function isStub(file: string): boolean {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(1024);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).toString("utf8").includes(`name="${STUB_MARK}"`);
  } finally {
    closeSync(fd);
  }
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * A static stub for an old path beyond the rule cap: meta refresh 0 to the target, rel=canonical to
 * the target's absolute URL, robots noindex, and a visible link (no script, no inline style).
 */
export function stubHtml(r: Pick<PlannedRedirect, "ed" | "to">, quietOrigin: string): string {
  const text = STUB_TEXT[r.ed];
  const dir = r.ed === "yi" ? "rtl" : "ltr";
  const to = escapeHtml(r.to);
  const canonical = escapeHtml(`${quietOrigin}${bare(r.to)}`);
  return [
    "<!doctype html>",
    `<html lang="${r.ed}" dir="${dir}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(text.title)}</title>`,
    `<meta name="robots" content="noindex">`,
    `<meta name="${STUB_MARK}" content="1">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta http-equiv="refresh" content="0; url=${to}">`,
    "</head>",
    "<body>",
    `<p>${escapeHtml(text.moved)} <a href="${to}">${to}</a></p>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

/** The file under `dist` that serves a root-relative page path (`/en/x/` → `dist/en/x/index.html`). */
export function pageFile(dist: string, path: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(bare(path));
  } catch {
    return null;
  }
  if (!decoded.startsWith("/") || decoded.split("/").some((s) => s === ".." || s === ".")) return null;
  const file = decoded.endsWith("/") ? join(dist, decoded, "index.html") : join(dist, `${decoded}.html`);
  const rel = relative(dist, file);
  if (rel.startsWith("..") || rel.startsWith(sep)) return null;
  return file;
}

/** Whether a page path is served from dist (`/x/` by `x/index.html`, `/x` by `x.html` or `x/index.html`). */
export function distExists(dist: string): (path: string) => boolean {
  return (path) => {
    const file = pageFile(dist, path);
    if (file === null) return false;
    if (existsSync(file)) return !isStub(file);
    const p = bare(path);
    const dirIndex = join(dirname(file), p.split("/").at(-1) ?? "", "index.html");
    return !p.endsWith("/") && existsSync(dirIndex) && !isStub(dirIndex);
  };
}

// ---------------------------------------------------------------- policy and weights

/** `quiet.redirects.maxRules` from corpus-policy.json (missing file or key: the default). */
export function readMaxRules(policyDir: string): number {
  const file = join(policyDir, "corpus-policy.json");
  if (!existsSync(file)) return DEFAULT_MAX_RULES;
  const json = JSON.parse(readFileSync(file, "utf8")) as { quiet?: { redirects?: { maxRules?: unknown } } };
  const v = json.quiet?.redirects?.maxRules;
  if (v === undefined) return DEFAULT_MAX_RULES;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_STATIC_REDIRECTS) {
    throw new Error(`${file}: quiet.redirects.maxRules must be an integer from 0 to ${MAX_STATIC_REDIRECTS}`);
  }
  return v;
}

/**
 * Old shiur counts of the legacy keys, from the legacy aggregate `entities.json` while the build still
 * writes it (C3.1 retires it; then the target's visible count orders the rules).
 */
export function legacyWeights(corpusDir: string): (kind: LegacyKind, key: string) => number | undefined {
  const file = join(corpusDir, "entities.json");
  const maps: Record<LegacyKind, Map<string, number>> = { person: new Map(), work: new Map(), concept: new Map() };
  if (existsSync(file)) {
    const json = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const lists: [LegacyKind, unknown][] = [
      ["person", json["people"]],
      ["work", json["works"]],
      ["concept", json["concepts"]],
    ];
    for (const [kind, list] of lists) {
      if (!Array.isArray(list)) continue;
      for (const e of list as { key?: unknown; shiurim?: unknown }[]) {
        if (typeof e?.key === "string" && typeof e.shiurim === "number") maps[kind].set(e.key, e.shiurim);
      }
    }
  }
  return (kind, key) => maps[kind].get(key);
}

export function entityWeights(layer: QuietLayer): (kind: CorpusKind, id: string) => number | undefined {
  return (kind, id) => {
    const e =
      kind === "topic"
        ? layer.topic(id)
        : kind === "concept"
          ? layer.concept(id)
          : kind === "person"
            ? layer.person(id)
            : kind === "work"
              ? layer.work(id)
              : kind === "story"
                ? layer.story(id)
                : kind === "thread"
                  ? layer.thread(id)
                  : undefined;
    if (e === undefined) return undefined;
    const n = "count" in e ? e.count : e.shiurCount;
    return typeof n === "number" ? n : undefined;
  };
}

// ---------------------------------------------------------------- write

export interface WriteResult {
  readonly rules: number;
  readonly existingRules: number;
  readonly stubs: number;
}

/** Writes `dist/_redirects` (keeping rules already there) and the stub pages. */
export function writeRedirects(dist: string, plan: RedirectPlan, quietOrigin: string): WriteResult {
  const file = join(dist, "_redirects");
  const before = existsSync(file) ? readFileSync(file, "utf8") : "";
  // Rules from public/ stay; a block this script wrote on an earlier run is replaced.
  const existing: RedirectRule[] = before.includes(RULES_HEADER) ? [] : parseRedirects(before);
  const taken = new Set(existing.map((r) => r.from));
  const room = MAX_STATIC_REDIRECTS - existing.filter((r) => !isDynamic(r.from)).length;
  const rules: RedirectRule[] = [];
  const overflow: PlannedRedirect[] = [];
  for (const r of plan.rules) {
    if (taken.has(r.from)) continue;
    if (rules.length < room) rules.push({ from: r.from, to: r.to, status: REDIRECT_STATUS });
    else overflow.push(r);
  }
  writeFileSync(
    file,
    formatRedirects([...existing, ...rules], [
      RULES_HEADER,
      "Generated after astro build: old site-derived entity addresses → merged corpus entries.",
    ]),
  );
  let stubs = 0;
  for (const r of [...overflow, ...plan.stubs]) {
    const page = pageFile(dist, r.from.endsWith("/") ? r.from : `${r.from}/`);
    if (page === null || (existsSync(page) && !isStub(page))) continue;
    mkdirSync(dirname(page), { recursive: true });
    writeFileSync(page, stubHtml(r, quietOrigin));
    stubs++;
  }
  return { rules: rules.length, existingRules: existing.length, stubs };
}

// ---------------------------------------------------------------- CLI

const USAGE = "redirects [--dist <dir>] [--corpus <dir>] [--policy-dir <dir>] [--max-rules <n>]";

function main(argv: string[]): number {
  let args;
  try {
    args = parseArgs({
      args: argv,
      options: {
        dist: { type: "string" },
        corpus: { type: "string" },
        "policy-dir": { type: "string" },
        "max-rules": { type: "string" },
      },
      strict: true,
    }).values;
  } catch (e) {
    console.error(`${(e as Error).message}\nusage: ${USAGE}`);
    return 2;
  }
  try {
    const dist = resolve(args.dist ?? "dist");
    if (!existsSync(dist)) throw new Error(`${dist} does not exist (run astro build first)`);
    const corpusDir = args.corpus !== undefined ? resolve(args.corpus) : findCorpusDir();
    const layerDir = findLayerDir(corpusDir);
    if (corpusDir === null || layerDir === null) {
      console.warn("[quiet redirects] no .corpus/layer/: no redirects written");
      return 0;
    }
    const layer = loadQuietLayer(layerDir);
    if (!layer.enabled) {
      console.warn("[quiet redirects] the corpus layer is off: no redirects written");
      return 0;
    }
    let maxRules = readMaxRules(args["policy-dir"] !== undefined ? resolve(args["policy-dir"]) : join(REPO_ROOT, "site-policy"));
    if (args["max-rules"] !== undefined) {
      const n = Number(args["max-rules"]);
      if (!Number.isInteger(n) || n < 0 || n > MAX_STATIC_REDIRECTS) throw new Error(`--max-rules must be an integer from 0 to ${MAX_STATIC_REDIRECTS}`);
      maxRules = n;
    }
    const plan = planRedirects({
      redirects: layer.redirects,
      links: layer.links,
      exists: distExists(dist),
      legacyWeight: legacyWeights(corpusDir),
      entityWeight: entityWeights(layer),
      maxRules,
    });
    const origin = siteEnv(process.env).hosts.quiet;
    const out = writeRedirects(dist, plan, origin);
    console.log(
      `[quiet redirects] ${out.rules} rules in _redirects (cap ${maxRules}${out.existingRules > 0 ? `, ${out.existingRules} already there` : ""}), ` +
        `${out.stubs} stub pages, ${plan.skippedExisting} old paths skipped (page still built), ` +
        `${plan.fallbacks.index} to an index page and ${plan.fallbacks.home} to the edition home (target not built), ` +
        `${plan.duplicates} duplicate old paths`,
    );
    return 0;
  } catch (e) {
    console.error(`redirects: ${(e as Error).message}`);
    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
