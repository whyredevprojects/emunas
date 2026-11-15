import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseHeaders, renderHeaders } from "../render-headers.ts";
import { readJsonc } from "./jsonc.ts";

const APP = fileURLToPath(new URL("../../", import.meta.url));

interface Service {
  binding: string;
  service: string;
}
interface WranglerConfig {
  name: string;
  main?: string;
  compatibility_date: string;
  assets: {
    directory: string;
    binding?: string;
    not_found_handling?: string;
    html_handling?: string;
    run_worker_first?: string[];
  };
  services?: Service[];
  r2_buckets?: unknown;
  vars?: Record<string, string>;
  env: Record<string, Partial<WranglerConfig>>;
}

const cfg = readJsonc(`${APP}wrangler.jsonc`) as WranglerConfig;
const raw = readFileSync(`${APP}wrangler.jsonc`, "utf8");
const template = readFileSync(`${APP}public/_headers`, "utf8");

describe("apps/live/wrangler.jsonc", () => {
  it("is the emunas-live Worker over build/client with SPA fallback", () => {
    expect(cfg.name).toBe("emunas-live");
    expect(cfg.main).toBe("worker/index.ts");
    expect(cfg.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(cfg.assets.directory).toBe("./build/client");
    expect(cfg.assets.binding).toBe("ASSETS");
    expect(cfg.assets.not_found_handling).toBe("single-page-application");
  });

  it("runs the Worker first only for /, /api/* and /admin/* (no audio route, Amendment A1)", () => {
    expect(cfg.assets.run_worker_first).toEqual(["/", "/api/*", "/admin/*"]);
  });

  it("binds API to emunas-api in production and emunas-api-staging in staging", () => {
    expect(cfg.services).toEqual([{ binding: "API", service: "emunas-api" }]);
    const staging = cfg.env["staging"];
    expect(staging?.name).toBe("emunas-live-staging");
    expect(staging?.services).toEqual([{ binding: "API", service: "emunas-api-staging" }]);
  });

  it("has no R2 binding, no audio switch and no audio route", () => {
    expect(cfg.r2_buckets).toBeUndefined();
    expect(raw).not.toMatch(/AUDIO_ENABLED|r2_buckets|\/audio\//);
  });
});

describe("apps/live/public/_headers", () => {
  it("is a valid _headers file within platform limits even before rendering", () => {
    expect(parseHeaders(template).length).toBeGreaterThan(0);
  });

  it("puts the media origin into media-src and connect-src", () => {
    const out = renderHeaders(template, { mediaOrigin: "https://media.example.org/" });
    const csp = parseHeaders(out)
      .find((r) => r.pattern === "/*")
      ?.headers.find(([n]) => n === "Content-Security-Policy")?.[1];
    expect(csp).toBeDefined();
    const directives = new Map(
      csp!.split(";").map((d) => {
        const [name = "", ...vals] = d.trim().split(/\s+/);
        return [name, vals] as const;
      }),
    );
    expect(directives.get("media-src")).toEqual(["'self'", "https://media.example.org"]);
    expect(directives.get("connect-src")).toEqual(["'self'", "https://media.example.org"]);
    expect(directives.get("default-src")).toEqual(["'self'"]);
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
  });

  it("falls back to 'self' only when allowed to run without a media origin", () => {
    const out = renderHeaders(template, { mediaOrigin: undefined, allowMissing: true });
    expect(out).toContain("media-src 'self';");
    expect(out).toContain("connect-src 'self';");
    expect(out).not.toContain("{{");
  });

  it("sets the caching rules of §3.3 and noindex on workers.dev", () => {
    const rules = parseHeaders(template);
    const get = (pattern: string, name: string) =>
      rules.find((r) => r.pattern === pattern)?.headers.find(([n]) => n === name)?.[1];
    expect(get("/assets/*", "Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(get("/data/*", "Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=86400");
    expect(get("https://:worker.:subdomain.workers.dev/*", "X-Robots-Tag")).toBe("noindex");
    expect(get("/*", "X-Content-Type-Options")).toBe("nosniff");
  });

  it("names no audio route", () => {
    expect(template).not.toMatch(/\/audio\//);
  });
});
