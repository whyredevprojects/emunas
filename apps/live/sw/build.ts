/**
 * Builds the Live service worker into `build/client/sw.js`, after `react-router build`:
 *
 *   tsx sw/build.ts [clientDir]          (default: apps/live/build/client)
 *
 * 1. Lists the client build and picks the app shell (`src/precache.ts`).
 * 2. Hashes those files (path + content) into the version that names the shell cache, so every
 *    deploy that changes the shell installs a new worker and drops the old shell cache.
 * 3. Bundles `src/sw.ts` with Vite into one classic script with the list and version inlined.
 *
 * Before 1, copies React Router's SPA fallback (`index.html`) to `__spa-fallback.html`, so the host
 * serves it at `/__spa-fallback` without a redirect (see `SPA_FALLBACK` in `src/precache.ts`).
 *
 * Fails when the client build is missing or has no SPA fallback page (the offline navigation target).
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import { SPA_FALLBACK, SPA_FALLBACK_FILE, SPA_FALLBACK_SOURCE, precacheFile, selectPrecache } from "./src/precache.ts";

const swDir = fileURLToPath(new URL(".", import.meta.url));

export const SW_FILE = "sw.js";

function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(root, p).split(sep).join("/"));
    }
  };
  walk(root);
  return out;
}

export interface ShellManifest {
  version: string;
  precache: string[];
}

/** The precache list and its version for a client build directory. */
export function shellManifest(clientDir: string): ShellManifest {
  if (!existsSync(clientDir)) throw new Error(`client build not found: ${clientDir}`);
  const precache = selectPrecache(listFiles(clientDir).filter((f) => f !== SW_FILE));
  if (!precache.includes(SPA_FALLBACK)) {
    throw new Error(`${SPA_FALLBACK} missing from ${clientDir}: the worker needs it for offline navigation`);
  }
  const hash = createHash("sha256");
  for (const p of precache) {
    hash.update(p);
    hash.update("\0");
    hash.update(readFileSync(join(clientDir, precacheFile(p))));
    hash.update("\0");
  }
  return { version: hash.digest("hex").slice(0, 16), precache };
}

/** Copies React Router's SPA fallback to the file the host serves at `SPA_FALLBACK` (see precache.ts). */
export function writeSpaFallback(clientDir: string): void {
  const source = join(clientDir, SPA_FALLBACK_SOURCE);
  if (existsSync(source)) copyFileSync(source, join(clientDir, SPA_FALLBACK_FILE));
}

export async function buildServiceWorker(clientDir: string): Promise<ShellManifest> {
  if (existsSync(clientDir)) writeSpaFallback(clientDir);
  const manifest = shellManifest(clientDir);
  await build({
    configFile: false,
    logLevel: "warn",
    root: swDir,
    define: {
      __SW_VERSION__: JSON.stringify(manifest.version),
      __SW_PRECACHE__: JSON.stringify(manifest.precache),
      __SW_FALLBACK__: JSON.stringify(SPA_FALLBACK),
    },
    build: {
      outDir: clientDir,
      emptyOutDir: false,
      copyPublicDir: false,
      minify: true,
      sourcemap: false,
      target: "es2022",
      lib: {
        entry: join(swDir, "src", "sw.ts"),
        formats: ["iife"],
        name: "emunasLiveSw",
        fileName: () => SW_FILE,
      },
    },
  });
  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const clientDir = resolve(process.argv[2] ?? join(swDir, "..", "build", "client"));
  const m = await buildServiceWorker(clientDir);
  console.log(`sw.js: version ${m.version}, ${m.precache.length} precached files`);
}
