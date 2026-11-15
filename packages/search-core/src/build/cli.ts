/**
 * search:build [--corpus <dir>] [--data-dir <dir>] [--policy-dir <dir>] [--no-keywords]
 *
 * Run after `corpus:build`. Reads `.corpus/` and `.corpus/layer/`, checks the layer's synonyms
 * against the entities' display fields (corpus data, read through @emunas/corpus's allow-listed
 * reader; `--no-keywords` skips that check), writes `.corpus/search/{docs,moments,entities}.ndjson`.
 * Relative paths resolve against INIT_CWD. Exit codes: 0 ok, 1 error, 2 usage.
 */
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT, defaultDataDir } from "@emunas/corpus/build";
import { writeSearchOutputs } from "./emit.ts";

function main(argv: string[]): number {
  let args;
  try {
    args = parseArgs({
      args: argv,
      options: {
        corpus: { type: "string" },
        "data-dir": { type: "string" },
        "policy-dir": { type: "string" },
        "no-keywords": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (e) {
    console.error(String((e as Error).message));
    return 2;
  }
  const v = args.values;
  if (v.help) {
    console.log("search:build [--corpus <dir>] [--data-dir <dir>] [--policy-dir <dir>] [--no-keywords]");
    return 0;
  }
  const base = process.env["INIT_CWD"] ?? process.cwd();
  const corpusDir = v.corpus ? resolve(base, v.corpus) : resolve(REPO_ROOT, ".corpus");
  const dataDir = v["no-keywords"] ? null : v["data-dir"] ? resolve(base, v["data-dir"]) : defaultDataDir();
  try {
    const t0 = performance.now();
    const opts: Parameters<typeof writeSearchOutputs>[0] = { corpusDir, dataDir };
    if (v["policy-dir"]) opts.policyDir = resolve(base, v["policy-dir"]);
    const r = writeSearchOutputs(opts);
    console.log(
      `search:build ${r.docs} docs (${r.keywordsFrom} with keywords), ${r.moments} moments, ${r.entities} entities; ` +
        `layer ${r.layer ? "on" : "off"}, synonyms ${r.synonymsChecked ? "checked" : "not checked"}; ` +
        `changed: ${r.written.join(", ") || "none"} in ${Math.round(performance.now() - t0)} ms`,
    );
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
