/**
 * The real-data site chain (corpus-wave-plan §6, C3.8), in the order deploy.yml and ci.yml run it:
 *
 *   corpus:build → guard pre → corpus:build --suppress → search:build → live data:build
 *   → quiet build → live build → guard post (0 findings) → budgets
 *
 *   npm run site:chain [-- options]
 *
 * Options:
 *   --from <step> / --to <step>   run a slice of the chain (steps: see STEP_IDS)
 *   --plant asr-key|asr-synonym   plant a leak in the built layer before guard post (restored after)
 *   --expect-fail-at <step>       self-test: exit 0 only when the chain fails at exactly that step
 *   --report <file>               guard post report (default: <tmp>/site-chain/guard-post.json)
 *   --summary <file>              append a Markdown summary (CI: $GITHUB_STEP_SUMMARY)
 *
 * Exits non-zero at the first failing step and prints the guard counts (pre and post) and the
 * layer counts (visible recounts, pages per site, files not read). Never prints transcript text:
 * every count and id comes from the guard reports and `.corpus/layer/layer.json`.
 *
 * The builds use the test domain `emunas.example` and the placeholder media host unless
 * EMUNAS_DOMAIN / EMUNAS_WORKERS_SUBDOMAIN / EMUNAS_MEDIA_ORIGIN are set, so the outputs are the
 * ones the e2e and cross-site suites expect.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isPlant, plant, PLANTS, type Plant, type Planted } from "./plant.ts";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const STEP_IDS = [
  "corpus-build",
  "guard-pre",
  "corpus-suppress",
  "search-build",
  "live-data",
  "quiet-build",
  "live-build",
  "guard-post",
  "budgets",
] as const;
export type StepId = (typeof STEP_IDS)[number];

export function isStepId(v: string): v is StepId {
  return (STEP_IDS as readonly string[]).includes(v);
}

export interface Step {
  id: StepId;
  title: string;
  /** Commands run in order from the repo root (argv; the first entry is the program). */
  commands: string[][];
}

export interface ChainOptions {
  from: StepId;
  to: StepId;
  plant: Plant | null;
  expectFailAt: StepId | null;
  report: string;
  summary: string | null;
}

const GUARD = ["npm", "run", "--silent", "guard", "--workspace=@emunas/corpus-guard", "--"];
export const CORPUS_DIR = ".corpus";
export const SUPPRESS_FILE = ".corpus/suppress.json";
export const CORPUS_DATA_DIR = "data/derived/corpus";
export const QUIET_DIST = "apps/quiet/dist";
export const LIVE_CLIENT = "apps/live/build/client";
export const BUNDLES_DIR = ".wrangler/bundles";

/** The chain's steps. `bundles`: scan the Worker bundles too (when a dry run has written them). */
export function chainSteps(opts: { report: string; bundles: boolean }): Step[] {
  const scan = [CORPUS_DIR, QUIET_DIST, LIVE_CLIENT, ...(opts.bundles ? [BUNDLES_DIR] : [])];
  return [
    { id: "corpus-build", title: "corpus:build", commands: [["npm", "run", "corpus:build"]] },
    {
      id: "guard-pre",
      title: "guard pre (verbatim suppress list, ids only)",
      commands: [[...GUARD, "pre", "--corpus", CORPUS_DIR, "--out", SUPPRESS_FILE]],
    },
    {
      id: "corpus-suppress",
      title: "corpus:build --suppress",
      commands: [["npm", "run", "corpus:build", "--", "--suppress", SUPPRESS_FILE]],
    },
    { id: "search-build", title: "search:build", commands: [["npm", "run", "search:build"]] },
    { id: "live-data", title: "live data:build", commands: [["npm", "run", "data:build", "--workspace=@emunas/live"]] },
    { id: "quiet-build", title: "quiet build", commands: [["npm", "run", "build", "--workspace=@emunas/quiet"]] },
    { id: "live-build", title: "live build", commands: [["npm", "run", "build", "--workspace=@emunas/live"]] },
    {
      id: "guard-post",
      title: "guard post (layer-aware; 0 findings)",
      commands: [
        [
          ...GUARD,
          "post",
          "--scan",
          ...scan,
          "--corpus",
          CORPUS_DIR,
          "--corpus-data",
          CORPUS_DATA_DIR,
          "--report",
          opts.report,
        ],
      ],
    },
    {
      id: "budgets",
      title: "budgets",
      commands: [
        [...GUARD, "budgets", QUIET_DIST, LIVE_CLIENT],
        ["npm", "run", "data:budgets", "--workspace=@emunas/live"],
      ],
    },
  ];
}

export class UsageError extends Error {
  override name = "UsageError";
}

