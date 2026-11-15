/**
 * The `prerender` and `buildEnd` hooks of `react-router.config.ts` (W4.5). Route lists come from
 * `.corpus/` (series.json, occasions/entities.json, works.json, index.json), not from page
 * components, so they do not depend on the page packages.
 */
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findCorpusDir, readDataFileSet, readSeoCorpus } from "./corpus.server.ts";
import { isDeployBuild, seoHosts, type Env } from "./env.ts";
import { prerenderPaths, todayPaths } from "./model.ts";
import { postBuild, type SeoFinding } from "./check.server.ts";

/** `apps/live`. */
export const APP_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

export interface PrerenderOptions {
  env?: Env;
  appDir?: string;
  log?: (msg: string) => void;
}

/** The prerender path list. Without a corpus: Today only (a deploy build fails instead). */
export function livePrerenderPaths(opts: PrerenderOptions = {}): string[] {
  const env = opts.env ?? process.env;
  const appDir = opts.appDir ?? APP_DIR;
  const log = opts.log ?? ((m: string) => console.warn(m));
  const dir = findCorpusDir(env, appDir);
  if (dir === null) {
    if (isDeployBuild(env)) throw new Error("[live seo] no .corpus/ found (run corpus:build first)");
    log("[live seo] no .corpus/ found: prerendering Today only");
    return todayPaths();
  }
  const dataFiles = readDataFileSet(join(appDir, "public", "data"));
  const { paths, skipped } = prerenderPaths(readSeoCorpus(dir), dataFiles);
  if (dataFiles === null) log("[live seo] no public/data/ tree: route list not checked against data files");
  if (skipped.length) log(`[live seo] ${skipped.length} routes skipped (no data file), e.g. ${skipped.slice(0, 3).join(", ")}`);
  return paths;
}

export interface BuildEndArgs {
  reactRouterConfig: {
    appDirectory: string;
    buildDirectory: string;
    routes: Readonly<Record<string, { id: string; file: string }>>;
  };
}

function format(fs: readonly SeoFinding[], max = 25): string {
  const lines = fs.slice(0, max).map((f) => `  ${f.file}: ${f.problem}`);
  if (fs.length > max) lines.push(`  … and ${fs.length - max} more`);
  return lines.join("\n");
}

/** Writes robots.txt, drops unused `.data` files, checks every prerendered page and the file budget. */
export function liveBuildEnd(args: BuildEndArgs, env: Env = process.env, log = (m: string) => console.log(m)): void {
  const { appDirectory, buildDirectory, routes } = args.reactRouterConfig;
  const hosts = seoHosts(env);
  const routeFiles = Object.values(routes)
    .filter((r) => r.id !== "root")
    .map((r) => resolve(appDirectory, r.file));
  const r = postBuild({ clientDir: join(buildDirectory, "client"), hosts, routeFiles });
  log(
    `[live seo] ${r.pages} prerendered pages checked (${r.flattened} moved to <path>.html), ` +
      `${r.removedDataFiles} .data files removed, ` +
      `${r.files} files in build/client` +
      (hosts ? `, canonical → ${hosts.quiet}` : " (no hosts configured: no canonical/hreflang emitted)"),
  );
  if (r.warnings.length) log(`[live seo] warnings:\n${format(r.warnings)}`);
  if (r.findings.length) throw new Error(`[live seo] ${r.findings.length} problem(s):\n${format(r.findings)}`);
}
