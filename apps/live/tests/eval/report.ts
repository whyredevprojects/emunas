import type { ModelResult } from "./eval.ts";

export interface EvalReport {
  generatedAt: string;
  /** True when real Workers AI models were evaluated. */
  real: boolean;
  moments: number;
  chosen: string | null;
  results: ModelResult[];
}

const pct = (x: number) => (x * 100).toFixed(1);

/** The committed Markdown report (O10 decision record). */
export function renderReport(r: EvalReport): string {
  const lines: string[] = [];
  lines.push("# Embedding model eval (O10)", "");
  lines.push(`Generated ${r.generatedAt} over ${r.moments} moment rows; 60 queries (20 en, 20 yi, 20 cross-language/transliteration).`, "");
  if (!r.real) {
    lines.push(
      "**Stand-in run, not a model comparison.** These numbers come from the deterministic hashing embedder",
      "(`fake/hashing-trigram-1024`), which only proves the eval pipeline end to end. bge-m3 and qwen3-embedding-0.6b",
      "have not been run yet because this workspace has no Cloudflare credentials. Run",
      "`npx tsx apps/live/tests/eval/run.ts --embedder workers-ai --r2` with CLOUDFLARE_ACCOUNT_ID and",
      "CLOUDFLARE_API_TOKEN set, then commit the regenerated report.",
      "",
    );
  }
  lines.push("| model | set | recall@10 | MRR |", "|---|---|---|---|");
  for (const m of r.results) {
    for (const set of ["en", "yi", "cross", "all"] as const) {
      const s = m.summary[set];
      lines.push(`| ${m.model} | ${set} (${s.queries}) | ${pct(s.recall10)} | ${pct(s.mrr)} |`);
    }
  }
  lines.push("", "## Decision O10", "");
  if (r.real && r.chosen) {
    lines.push(`Chosen embedding model: **${r.chosen}** (best overall recall@10 + MRR; Yiddish MRR breaks ties).`);
    lines.push("Set `EMBED_MODEL` in workers/api/wrangler.jsonc to this model before the first production sync.");
  } else {
    lines.push(
      "Pending the real run. Until then the plan default stands: **@cf/baai/bge-m3** (integration-plan §6 O10,",
      "tech-live §5.3), which is what `EMBED_MODEL` in workers/api/wrangler.jsonc already names. Both candidates",
      "have 1,024 dimensions, so the Vectorize index does not change if qwen3 wins; the sync then re-embeds",
      "everything (a model change rewrites every vector).",
    );
  }
  lines.push("", "## Per query", "", "| id | set | query | expected | recall@10 | first hit |", "|---|---|---|---|---|---|");
  const first = r.results[0];
  if (first) {
    for (const q of first.queries) {
      const hits = r.results.map((m) => m.queries.find((x) => x.id === q.id)!);
      lines.push(
        `| ${q.id} | ${q.set} | ${q.q.replaceAll("|", "\\|")} | ${q.expected} | ${hits.map((h) => pct(h.recall10)).join(" / ")} | ${hits.map((h) => h.firstHit ?? "–").join(" / ")} |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}
