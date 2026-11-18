/**
 * C3.1: the site-derived entity layer is retired. The aggregate `people.json`, `concepts.json`,
 * `stories.json` and `entities.json`, their types, the legacy `{kind: "entity"}` route and its
 * `entityCount`, the concept stop-list and threshold, the guard's legacy-aggregate exemption, Live's
 * per-telling `stories.json` and the stale Quiet index models are gone. This test greps every app
 * and package source (and the API worker) so nothing brings them back.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import * as aggregate from "../../src/aggregate/index.ts";
import { AGGREGATE_FILES } from "../../src/aggregate/aggregate.ts";
import { PKG } from "../helpers.ts";

const REPO = join(PKG, "..", "..");
const ROOTS = ["apps", "packages", "workers"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".astro", ".react-router", "fixtures", "coverage", "test-results", "playwright-report"]);
const SOURCE = /\.(?:ts|tsx|mts|astro|mjs|js)$/;
/** This file names what it bans. */
const SELF = relative(REPO, join(PKG, "test", "aggregate", "retired.test.ts")).split(sep).join("/");

function sources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (SOURCE.test(name)) {
        const rel = relative(REPO, p).split(sep).join("/");
        if (rel !== SELF) out.push({ path: rel, text: readFileSync(p, "utf8") });
      }
    }
  };
  for (const r of ROOTS) walk(join(REPO, r));
  return out;
}

const FILES = sources();
const isTest = (p: string) => /(?:^|\/)(?:test|tests)\//.test(p) || /\.(?:test|spec)\.[a-z]+$/.test(p) || /test-fixtures\.ts$/.test(p);

/** Types of the retired aggregate files (`@emunas/corpus/aggregate`). */
const RETIRED_TYPES = ["PeopleFile", "PersonEntry", "PersonShiur", "ConceptsFile", "ConceptEntry", "StoriesFile", "StoryEntry", "EntitiesFile", "EntityCount"];

/** Identifiers of the retired legacy layer, anywhere in a source file. */
const RETIRED_NAMES = [
  "ENTITY_THRESHOLDS", // @emunas/corpus/public
  "CONCEPT_MIN_SHIURIM", // @emunas/normalize
  "CONCEPT_STOP_LIST",
  "isStopConcept",
  "entityCount", // @emunas/links LinkData
  "ENTITY_PAGE_THRESHOLD",
  "quietHasEntityPage",
  "EntityOptions",
  "aliasTermsLegacy", // @emunas/corpus-guard
  "isLegacyAggregateFile",
  "LEGACY_AGGREGATE_FILES",
  "prerenderSetsFromEntities", // Live budgets
  "loadStories", // Live data client
  "StoryRow",
  "indexesData", // Quiet's legacy index reader
  "loadIndexesData",
  "IndexesData",
];

/** Import specifiers of the aggregate module (package entry or a relative path to it). */
const AGGREGATE_IMPORT = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']([^"']*aggregate(?:\/index|\/types)?(?:\.ts)?)["']/g;

describe("C3.1: the site-derived entity layer stays retired", () => {
  it("reads sources from apps, packages and workers", () => {
    expect(FILES.length).toBeGreaterThan(300);
    expect(FILES.some((f) => f.path.startsWith("apps/quiet/src/"))).toBe(true);
    expect(FILES.some((f) => f.path.startsWith("apps/live/app/"))).toBe(true);
    expect(FILES.some((f) => f.path.startsWith("workers/"))).toBe(true);
  });

  it("the aggregate module writes and exports none of the retired files", () => {
    expect(Object.values(AGGREGATE_FILES).sort()).toEqual(["neighbours.json", "occasions.json", "sections.json", "series.json", "works.json", "years.json"]);
    for (const k of Object.keys(aggregate)) expect(RETIRED_TYPES).not.toContain(k);
  });

  it("no source imports a retired aggregate type", () => {
    const bad: string[] = [];
    for (const f of FILES) {
      for (const m of f.text.matchAll(AGGREGATE_IMPORT)) {
        const names = (m[1] ?? "").split(",").map((x) => x.replace(/^\s*type\s+/, "").split(/\s+as\s+/)[0]!.trim());
        for (const n of names) if (RETIRED_TYPES.includes(n)) bad.push(`${f.path}: ${n} from ${m[2]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("no source names a retired identifier (tests may name one to ban it)", () => {
    const bad: string[] = [];
    for (const f of FILES) {
      if (isTest(f.path)) continue;
      for (const n of RETIRED_NAMES) if (new RegExp(`\\b${n}\\b`).test(f.text)) bad.push(`${f.path}: ${n}`);
    }
    expect(bad).toEqual([]);
  });

  it("no source builds the legacy normalize-keyed entity route", () => {
    const bad = FILES.filter((f) => /kind:\s*["']entity["']/.test(f.text)).map((f) => f.path);
    expect(bad).toEqual([]);
  });

  it("no app source reads a retired .corpus file or Live's per-telling stories.json", () => {
    const bad: string[] = [];
    for (const f of FILES) {
      if (!f.path.startsWith("apps/") || isTest(f.path)) continue;
      // Layer files are read through LAYER_FILES; Explore's own file is explore/entities.json.
      for (const m of f.text.matchAll(/["']((?:people|concepts|stories|entities)\.json)["']/g)) bad.push(`${f.path}: ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });

  it("Quiet has no stale stories index model, index-title crumbs or stories.* index strings", () => {
    const quiet = FILES.filter((f) => f.path.startsWith("apps/quiet/src/"));
    const bad: string[] = [];
    for (const f of quiet) {
      if (/\bstoriesIndex\b(?!Model)/.test(f.text)) bad.push(`${f.path}: storiesIndex`);
      if (/\bTITLE_KEY\b/.test(f.text)) bad.push(`${f.path}: TITLE_KEY`);
    }
    const strings = quiet.find((f) => f.path === "apps/quiet/src/components/indexes/strings.ts");
    expect(strings).toBeDefined();
    expect(strings!.text).not.toMatch(/"stories\.[a-zA-Z]+":/);
    expect(bad).toEqual([]);
  });
});
