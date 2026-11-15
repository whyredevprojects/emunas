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
 * Fails when the client build is missing or has no SPA fallback page (the offline navigation target).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import { SPA_FALLBACK, selectPrecache } from "./src/precache.ts";

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
    hash.update(readFileSync(join(clientDir, decodeURIComponent(p.slice(1)))));
    hash.update("\0");
  }
  return { version: hash.digest("hex").slice(0, 16), precache };
}

export async function buildServiceWorker(clientDir: string): Promise<ShellManifest> {
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
