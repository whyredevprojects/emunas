/**
 * Embedding model eval (O10): bge-m3 vs qwen3-embedding-0.6b on the 60 queries.
 *
 *   npx tsx apps/live/tests/eval/run.ts [--embedder workers-ai|fake] [--models a,b] [--corpus .corpus]
 *        [--cache <dir> | --r2] [--out apps/live/tests/eval] [--baseline <report.json>] [--refresh]
 *
 * --embedder workers-ai (needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN) is the real eval;
 * --embedder fake runs the deterministic hashing stand-in (pipeline check only, no model claim).
 * --r2 reads/writes the embedding cache in R2 emunas-site-build (shared with the sync, so the
 * chosen model's vectors are already cached for the first sync).
 * --baseline fails (exit 1) on a drop of more than 5 points in recall@10 or MRR (W5.1 gate).
 * --refresh re-resolves the expected shiur ids from the selectors and rewrites queries.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readMomentsNdjson } from "../../../../workers/api/sync/src/rows.ts";
import { FsBlobStore, HashingEmbedder } from "../../../../workers/api/sync/src/local.ts";
import { CloudflareApi, R2S3Store, WorkersAiEmbedder, r2Credentials } from "../../../../workers/api/sync/src/cloudflare.ts";
import type { BlobStore, Embedder } from "../../../../workers/api/sync/src/embed.ts";
import { chooseModel, evaluateModel, regressions, resolveExpected, type ModelResult, type QueriesFile } from "./eval.ts";
import { renderReport } from "./report.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../..");
export const DEFAULT_MODELS = ["@cf/baai/bge-m3", "@cf/qwen/qwen3-embedding-0.6b"];

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      corpus: { type: "string", default: join(REPO, ".corpus") },
      queries: { type: "string", default: join(HERE, "queries.json") },
      embedder: { type: "string", default: "fake" },
      models: { type: "string" },
      cache: { type: "string", default: join(REPO, "workers/api/.wrangler/state/emunas-sync/cache") },
      r2: { type: "boolean", default: false },
      out: { type: "string", default: HERE },
      baseline: { type: "string" },
      refresh: { type: "boolean", default: false },
    },
    strict: true,
  });
  const log = (m: string) => console.log(`[eval] ${m}`);
  const rows = readMomentsNdjson(join(values.corpus, "search/moments.ndjson"));
  const file = JSON.parse(readFileSync(values.queries, "utf8")) as QueriesFile;

  if (values.refresh) {
    for (const q of file.queries) {
      q.expected = resolveExpected(q.select, rows);
      if (q.expected.length === 0) throw new Error(`query ${q.id} resolves to no shiur`);
    }
    writeFileSync(values.queries, `${JSON.stringify(file, null, 2)}\n`);
    log(`refreshed expected ids for ${file.queries.length} queries`);
    return 0;
  }

  const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"];
  const apiToken = process.env["CLOUDFLARE_API_TOKEN"];
  const api = accountId && apiToken ? new CloudflareApi({ accountId, apiToken }) : null;
  let store: BlobStore;
  if (values.r2) {
    if (!api || !accountId) throw new Error("--r2 needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN");
    store = new R2S3Store(accountId, process.env["EMUNAS_EMBED_BUCKET"] ?? "emunas-site-build", await r2Credentials(api, process.env));
  } else store = new FsBlobStore(values.cache);

  let embedders: Embedder[];
  if (values.embedder === "workers-ai") {
    if (!api) throw new Error("--embedder workers-ai needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN");
    embedders = (values.models?.split(",") ?? DEFAULT_MODELS).map((m) => new WorkersAiEmbedder(api, m.trim()));
  } else if (values.embedder === "fake") {
    embedders = [new HashingEmbedder(1024)];
  } else throw new Error("--embedder must be workers-ai or fake");

  const results: ModelResult[] = [];
  for (const e of embedders) results.push(await evaluateModel(rows, file.queries, e, store, log));
  const chosen = chooseModel(results);
  const real = values.embedder === "workers-ai";
  const report = { generatedAt: new Date().toISOString(), real, moments: rows.length, chosen: real ? chosen?.model ?? null : null, results };
  mkdirSync(values.out, { recursive: true });
  writeFileSync(join(values.out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(values.out, "report.md"), renderReport(report));
  for (const r of results) log(`${r.model}: recall@10 ${r.summary.all.recall10}, MRR ${r.summary.all.mrr}`);

  if (values.baseline) {
    if (!existsSync(values.baseline)) throw new Error(`baseline ${values.baseline} not found`);
    const base = JSON.parse(readFileSync(values.baseline, "utf8")) as { results: ModelResult[] };
    const drops = regressions(base.results, results);
    for (const d of drops) log(`REGRESSION ${d.model} ${d.set} ${d.metric}: ${d.before} → ${d.after}`);
    if (drops.length > 0) return 1;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`[eval] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
