/**
 * Unit tests for `site-chain.ts` and `plant.ts` (C3.8). The end-to-end run on the real data is
 * `npm run site:chain` (and its two planted self-tests); these tests pin the order, the options,
 * the exit rule, the workflows' agreement with the script and the plants against a small synthetic
 * layer and corpus data folder written to a temp dir.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ASR_VARIANTS_FILE, createLeakScanner } from "@emunas/corpus-guard";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { plant } from "./plant.ts";
import {
  chainEnv,
  chainSteps,
  countLines,
  exitCode,
  main,
  parseChainArgs,
  REPO,
  runSteps,
  selectSteps,
  STEP_IDS,
  UsageError,
  type Runner,
  type StepId,
} from "./site-chain.ts";

const REPORT = "/tmp/x/guard-post.json";

describe("chain order", () => {
  it("is the plan §6 order", () => {
    expect(chainSteps({ report: REPORT, bundles: false }).map((s) => s.id)).toEqual([
      "corpus-build",
      "guard-pre",
      "corpus-suppress",
      "search-build",
      "live-data",
      "quiet-build",
      "live-build",
      "guard-post",
      "budgets",
    ]);
  });

  it("guard post is layer-aware: scans the layer and both outputs with the corpus data folder", () => {
    const post = chainSteps({ report: REPORT, bundles: true }).find((s) => s.id === "guard-post")!;
    const argv = post.commands[0]!.join(" ");
    expect(argv).toContain("post --scan .corpus apps/quiet/dist apps/live/build/client .wrangler/bundles");
    expect(argv).toContain("--corpus .corpus");
    expect(argv).toContain("--corpus-data data/derived/corpus");
    expect(argv).toContain(`--report ${REPORT}`);
    expect(argv).not.toContain("--no-aliases");
    expect(argv).not.toContain("--no-verbatim");
    const noBundles = chainSteps({ report: REPORT, bundles: false }).find((s) => s.id === "guard-post")!;
    expect(noBundles.commands[0]!.join(" ")).not.toContain(".wrangler");
  });

  it("the rebuild uses the pre-pass suppress list", () => {
    const steps = chainSteps({ report: REPORT, bundles: false });
    expect(steps.find((s) => s.id === "guard-pre")!.commands[0]!.join(" ")).toContain("--out .corpus/suppress.json");
    expect(steps.find((s) => s.id === "corpus-suppress")!.commands[0]!.join(" ")).toContain("corpus:build -- --suppress .corpus/suppress.json");
  });

  it("selects slices", () => {
    const steps = chainSteps({ report: REPORT, bundles: false });
    expect(selectSteps(steps, "guard-post", "budgets").map((s) => s.id)).toEqual(["guard-post", "budgets"]);
    expect(selectSteps(steps, "quiet-build", "quiet-build").map((s) => s.id)).toEqual(["quiet-build"]);
  });
});

/**
 * Each chain step's signature in a workflow, in chain order. ci.yml (build job) and deploy.yml must
 * run them in the same order as the script.
 */
const SIGNATURES: Record<StepId, RegExp> = {
  "corpus-build": /run: npm run corpus:build\s*$/mu,
  "guard-pre": /^\s*pre --corpus \.corpus --out \.corpus\/suppress\.json/mu,
  "corpus-suppress": /npm run corpus:build -- --suppress \.corpus\/suppress\.json/u,
  "search-build": /run: npm run search:build\s*$/mu,
  "live-data": /npm run data:build --workspace=@emunas\/live/u,
  "quiet-build": /run: npm run build --workspace=@emunas\/quiet/u,
  "live-build": /run: npm run build --workspace=@emunas\/live/u,
  "guard-post": /^\s*post --scan \.corpus apps\/quiet\/dist apps\/live\/build\/client/mu,
  budgets: /guard --workspace=@emunas\/corpus-guard -- budgets apps\/quiet\/dist apps\/live\/build\/client/u,
};

function workflowOrder(text: string): { id: StepId; at: number }[] {
  return STEP_IDS.map((id) => ({ id, at: text.search(SIGNATURES[id]) }));
}

function jobText(text: string, job: string): string {
  const start = text.indexOf(`\n  ${job}:\n`);
  if (start < 0) throw new Error(`no job ${job}`);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/u);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

