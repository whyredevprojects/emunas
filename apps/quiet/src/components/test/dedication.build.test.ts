/**
 * The dedication (corpus-wave-plan F.3) on a real build: `corpus:build` over the corpus package's
 * mini fixture (every page template, both editions) into a temporary `.corpus/`, then `astro build`
 * with the shell sample on. Every built HTML file (edition pages, the edition chooser, the 404 page)
 * carries `לעילוי נשמת אשר בן ישראל` exactly once, as the last line of its footer, in Hebrew
 * (`lang="he"`, `dir="rtl"`), with no link or image in that line.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { astroBuild } from "../../../test/astro-build.ts";
import { DEDICATION } from "../dedication.ts";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..", "..", "..");
const repo = join(app, "..", "..");

let work = "";
let dist = "";

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "quiet-dedication-"));
  const corpus = join(work, ".corpus");
  dist = join(work, "dist");
  const mini = join(repo, "packages", "corpus", "test", "fixtures", "mini");
  const args = [
    require.resolve("tsx/cli"),
    join(repo, "packages", "corpus", "src", "cli.ts"),
    "--data-dir",
    join(mini, "data"),
    "--out",
    corpus,
    "--policy-dir",
    join(mini, "site-policy"),
  ];
  const c = spawnSync(process.execPath, args, { cwd: repo, encoding: "utf8", env: { ...process.env, INIT_CWD: repo, EMUNAS_DEPLOY: "" } });
  if (c.status !== 0) throw new Error(`corpus:build failed:\n${c.stdout}\n${c.stderr}`);
  const b = astroBuild(app, dist, { EMUNAS_CORPUS_DIR: corpus, EMUNAS_SHELL_SAMPLE: "1" });
  if (b.status !== 0) throw new Error(`astro build failed:\n${b.stdout.slice(-4000)}\n${b.stderr.slice(-4000)}`);
}, 300_000);

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Every built HTML file, as a dist-relative path. */
function htmlFiles(): string[] {
  return walk(dist)
    .filter((f) => f.endsWith(".html"))
    .map((f) => relative(dist, f).split(sep).join("/"))
    .sort();
}

/** The `<footer>…</footer>` blocks of a document. */
function footers(html: string): string[] {
  return [...html.matchAll(/<footer\b[^>]*>([\s\S]*?)<\/footer>/gu)].map((m) => m[1] ?? "");
}

describe("the dedication on every built Quiet page", () => {
  it("builds the chooser, the 404 page and pages of both editions", () => {
    const files = htmlFiles();
    expect(files).toContain("index.html");
    expect(files).toContain("404.html");
    for (const ed of ["yi", "en"]) {
      expect(files).toContain(`${ed}/index.html`);
      expect(files.some((f) => f.startsWith(`${ed}/shiur/`))).toBe(true);
    }
    expect(files.length).toBeGreaterThan(20);
  });

  it("appears exactly once per page, as the last line of the footer, in Hebrew", () => {
    const bad: string[] = [];
    for (const file of htmlFiles()) {
      const html = readFileSync(join(dist, file), "utf8");
      const count = html.split(DEDICATION).length - 1;
      if (count !== 1) {
        bad.push(`${file}: ${count} times`);
        continue;
      }
      const footer = footers(html).find((f) => f.includes(DEDICATION));
      if (footer === undefined) {
        bad.push(`${file}: not in a <footer>`);
        continue;
      }
      const last = /<p\b([^>]*)>([^<]*)<\/p>\s*$/u.exec(footer);
      if (!last || last[2] !== DEDICATION) bad.push(`${file}: not the footer's last line`);
      else if (!/\blang="he"/u.test(last[1] ?? "") || !/\bdir="rtl"/u.test(last[1] ?? "")) bad.push(`${file}: not marked lang="he" dir="rtl"`);
    }
    expect(bad).toEqual([]);
  });

  it("the footer is the last thing in the page body (scripts aside)", () => {
    for (const file of ["index.html", "404.html", "en/index.html", "yi/index.html"]) {
      const html = readFileSync(join(dist, file), "utf8");
      const afterFooter = html.slice(html.lastIndexOf("</footer>") + "</footer>".length);
      expect(afterFooter.replace(/<script\b[\s\S]*?<\/script>/gu, "").replace(/\s+/gu, ""), file).toBe("</body></html>");
    }
  });
});
