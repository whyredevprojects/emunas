/**
 * Live data build CLI (W3.6). Run from apps/live (`npm run data:build -w @emunas/live`) after
 * `corpus:build`:
 *
 *   emit     [--corpus <dir>] [--out <dir>] [--generated-at <iso>]   .corpus/ → public/data/ (validated)
 *   validate [--data <dir>]                                          every file against its contract schema
 *   budgets  [--data <dir>] [--client <dir>] [--public <dir>]        file counts and sizes (tech-live §3.3)
 *
 * Defaults: corpus `<repo>/.corpus`, data `apps/live/public/data`, client `apps/live/build/client`,
 * public `apps/live/public`. `--generated-at` defaults to SOURCE_DATE_EPOCH, else now.
 * Relative paths resolve against INIT_CWD (the directory npm was started from).
 * Exit codes: 0 ok, 1 invalid files or budget overrun or missing input, 2 usage.
 */
import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { walkFiles } from "@emunas/corpus-guard/budgets";
import { checkLiveBudgets, describeFinding } from "./budgets.ts";
import { readCorpusInput } from "./corpus-input.ts";
import { emitLiveData } from "./emit.ts";
import { validateFile, type ValidationIssue } from "./schemas.ts";
import { writeDataDir } from "./write.ts";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(APP, "../..");
const BASE = process.env["INIT_CWD"] ?? process.cwd();

export const DEFAULTS = {
  corpus: resolve(REPO, ".corpus"),
  data: resolve(APP, "public/data"),
  public: resolve(APP, "public"),
  client: resolve(APP, "build/client"),
};

function generatedAtDefault(): string {
  const epoch = process.env["SOURCE_DATE_EPOCH"];
  if (epoch && /^\d+$/.test(epoch)) return new Date(Number(epoch) * 1000).toISOString();
  return new Date().toISOString();
}

function printIssues(issues: ValidationIssue[]): void {
  for (const i of issues.slice(0, 20)) {
    console.error(`invalid ${i.file}: ${i.issues.map((x) => `${x.path || "(root)"} ${x.message}`).join("; ")}`);
  }
  if (issues.length > 20) console.error(`… and ${issues.length - 20} more invalid files`);
}

export function main(argv: string[]): number {
  const [command, ...rest] = argv;
  let args;
  try {
    args = parseArgs({
      args: rest,
      options: {
        corpus: { type: "string" },
        out: { type: "string" },
        data: { type: "string" },
        client: { type: "string" },
        public: { type: "string" },
        "generated-at": { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  const v = args.values;
  const abs = (p: string | undefined, d: string) => (p === undefined ? d : resolve(BASE, p));

  switch (command) {
    case "emit": {
      const t0 = performance.now();
      const corpusDir = abs(v.corpus, DEFAULTS.corpus);
      const out = abs(v.out ?? v.data, DEFAULTS.data);
      const generatedAt = v["generated-at"] ?? generatedAtDefault();
      if (Number.isNaN(Date.parse(generatedAt))) {
        console.error(`--generated-at is not a date: ${generatedAt}`);
        return 2;
      }
      let input;
      try {
        input = readCorpusInput(corpusDir);
      } catch (e) {
        console.error((e as Error).message);
        return 1;
      }
      const files = emitLiveData(input, { generatedAt: new Date(generatedAt).toISOString() });
      const invalid = [...files].flatMap(([f, body]) => validateFile(f, body) ?? []);
      if (invalid.length > 0) {
        printIssues(invalid);
        console.error(`data:build: ${invalid.length} emitted files do not match the data contract; nothing written`);
        return 1;
      }
      const r = writeDataDir(out, files);
      const ms = Math.round(performance.now() - t0);
      console.log(
        `data:build ${files.size} files (${input.info.counts.full} of ${input.info.counts.total} shiurim summarized): ` +
          `wrote ${r.written.length}, unchanged ${r.unchanged}, removed ${r.removed.length} → ${relative(BASE, out) || "."} in ${ms} ms`,
      );
      return 0;
    }
    case "validate": {
      const dataDir = abs(v.data, DEFAULTS.data);
      const invalid: ValidationIssue[] = [];
      let n = 0;
      for (const path of walkFiles(dataDir)) {
        n++;
        const file = relative(dataDir, path).split(sep).join("/");
        let body: unknown;
        try {
          body = JSON.parse(readFileSync(path, "utf8"));
        } catch {
          invalid.push({ file, issues: [{ path: "", message: "not JSON" }] });
          continue;
        }
        const issue = validateFile(file, body);
        if (issue) invalid.push(issue);
      }
      printIssues(invalid);
      console.log(`data:validate ${n} files, ${invalid.length} invalid`);
      return invalid.length > 0 ? 1 : 0;
    }
    case "budgets": {
      const r = checkLiveBudgets({
        dataDir: abs(v.data, DEFAULTS.data),
        publicDir: abs(v.public, DEFAULTS.public),
        clientDir: abs(v.client, DEFAULTS.client),
      });
      const kb = (n: number) => `${(n / 1024).toFixed(1)} KiB`;
      for (const [kind, st] of Object.entries(r.byKind)) {
        console.log(
          `  ${kind.padEnd(10)} ${String(st.files).padStart(5)} files  ${kb(st.bytes).padStart(12)} raw  ${kb(st.brBytes).padStart(11)} br` +
            (st.maxBr ? `  largest ${kb(st.maxBr.brBytes)} br (${st.maxBr.file})` : ""),
        );
      }
      console.log(
        `data:budgets ${r.dataFiles} data files; ` +
          (r.clientFiles !== null
            ? `${r.clientFiles} files in build/client`
            : `${r.projectedFiles} projected with prerender`) +
          `; ${r.findings.length} findings, ${r.warnings.length} warnings`,
      );
      for (const w of r.warnings) console.warn(`  warning: ${describeFinding(w)}`);
      for (const f of r.findings) console.error(`  over budget: ${describeFinding(f)}`);
      return r.findings.length > 0 ? 1 : 0;
    }
    default:
      console.error("usage: data-build/cli.ts <emit|validate|budgets> [options]");
      return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
