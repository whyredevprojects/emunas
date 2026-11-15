/**
 * Search index sync CLI (W3.10). See ../README.md.
 *
 *   npm run sync -w @emunas/api -- [--corpus .corpus] [--env production|staging] [--remote]
 *        [--only d1|vectors] [--dry-run] [--migrate] [--model <id>] [--report <file>]
 *        [--persist-to <dir>] [--embedder fake|workers-ai] [--dims <n>] [--skip-guard] [--no-verbatim]
 *
 * Local (default): D1 through Miniflare in workers/api/.wrangler/state (what `wrangler dev`
 * reads), embeddings from a deterministic stand-in (or Workers AI with --embedder workers-ai and
 * credentials), cache and a Vectorize stand-in under .wrangler/state/emunas-sync/.
 * Remote (--remote): CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN; D1 and Vectorize of the
 * chosen env, Workers AI, cache in R2 `emunas-site-build` (EMUNAS_EMBED_BUCKET to override).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readApiResources, type SyncEnv } from "./config.ts";
import { FileVectorIndex, FsBlobStore, HashingEmbedder, MiniflareD1Target } from "./local.ts";
import { CloudflareApi, D1RestTarget, R2S3Store, VectorizeRestTarget, WorkersAiEmbedder, r2Credentials } from "./cloudflare.ts";
import { runSync, type SyncTargets } from "./sync.ts";
import { readSchemaVersion } from "./d1-sync.ts";
import { guardSyncInputs } from "./guard.ts";
import { readMomentsNdjson } from "./rows.ts";
import { vectorMetadataNdjson } from "./vector-sync.ts";
import type { Embedder } from "./embed.ts";

const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = resolve(API_DIR, "../..");

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      corpus: { type: "string", default: join(REPO, ".corpus") },
      env: { type: "string", default: "production" },
      remote: { type: "boolean", default: false },
      only: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      migrate: { type: "boolean", default: false },
      model: { type: "string" },
      embedder: { type: "string" },
      dims: { type: "string" },
      report: { type: "string" },
      "persist-to": { type: "string", default: join(API_DIR, ".wrangler/state") },
      "vector-meta-out": { type: "string" },
      "skip-guard": { type: "boolean", default: false },
      "no-verbatim": { type: "boolean", default: false },
    },
    strict: true,
  });
  const env = values.env as SyncEnv;
  if (env !== "production" && env !== "staging") throw new Error(`--env must be production or staging`);
  const only = values.only;
  if (only !== undefined && only !== "d1" && only !== "vectors") throw new Error(`--only must be d1 or vectors`);
  const res = readApiResources(join(API_DIR, "wrangler.jsonc"), env);
  const moments = join(values.corpus, "search/moments.ndjson");
  if (!existsSync(moments)) throw new Error(`${moments} not found: run corpus:build and search:build first`);
  const log = (m: string) => console.log(`[sync] ${m}`);
  const model = values.model ?? res.embedModel;

  // Read and validate the rows once; write the vector metadata the sync will upsert; run the
  // leak guard over both before anything is written anywhere.
  const rows = readMomentsNdjson(moments);
  const vectorMeta = values["vector-meta-out"] ?? join(values.corpus, "search/vector-meta.ndjson");
  mkdirSync(dirname(vectorMeta), { recursive: true });
  writeFileSync(vectorMeta, vectorMetadataNdjson(rows));
  if (!values["skip-guard"]) {
    const g = guardSyncInputs(REPO, values.corpus, [moments, vectorMeta], { verbatim: !values["no-verbatim"] });
    log(`guard: ${g.findings.length} findings${g.verbatimChecked ? " (verbatim scan on)" : " (keys and substrings only)"}`);
    if (g.findings.length > 0) {
      for (const f of g.findings.slice(0, 20)) console.error(`[sync] guard finding: ${JSON.stringify(f)}`);
      throw new Error("leak guard findings in the sync inputs; nothing was written");
    }
  }

  let targets: SyncTargets;
  if (values.remote) {
    const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"];
    const apiToken = process.env["CLOUDFLARE_API_TOKEN"];
    if (!accountId || !apiToken) throw new Error("--remote needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN");
    const api = new CloudflareApi({ accountId, apiToken });
    const bucket = process.env["EMUNAS_EMBED_BUCKET"] ?? "emunas-site-build";
    targets = {
      d1: only === "vectors" ? null : await D1RestTarget.byName(api, res.d1Name),
      vectors:
        only === "d1"
          ? null
          : {
              target: new VectorizeRestTarget(api, res.vectorIndex),
              embedder: new WorkersAiEmbedder(api, model),
              store: new R2S3Store(accountId, bucket, await r2Credentials(api, process.env)),
            },
    };
    log(`remote ${env}: D1 ${res.d1Name}, Vectorize ${res.vectorIndex}, model ${model}, cache R2 ${bucket}`);
  } else {
    const persistTo = resolve(values["persist-to"]);
    if (values.migrate) {
      execFileSync(
        "npx",
        ["wrangler", "d1", "migrations", "apply", res.d1Name, "--local", `--env=${env === "production" ? "" : env}`, "--persist-to", persistTo],
        { cwd: API_DIR, stdio: "inherit", env: { ...process.env, CI: "1" } },
      );
    }
    const d1 = only === "vectors" ? null : new MiniflareD1Target({ persistTo, databaseId: res.d1Id });
    if (d1 && (await readSchemaVersion(d1)) === null) {
      await d1.close();
      throw new Error(`local D1 ${res.d1Name} has no schema: run with --migrate (wrangler d1 migrations apply --local)`);
    }
    let embedder: Embedder;
    const kind = values.embedder ?? "fake";
    if (kind === "workers-ai") {
      const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"];
      const apiToken = process.env["CLOUDFLARE_API_TOKEN"];
      if (!accountId || !apiToken) throw new Error("--embedder workers-ai needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN");
      embedder = new WorkersAiEmbedder(new CloudflareApi({ accountId, apiToken }), model);
    } else if (kind === "fake") {
      embedder = new HashingEmbedder(values.dims ? Number(values.dims) : 1024);
    } else throw new Error(`--embedder must be fake or workers-ai`);
    const syncDir = join(persistTo, "emunas-sync");
    targets = {
      d1,
      vectors:
        only === "d1"
          ? null
          : {
              target: new FileVectorIndex(join(syncDir, `vectorize-${res.vectorIndex}.json`), res.vectorIndex),
              embedder,
              store: new FsBlobStore(join(syncDir, "cache")),
            },
    };
    log(`local ${env}: D1 ${res.d1Name} (${res.d1Id}) in ${persistTo}, index stand-in ${res.vectorIndex}, embedder ${embedder.model}`);
  }

  try {
    const report = await runSync({ moments: rows, targets, dryRun: values["dry-run"], vectorMetaOut: null, log });
    const summary = {
      moments: report.moments,
      d1: report.d1 && { ...report.d1, shiurim: report.d1.shiurim.length },
      vectors: report.vectors && { ...report.vectors, skipped: report.vectors.skipped.length },
    };
    console.log(JSON.stringify(summary, null, 2));
    if (values.report) {
      mkdirSync(dirname(values.report), { recursive: true });
      writeFileSync(values.report, `${JSON.stringify(report, null, 2)}\n`);
    }
    return 0;
  } finally {
    await targets.d1?.close();
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`[sync] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
