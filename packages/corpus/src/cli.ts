/**
 * corpus:build [--data-dir <dir>] [--out <dir>] [--suppress <file>] [--policy-dir <dir>] [--media-origin <url>] [--deploy] [--force]
 *
 * From the repo root: `npm run corpus:build -- --suppress .corpus/suppress.json`.
 * Relative paths resolve against the directory npm was started from (INIT_CWD), so the command
 * behaves the same from the root or from packages/corpus. Defaults: data dir `EMUNAS_DATA_DIR` or
 * `<repo>/data`, out `<repo>/.corpus`, policy `<repo>/site-policy`, media origin `EMUNAS_MEDIA_ORIGIN` or
 * the dev placeholder `https://media.example.invalid` (Amendment A1).
 *
 * The placeholder is fine for dev and for CI checks, but a deploy build must never ship it: when
 * `CI=true` and the build is a deploy (`--deploy`, or env `EMUNAS_DEPLOY=1`/`true`), a placeholder
 * media origin is a fatal error instead of a build-report warning.
 *
 * Exit codes: 0 ok, 1 fatal error (invalid ingest/manifest/policy or media origin), 2 usage.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { buildCorpusWithAggregates } from "./aggregate/build.ts";
import { resolveMediaOrigin } from "./build/index.ts";

const USAGE =
  "corpus:build [--data-dir <dir>] [--out <dir>] [--suppress <file>] [--policy-dir <dir>] [--media-origin <url>] [--deploy] [--force]";

function truthy(v: string | undefined): boolean {
  return v !== undefined && /^(?:1|true|yes)$/i.test(v.trim());
}

/** True when this run is a CI deploy build (CI=true and `--deploy` or `EMUNAS_DEPLOY`). */
export function isCiDeploy(env: NodeJS.ProcessEnv, deployFlag: boolean): boolean {
  return truthy(env["CI"]) && (deployFlag || truthy(env["EMUNAS_DEPLOY"]));
}

/**
 * Resolves the media origin like the build does and returns an error message when a CI deploy
 * would use the dev placeholder (or `null` when the build may go ahead). Throws on an invalid origin.
 */
export function mediaOriginError(env: NodeJS.ProcessEnv, deployFlag: boolean, mediaOrigin?: string): string | null {
  const media = resolveMediaOrigin(mediaOrigin);
  if (!media.placeholder || !isCiDeploy(env, deployFlag)) return null;
  return (
    `media origin is the dev placeholder ${media.origin}; a deploy build needs EMUNAS_MEDIA_ORIGIN ` +
    "(or --media-origin) set to the real media host (Amendment A1)"
  );
}

function main(argv: string[]): number {
  let args;
  try {
    args = parseArgs({
      args: argv,
      options: {
        "data-dir": { type: "string" },
        out: { type: "string" },
        suppress: { type: "string" },
        "policy-dir": { type: "string" },
        "media-origin": { type: "string" },
        deploy: { type: "boolean", default: false },
        force: { type: "boolean", default: false },
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
    console.log(USAGE);
    return 0;
  }
  const base = process.env["INIT_CWD"] ?? process.cwd();
  const abs = (p: string | undefined) => (p === undefined ? undefined : resolve(base, p));
  try {
    const originError = mediaOriginError(process.env, v.deploy, v["media-origin"]);
    if (originError !== null) {
      console.error(`corpus:build failed: ${originError}`);
      return 1;
    }
    const opts: Parameters<typeof buildCorpusWithAggregates>[0] = { force: v.force, log: (l) => console.log(l) };
    const dataDir = abs(v["data-dir"]);
    const outDir = abs(v.out);
    const suppressFile = abs(v.suppress);
    const policyDir = abs(v["policy-dir"]);
    if (dataDir) opts.dataDir = dataDir;
    if (outDir) opts.outDir = outDir;
    if (suppressFile) opts.suppressFile = suppressFile;
    if (policyDir) opts.policyDir = policyDir;
    if (v["media-origin"] !== undefined) opts.mediaOrigin = v["media-origin"];
    const r = buildCorpusWithAggregates(opts);
    const rep = r.report;
    console.log(`audio: media origin ${r.info.mediaOrigin}`);
    console.log(
      `report: ${rep.downgraded.length} downgraded, ${rep.notDoneWithFiles.length} mid-flight, ` +
        `${rep.dropped.lowConfidence} low-confidence dropped, ${rep.dropped.unresolvedSourcesWithoutWork} unresolved sources dropped, ` +
        `${rep.suppressed.length} suppressed, ${rep.timeWarnings.length} time warnings`,
    );
    for (const d of rep.downgraded) console.log(`  downgraded ${d.id}: ${d.reasons.join("; ")}`);
    return 0;
  } catch (e) {
    console.error(`corpus:build failed: ${(e as Error).message}`);
    return 1;
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) {
  process.exitCode = main(process.argv.slice(2));
}