export function parseChainArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>> = process.env): ChainOptions {
  const opts: ChainOptions = {
    from: STEP_IDS[0],
    to: STEP_IDS[STEP_IDS.length - 1]!,
    plant: null,
    expectFailAt: null,
    report: join(env["RUNNER_TEMP"] ?? tmpdir(), "site-chain", "guard-post.json"),
    summary: null,
  };
  const step = (name: string, v: string | undefined): StepId => {
    if (v === undefined || !isStepId(v)) throw new UsageError(`--${name} needs one of ${STEP_IDS.join(", ")} (got ${v ?? "nothing"})`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case "--from":
        opts.from = step("from", argv[++i]);
        break;
      case "--to":
        opts.to = step("to", argv[++i]);
        break;
      case "--expect-fail-at":
        opts.expectFailAt = step("expect-fail-at", argv[++i]);
        break;
      case "--plant": {
        const v = value();
        if (!isPlant(v)) throw new UsageError(`--plant needs one of ${PLANTS.join(", ")} (got ${v})`);
        opts.plant = v;
        break;
      }
      case "--report":
        opts.report = resolve(value());
        break;
      case "--summary":
        opts.summary = value();
        break;
      default:
        throw new UsageError(`unknown option ${a}`);
    }
  }
  if (STEP_IDS.indexOf(opts.from) > STEP_IDS.indexOf(opts.to)) throw new UsageError(`--from ${opts.from} comes after --to ${opts.to}`);
  if (opts.plant && STEP_IDS.indexOf(opts.to) < STEP_IDS.indexOf("guard-post")) {
    throw new UsageError("--plant needs the chain to reach guard-post");
  }
  return opts;
}

/** The steps from `from` to `to`, in chain order. */
export function selectSteps(steps: readonly Step[], from: StepId, to: StepId): Step[] {
  const a = steps.findIndex((s) => s.id === from);
  const b = steps.findIndex((s) => s.id === to);
  return steps.slice(a, b + 1);
}

/** Runs one command; returns its exit status (non-zero for a signal or a spawn error). */
export type Runner = (argv: readonly string[], env: NodeJS.ProcessEnv) => number;

const spawnRunner: Runner = (argv, env) => {
  const r = spawnSync(argv[0]!, argv.slice(1), { cwd: REPO, env, stdio: "inherit" });
  if (r.error) return 127;
  return r.status ?? 1;
};

export interface ChainResult {
  /** The step that failed, or null when every selected step passed. */
  failedAt: StepId | null;
  ran: StepId[];
}

export interface ChainHooks {
  /** Before a step runs (the plant hook uses this for guard-post). */
  before?: (step: StepId) => void;
  /** After a step ran (pass or fail; the plant is restored here). */
  after?: (step: StepId) => void;
  log?: (line: string) => void;
}

/** Runs `steps` in order and stops at the first failure. */
export function runSteps(steps: readonly Step[], runner: Runner, env: NodeJS.ProcessEnv, hooks: ChainHooks = {}): ChainResult {
  const log = hooks.log ?? console.log;
  const ran: StepId[] = [];
  for (const s of steps) {
    log(`\n▶ site:chain ${s.id}: ${s.title}`);
    const t0 = performance.now();
    let status = 0;
    try {
      hooks.before?.(s.id);
      for (const cmd of s.commands) {
        status = runner(cmd, env);
        if (status !== 0) break;
      }
    } finally {
      hooks.after?.(s.id);
    }
    ran.push(s.id);
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    if (status !== 0) {
      log(`✗ site:chain ${s.id} failed (exit ${status}, ${secs} s)`);
      return { failedAt: s.id, ran };
    }
    log(`✓ site:chain ${s.id} (${secs} s)`);
  }
  return { failedAt: null, ran };
}

/** Exit code for a chain result: plain runs pass when nothing failed; self-tests when the expected step failed. */
export function exitCode(result: ChainResult, expectFailAt: StepId | null): number {
  if (expectFailAt === null) return result.failedAt === null ? 0 : 1;
  return result.failedAt === expectFailAt ? 0 : 1;
}

/** Build environment: the test domain and placeholder media host unless the caller set real ones. */
export function chainEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...env, ASTRO_TELEMETRY_DISABLED: "1" };
  if (!out["EMUNAS_DOMAIN"] && !out["EMUNAS_WORKERS_SUBDOMAIN"]) out["EMUNAS_DOMAIN"] = "emunas.example";
  if (!out["EMUNAS_MEDIA_ORIGIN"]) out["EMUNAS_MEDIA_ORIGIN"] = "https://media.example.invalid";
  return out;
}

// ---------------------------------------------------------------------------------------------
// Counts (ids and numbers only)

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function readJson(file: string): unknown {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as unknown) : null;
  } catch {
    return null;
  }
}

const num = (v: unknown): string => (typeof v === "number" ? String(v) : "?");