describe("workflows run the chain order", () => {
  for (const [file, job] of [
    [".github/workflows/ci.yml", "build"],
    [".github/workflows/deploy.yml", "deploy"],
  ] as const) {
    it(`${file} (${job} job)`, () => {
      const text = jobText(readFileSync(join(REPO, file), "utf8"), job);
      const found = workflowOrder(text);
      expect(found.filter((f) => f.at < 0).map((f) => f.id)).toEqual([]);
      const sorted = [...found].sort((a, b) => a.at - b.at).map((f) => f.id);
      expect(sorted).toEqual([...STEP_IDS]);
    });

    it(`${file}: guard post is layer-aware (corpus data folder, no alias opt-out)`, () => {
      const text = jobText(readFileSync(join(REPO, file), "utf8"), job);
      const post = text.slice(text.search(SIGNATURES["guard-post"]));
      const block = post.slice(0, post.search(/\n\s*- name:/u));
      expect(block).toContain("--corpus .corpus");
      expect(block).toContain("--corpus-data data/derived/corpus");
      expect(block).not.toContain("--no-aliases");
    });
  }
});

describe("options", () => {
  it("defaults to the whole chain", () => {
    const o = parseChainArgs([], { RUNNER_TEMP: "/rt" });
    expect(o).toMatchObject({ from: "corpus-build", to: "budgets", plant: null, expectFailAt: null, report: "/rt/site-chain/guard-post.json" });
  });

  it("parses a slice, a plant and a self-test", () => {
    const o = parseChainArgs(["--from", "guard-post", "--plant", "asr-synonym", "--expect-fail-at", "guard-post", "--summary", "s.md"]);
    expect(o).toMatchObject({ from: "guard-post", plant: "asr-synonym", expectFailAt: "guard-post", summary: "s.md" });
  });

  it("rejects unknown steps, plants, options and an inverted slice", () => {
    expect(() => parseChainArgs(["--from", "deploy"])).toThrow(UsageError);
    expect(() => parseChainArgs(["--plant", "heardAs"])).toThrow(UsageError);
    expect(() => parseChainArgs(["--fast"])).toThrow(UsageError);
    expect(() => parseChainArgs(["--from", "budgets", "--to", "corpus-build"])).toThrow(UsageError);
    expect(() => parseChainArgs(["--plant", "asr-key", "--to", "live-build"])).toThrow(/guard-post/u);
  });

  it("main exits 2 on a usage error", () => {
    const lines: string[] = [];
    expect(main(["--nope"], () => 0, (l) => lines.push(l))).toBe(2);
    expect(lines.join("\n")).toContain("unknown option");
  });
});

