/**
 * Runs `astro build` for the home app from a unit test, one build at a time.
 *
 * Every build of an Astro app writes its prerender chunks to <app>/.astro/, whatever
 * --outDir is. Vitest runs test files in parallel, so two test files that each build the
 * site (here: site.build.test.ts and anything added later) would delete each other's chunks
 * mid-build. This helper holds a directory lock around the build so they take turns.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const STALE_MS = 15 * 60_000;
const POLL_MS = 250;

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquire(lock: string): void {
  for (;;) {
    try {
      mkdirSync(lock);
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      try {
        if (Date.now() - statSync(lock).mtimeMs > STALE_MS) rmSync(lock, { recursive: true, force: true });
      } catch {
        // The holder released it between our checks; try again.
      }
      sleep(POLL_MS);
    }
  }
}

/** `astro build --outDir <outDir>` in `appDir` with extra env, serialized across processes. */
export function astroBuild(appDir: string, outDir: string, env: Record<string, string>): SpawnSyncReturns<string> {
  const astro = join(dirname(require.resolve("astro/package.json")), "bin", "astro.mjs");
  const key = createHash("sha256").update(appDir).digest("hex").slice(0, 16);
  const lock = join(tmpdir(), `emunas-astro-build-${key}.lock`);
  acquire(lock);
  try {
    return spawnSync(process.execPath, [astro, "build", "--outDir", outDir], {
      cwd: appDir,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", ...env },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