/** Summary lines from the guard reports and the layer counts. Missing files give no lines. */
export function countLines(paths: { corpus: string; suppress: string; report: string }): string[] {
  const out: string[] = [];
  const pre = readJson(paths.suppress);
  if (isRecord(pre) && isRecord(pre["counts"])) {
    const c = pre["counts"];
    out.push(
      `guard pre: ${num(c["shiurim"])} shiurim, ${num(c["items"])} items, reported ${num(c["reported"])}, suppressed ${num(c["suppressed"])}; ` +
        `corpus layer units ${num(c["corpusUnits"])}, reported ${num(c["corpusReported"])}, suppressed ${num(c["corpusSuppressed"])}`,
    );
    const ids = Array.isArray(pre["suppress"])
      ? pre["suppress"].flatMap((s) => (isRecord(s) && typeof s["id"] === "string" && s["id"].startsWith("corpus:") ? [s["id"]] : []))
      : [];
    if (ids.length > 0) out.push(`guard pre: suppressed corpus ids ${ids.join(", ")}`);
  }
  const post = readJson(paths.report);
  if (isRecord(post) && isRecord(post["counts"])) {
    const c = post["counts"];
    out.push(
      `guard post: ${num(c["findings"])} finding(s); ${num(c["filesScanned"])} files scanned, ${num(c["textUnits"])} text units, ` +
        `verbatim reported ${num(c["verbatimReported"])}, corpus units ${num(c["corpusUnits"])}, alias terms checked ${num(c["aliasTermsChecked"])}` +
        `${post["aliasesChecked"] === true ? "" : " (alias checks OFF)"}${post["verbatimChecked"] === true ? "" : " (verbatim OFF)"}`,
    );
  }
  const layer = readJson(join(paths.corpus, "layer", "layer.json"));
  if (isRecord(layer) && isRecord(layer["counts"])) {
    const c = layer["counts"];
    out.push(
      `layer: ${num(c["visibleShiurim"])} visible shiurim; topics ${num(c["topics"])}, concepts ${num(c["concepts"])}, people ${num(c["people"])}, ` +
        `works ${num(c["works"])}, stories ${num(c["stories"])}, threads ${num(c["threads"])}, series ${num(c["series"])}`,
    );
    const pages = isRecord(c["pages"]) ? c["pages"] : {};
    for (const site of ["quiet", "live"]) {
      const p = pages[site];
      if (isRecord(p)) out.push(`layer pages (${site}): ${Object.entries(p).map(([k, v]) => `${k} ${num(v)}`).join(", ")}`);
    }
    const notRead = Array.isArray(layer["notRead"]) ? layer["notRead"].filter((x): x is string => typeof x === "string") : [];
    out.push(`layer: files not read ${notRead.length === 0 ? "none" : notRead.join(", ")}`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------

export function main(argv: readonly string[], runner: Runner = spawnRunner, log: (s: string) => void = console.log): number {
  let opts: ChainOptions;
  try {
    opts = parseChainArgs(argv);
  } catch (e) {
    log(`site:chain: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
  mkdirSync(dirname(opts.report), { recursive: true });
  const steps = selectSteps(chainSteps({ report: opts.report, bundles: existsSync(join(REPO, BUNDLES_DIR)) }), opts.from, opts.to);
  let planted: Planted | null = null;
  const hooks: ChainHooks = {
    log,
    before: (id) => {
      if (id !== "guard-post" || !opts.plant) return;
      planted = plant(opts.plant, join(REPO, CORPUS_DIR), join(REPO, CORPUS_DATA_DIR));
      log(`site:chain: planted ${planted.what} in ${CORPUS_DIR}/${planted.file} (restored after guard post)`);
    },
    after: (id) => {
      if (id !== "guard-post" || !planted) return;
      planted.restore();
      log(`site:chain: restored ${CORPUS_DIR}/${planted.file}`);
      planted = null;
    },
  };
  const result = runSteps(steps, runner, chainEnv(process.env), hooks);
  const counts = countLines({ corpus: join(REPO, CORPUS_DIR), suppress: join(REPO, SUPPRESS_FILE), report: opts.report });
  log("\nsite:chain counts");
  for (const line of counts) log(`  ${line}`);
  const code = exitCode(result, opts.expectFailAt);
  const verdict =
    opts.expectFailAt === null
      ? result.failedAt === null
        ? `site:chain: green (${result.ran.join(" → ")})`
        : `site:chain: FAILED at ${result.failedAt}`
      : code === 0
        ? `site:chain self-test: failed at ${opts.expectFailAt}, as it must`
        : `site:chain self-test: expected a failure at ${opts.expectFailAt}, got ${result.failedAt ?? "a green run"}`;
  log(verdict);
  if (opts.summary) {
    const md = [`## site:chain${opts.plant ? ` (planted ${opts.plant})` : ""}`, "", verdict, "", ...counts.map((l) => `- ${l}`), ""].join("\n");
    appendFileSync(opts.summary, md);
  }
  return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