describe("running", () => {
  const steps = chainSteps({ report: REPORT, bundles: false });

  it("stops at the first failing step and restores through the after hook", () => {
    const calls: string[] = [];
    const runner: Runner = (argv) => {
      calls.push(argv.join(" "));
      return argv.includes("post") ? 1 : 0;
    };
    const events: string[] = [];
    const r = runSteps(steps, runner, {}, { before: (s) => events.push(`+${s}`), after: (s) => events.push(`-${s}`), log: () => {} });
    expect(r.failedAt).toBe("guard-post");
    expect(r.ran.at(-1)).toBe("guard-post");
    expect(calls.some((c) => c.includes("budgets"))).toBe(false);
    expect(events.slice(-2)).toEqual(["+guard-post", "-guard-post"]);
  });

  it("a throwing before hook still runs the after hook", () => {
    const events: string[] = [];
    expect(() =>
      runSteps(selectSteps(steps, "guard-post", "guard-post"), () => 0, {}, {
        before: () => {
          throw new Error("boom");
        },
        after: (s) => events.push(s),
        log: () => {},
      }),
    ).toThrow("boom");
    expect(events).toEqual(["guard-post"]);
  });

  it("exit rule: green runs pass; a self-test passes only on a failure at the expected step", () => {
    expect(exitCode({ failedAt: null, ran: [] }, null)).toBe(0);
    expect(exitCode({ failedAt: "quiet-build", ran: [] }, null)).toBe(1);
    expect(exitCode({ failedAt: "guard-post", ran: [] }, "guard-post")).toBe(0);
    expect(exitCode({ failedAt: null, ran: [] }, "guard-post")).toBe(1);
    expect(exitCode({ failedAt: "live-build", ran: [] }, "guard-post")).toBe(1);
  });

  it("builds for the test domain unless a real one is set", () => {
    expect(chainEnv({})).toMatchObject({ EMUNAS_DOMAIN: "emunas.example", EMUNAS_MEDIA_ORIGIN: "https://media.example.invalid" });
    expect(chainEnv({ EMUNAS_DOMAIN: "real.org", EMUNAS_MEDIA_ORIGIN: "https://m.real.org" })).toMatchObject({
      EMUNAS_DOMAIN: "real.org",
      EMUNAS_MEDIA_ORIGIN: "https://m.real.org",
    });
    expect(chainEnv({ EMUNAS_WORKERS_SUBDOMAIN: "x" })["EMUNAS_DOMAIN"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// Plants against a synthetic layer

let dir = "";
let corpus = "";
let data = "";
const VARIANT = "hashem tov planted variant";

function writeJson(file: string, v: unknown): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, `${JSON.stringify(v)}\n`);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "site-chain-"));
  corpus = join(dir, ".corpus");
  data = join(dir, "data");
  writeJson(join(data, "topics.json"), [{ id: "hashgacha", label: { en: "Divine providence", yi: "השגחה" }, aliases: ["hashgacha pratis"] }]);
  writeJson(join(data, "people.json"), [{ id: "rashi", nameEn: "Rashi", nameHe: "רש״י", aliases: [] }]);
  writeJson(join(data, "concepts.json"), []);
  writeJson(join(data, "works.json"), []);
  writeJson(join(data, ASR_VARIANTS_FILE), { topics: { hashgacha: [VARIANT] } });
  writeJson(join(corpus, "layer", "people.json"), { people: [{ id: "rashi", names: { en: "Rashi" } }] });
  writeJson(join(corpus, "layer", "synonyms.json"), {
    synonyms: [{ kind: "topic", id: "hashgacha", terms: ["Divine providence", "hashgacha pratis"] }],
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function postFindings(): { kind: string; key?: string; rule?: string }[] {
  const scanner = createLeakScanner({ corpusDir: null, corpusDataDir: data, transcriptsDir: null, siteDir: join(REPO, "site-policy"), env: {} });
  scanner.scanPaths([join(corpus, "layer")]);
  return scanner.result().findings as { kind: string; key?: string; rule?: string }[];
}

describe("plants", () => {
  it("the synthetic layer is clean before planting", () => {
    expect(postFindings()).toEqual([]);
  });

  it("asr-key: an asrVariants key fails guard post; restore puts the bytes back", () => {
    const before = readFileSync(join(corpus, "layer", "people.json"));
    const p = plant("asr-key", corpus, data);
    expect(p.file).toBe("layer/people.json");
    expect(postFindings()).toContainEqual(expect.objectContaining({ kind: "key", key: "asrVariants" }));
    p.restore();
    expect(readFileSync(join(corpus, "layer", "people.json")).equals(before)).toBe(true);
    expect(postFindings()).toEqual([]);
  });

  it("asr-synonym: an ASR variant as a synonym fails guard post (raw ban); its text is not in the description", () => {
    const before = readFileSync(join(corpus, "layer", "synonyms.json"));
    const p = plant("asr-synonym", corpus, data);
    expect(p.what).toContain("topic:hashgacha");
    expect(p.what).not.toContain(VARIANT);
    expect(postFindings()).toContainEqual(expect.objectContaining({ kind: "alias", rule: "asr-variant" }));
    p.restore();
    expect(readFileSync(join(corpus, "layer", "synonyms.json")).equals(before)).toBe(true);
    expect(postFindings()).toEqual([]);
  });

  it("asr-synonym needs a variant that is not already a display name", () => {
    writeJson(join(data, ASR_VARIANTS_FILE), { topics: { hashgacha: ["hashgacha pratis"] } });
    expect(() => plant("asr-synonym", corpus, data)).toThrow(/no ASR variant/u);
  });
});

describe("counts", () => {
  it("reads guard pre/post and layer counts; missing files give no lines", () => {
    expect(countLines({ corpus, suppress: join(corpus, "suppress.json"), report: join(dir, "post.json") })).toEqual([]);
    writeJson(join(corpus, "suppress.json"), {
      counts: { shiurim: 3, items: 40, reported: 1, suppressed: 0, corpusUnits: 9, corpusReported: 0, corpusSuppressed: 1 },
      suppress: [{ id: "corpus:story:s1#retelling.en" }, { id: "shiur-1#x" }],
    });
    writeJson(join(dir, "post.json"), {
      aliasesChecked: true,
      verbatimChecked: true,
      counts: { findings: 0, filesScanned: 12, textUnits: 99, verbatimReported: 0, corpusUnits: 9, aliasTermsChecked: 50 },
    });
    writeJson(join(corpus, "layer", "layer.json"), {
      counts: { visibleShiurim: 3, topics: 1, concepts: 0, people: 1, works: 0, stories: 0, threads: 0, series: 0, pages: { quiet: { topics: 1 }, live: { topics: 1 } } },
      notRead: ["future.json"],
    });
    const lines = countLines({ corpus, suppress: join(corpus, "suppress.json"), report: join(dir, "post.json") });
    expect(lines.join("\n")).toContain("guard post: 0 finding(s)");
    expect(lines.join("\n")).toContain("suppressed corpus ids corpus:story:s1#retelling.en");
    expect(lines.join("\n")).not.toContain("shiur-1#x");
    expect(lines.join("\n")).toContain("layer pages (live): topics 1");
    expect(lines.join("\n")).toContain("files not read future.json");
  });
});
