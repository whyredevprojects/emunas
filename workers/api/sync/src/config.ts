/**
 * Reads the emunas-api `wrangler.jsonc` (JSON with comments) for the names the sync needs per
 * environment: the search D1 database (name + id), the Vectorize index and EMBED_MODEL.
 */
import { readFileSync } from "node:fs";

/** Strip `//` and `/* *\/` comments outside strings, and trailing commas. */
export function parseJsonc(text: string): unknown {
  let out = "";
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    const next = text[i + 1];
    if (inStr) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i++;
      } else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    out += ch;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

export type SyncEnv = "production" | "staging";

export interface ApiResources {
  env: SyncEnv;
  d1Name: string;
  d1Id: string;
  migrationsDir: string;
  vectorIndex: string;
  embedModel: string;
}

interface WranglerShape {
  d1_databases?: { binding: string; database_name: string; database_id: string; migrations_dir?: string }[];
  vectorize?: { binding: string; index_name: string }[];
  vars?: Record<string, unknown>;
  env?: Record<string, WranglerShape>;
}

export function readApiResources(wranglerPath: string, env: SyncEnv): ApiResources {
  const root = parseJsonc(readFileSync(wranglerPath, "utf8")) as WranglerShape;
  const cfg = env === "production" ? root : root.env?.[env];
  if (!cfg) throw new Error(`no env.${env} in ${wranglerPath}`);
  const d1 = cfg.d1_databases?.find((d) => d.binding === "DB_SEARCH");
  const vec = cfg.vectorize?.find((v) => v.binding === "VEC");
  if (!d1) throw new Error(`no DB_SEARCH binding for ${env} in ${wranglerPath}`);
  if (!vec) throw new Error(`no VEC binding for ${env} in ${wranglerPath}`);
  const model = cfg.vars?.["EMBED_MODEL"] ?? root.vars?.["EMBED_MODEL"];
  return {
    env,
    d1Name: d1.database_name,
    d1Id: d1.database_id,
    migrationsDir: d1.migrations_dir ?? "migrations",
    vectorIndex: vec.index_name,
    embedModel: typeof model === "string" && model.length > 0 ? model : "@cf/baai/bge-m3",
  };
}
