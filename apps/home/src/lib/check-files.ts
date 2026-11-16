/**
 * Build check: every `/files/...` link in the built site must be a file in
 * src/data/legacy-files.json (so the Worker can serve it from R2). Runs as an Astro integration
 * at `astro:build:done` and fails the build on a missing manifest or an unknown path.
 *
 * Node-only (reads dist/ and the manifest from disk); never imported by pages.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { parseLegacyFiles } from "./legacy-schema.ts";

/** `/files/...` URLs in `href`/`src` attributes (root-relative or on any origin). */
export function fileLinks(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/\s(?:href|src)=(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/g)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? "";
    const path = raw.replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "");
    if (path.startsWith("/files/") || path === "/files") out.push(path);
  }
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export interface CheckResult {
  readonly pages: number;
  readonly links: number;
  readonly missing: readonly string[];
}

/** Checks every HTML file under `dist` against the manifest at `manifestPath`. */
export function checkFiles(dist: string, manifestPath: string): CheckResult {
  if (!existsSync(manifestPath)) throw new Error(`home: ${manifestPath} is missing; the /files/ links cannot be checked`);
  const known = new Set(parseLegacyFiles(JSON.parse(readFileSync(manifestPath, "utf8")) as unknown).map((f) => f.path));
  const missing = new Set<string>();
  let pages = 0;
  let links = 0;
  for (const file of walk(dist).filter((f) => f.endsWith(".html"))) {
    pages++;
    for (const link of fileLinks(readFileSync(file, "utf8"))) {
      links++;
      if (!known.has(link)) missing.add(`${link} (in ${file.slice(dist.length + 1)})`);
    }
  }
  return { pages, links, missing: [...missing].sort() };
}

export function checkFilesIntegration(): AstroIntegration {
  let root = "";
  return {
    name: "emunas-home:check-files",
    hooks: {
      "astro:config:done": ({ config }) => {
        root = fileURLToPath(config.root);
      },
      "astro:build:done": ({ dir, logger }) => {
        const r = checkFiles(fileURLToPath(dir), join(root, "src", "data", "legacy-files.json"));
        if (r.missing.length > 0) {
          throw new Error(`home: ${r.missing.length} /files/ link(s) not in legacy-files.json:\n  ${r.missing.join("\n  ")}`);
        }
        logger.info(`/files/ links: ${r.links} on ${r.pages} pages, all in legacy-files.json`);
      },
    },
  };
}
