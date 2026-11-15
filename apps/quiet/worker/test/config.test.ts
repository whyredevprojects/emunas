import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseHeaders, renderHeaders } from "../render-headers.ts";
import { readJsonc } from "./jsonc.ts";

const APP = fileURLToPath(new URL("../../", import.meta.url));

interface WranglerConfig {
  name: string;
  main?: string;
  compatibility_date: string;
  assets: Record<string, unknown> & { directory: string };
  r2_buckets?: unknown;
  services?: unknown;
  vars?: unknown;
  env: Record<string, { name?: string }>;
}

const cfg = readJsonc(`${APP}wrangler.jsonc`) as WranglerConfig;
const raw = readFileSync(`${APP}wrangler.jsonc`, "utf8");
const template = readFileSync(`${APP}public/_headers`, "utf8");

describe("apps/quiet/wrangler.jsonc", () => {
  it("is an assets-only Worker over dist/ (no Worker script, Amendment A1)", () => {
    expect(cfg.name).toBe("emunas-quiet");
    expect(cfg.main).toBeUndefined();
    expect(cfg.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(cfg.assets).toEqual({
      directory: "./dist",
      html_handling: "auto-trailing-slash",
      not_found_handling: "404-page",
    });
  });

  it("has no bindings, no audio switch and no audio route", () => {
    expect(cfg.r2_buckets).toBeUndefined();
    expect(cfg.services).toBeUndefined();
    expect(cfg.vars).toBeUndefined();
    expect(raw).not.toMatch(/AUDIO_ENABLED|r2_buckets|run_worker_first|\/audio\//);
  });

  it("has a staging environment for staging deploys and PR previews", () => {
    expect(cfg.env["staging"]?.name).toBe("emunas-quiet-staging");
  });

  it("ships no runtime Worker code in worker/ (only build-time tooling)", () => {
    const dir = `${APP}worker`;
    expect(existsSync(`${dir}/index.ts`)).toBe(false);
    expect(readdirSync(dir).filter((f) => f.endsWith(".ts")).sort()).toEqual(["render-headers.ts", "vitest.config.ts"]);
  });
});

describe("no redirects (the site has never been published)", () => {
  it("has no _redirects file and no redirect step in the build", () => {
    expect(existsSync(`${APP}public/_redirects`)).toBe(false);
    const pkg = JSON.parse(readFileSync(`${APP}package.json`, "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["build"]).not.toMatch(/redirect/);
    expect(existsSync(`${APP}scripts/redirects.ts`)).toBe(false);
  });
});

describe("apps/quiet/public/_headers", () => {
  it("is a valid _headers file within platform limits", () => {
    expect(parseHeaders(template).length).toBeGreaterThan(0);
  });

  function cspOf(text: string): Map<string, string[]> {
    const csp = parseHeaders(text)
      .find((r) => r.pattern === "/*")
      ?.headers.find(([n]) => n === "Content-Security-Policy")?.[1];
    expect(csp).toBeDefined();
    return new Map(
      csp!.split(";").map((d) => {
        const [name = "", ...vals] = d.trim().split(/\s+/);
        return [name, vals] as const;
      }),
    );
  }

  it("has the tech-quiet CSP with the media origin in media-src", () => {
    const d = cspOf(renderHeaders(template, { mediaOrigin: "https://media.example.org" }));
    expect(d.get("default-src")).toEqual(["'self'"]);
    expect(d.get("script-src")).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    expect(d.get("style-src")).toEqual(["'self'"]);
    expect(d.get("media-src")).toEqual(["'self'", "https://media.example.org"]);
    expect(d.get("connect-src")).toEqual(["'self'"]);
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
    expect(d.get("form-action")).toEqual(["'self'"]);
  });

  it("allows only 'self' for media when rendered without an origin", () => {
    const d = cspOf(renderHeaders(template, { mediaOrigin: undefined, allowMissing: true }));
    expect(d.get("media-src")).toEqual(["'self'"]);
  });

  it("sets the caching rules of §3.3 and noindex on workers.dev", () => {
    const rules = parseHeaders(template);
    const get = (pattern: string, name: string) =>
      rules.find((r) => r.pattern === pattern)?.headers.find(([n]) => n === name)?.[1];
    expect(get("/_astro/*", "Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(get("/pagefind/*", "Cache-Control")).toBe("public, max-age=3600");
    // Font file names are not content-hashed, so they must not be immutable.
    expect(get("/fonts/*", "Cache-Control")).not.toMatch(/immutable/);
    expect(get("https://:worker.:subdomain.workers.dev/*", "X-Robots-Tag")).toBe("noindex");
  });
});
