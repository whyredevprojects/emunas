/**
 * Vitest globalSetup for the `site` project: builds the two real-data Quiet sites once per run, before
 * any test file starts, and hands their paths to the tests through `inject`.
 *
 * A full three-edition build of the real corpus takes minutes, and every build of apps/quiet shares
 * apps/quiet/.astro/, so builds can only run one at a time. When each test file ran its own build,
 * the files queued on the build lock and the wait counted against their `beforeAll` timeout. Here the
 * builds run once, outside any test timeout, and the files only read the output.
 *
 * - `quietSite`: the repository's data with the default settings (local hosts, no deploy flags).
 * - `quietSeoSite`: the same data with production hosts and a media origin, for the SEO checks.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";
import { astroBuild } from "./astro-build.ts";

export interface BuiltSite {
  corpus: string;
  dist: string;
}

/** Production hosts of the `quietSeoSite` build. */
export const SEO_SITE = {
  domain: "emunas.example",
  feedbackEmail: "errors@emunas.example",
  mediaOrigin: "https://media.example.org",
} as const;

declare module "vitest" {
  export interface ProvidedContext {
    quietSite: BuiltSite;
    quietSeoSite: BuiltSite;
  }
}

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(app, "..", "..");

/** Settings every build here pins, so a caller's shell cannot change what the tests see. */
const PINNED = { EMUNAS_DEPLOY: "", EMUNAS_TRANSCRIPT_VIEW: "", EMUNAS_SHELL_SAMPLE: "" };

function build(root: string, corpusArgs: string[], siteEnv: Record<string, string>): BuiltSite {
  const corpus = join(root, "corpus");
  const dist = join(root, "dist");
  const tsx = join(repo, "node_modules", ".bin", "tsx");
  const c = spawnSync(tsx, [join(repo, "packages", "corpus", "src", "cli.ts"), "--out", corpus, ...corpusArgs], {
    cwd: repo,
    env: { ...process.env, INIT_CWD: repo, ...PINNED },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (c.status !== 0) throw new Error(`corpus:build failed:\n${c.stdout}\n${c.stderr}`);
  const b = astroBuild(app, dist, { EMUNAS_CORPUS_DIR: corpus, ...PINNED, ...siteEnv });
  if (b.status !== 0) throw new Error(`astro build failed:\n${b.stdout.slice(-4000)}\n${b.stderr.slice(-4000)}`);
  return { corpus, dist };
}

export function setup(project: TestProject): () => void {
  const work = mkdtempSync(join(tmpdir(), "quiet-site-builds-"));
  try {
    project.provide("quietSite", build(join(work, "default"), [], {}));
    project.provide(
      "quietSeoSite",
      build(join(work, "seo"), ["--media-origin", SEO_SITE.mediaOrigin], {
        EMUNAS_DOMAIN: SEO_SITE.domain,
        EMUNAS_FEEDBACK_EMAIL: SEO_SITE.feedbackEmail,
        // Never let a caller's own host settings leak into this build.
        EMUNAS_HOME_ORIGIN: "",
        EMUNAS_QUIET_ORIGIN: "",
        EMUNAS_LIVE_ORIGIN: "",
        EMUNAS_WORKERS_SUBDOMAIN: "",
        EMUNAS_STAGE: "",
      }),
    );
  } catch (e) {
    rmSync(work, { recursive: true, force: true });
    throw e;
  }
  return () => rmSync(work, { recursive: true, force: true });
}
