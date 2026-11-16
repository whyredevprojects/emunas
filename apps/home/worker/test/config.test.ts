import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { productionHosts } from "@emunas/links";
import { describe, expect, it } from "vitest";
import { readJsonc } from "./jsonc.ts";

const APP = fileURLToPath(new URL("../../", import.meta.url));

interface Route {
  pattern: string;
  custom_domain?: boolean;
}
interface R2Binding {
  binding: string;
  bucket_name: string;
}
interface WranglerConfig {
  name: string;
  main?: string;
  compatibility_date: string;
  assets: Record<string, unknown>;
  r2_buckets?: R2Binding[];
  routes?: Route[];
  env: Record<string, { name?: string; routes?: Route[]; r2_buckets?: R2Binding[] }>;
}

const cfg = readJsonc(`${APP}wrangler.jsonc`) as WranglerConfig;
const headers = readFileSync(`${APP}public/_headers`, "utf8");

describe("apps/home/wrangler.jsonc", () => {
  it("serves dist/ with the Worker first only for /files/*", () => {
    expect(cfg.name).toBe("emunas-home");
    expect(cfg.main).toBe("worker/index.ts");
    expect(cfg.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(cfg.assets).toEqual({
      directory: "./dist",
      binding: "ASSETS",
      html_handling: "auto-trailing-slash",
      not_found_handling: "404-page",
      run_worker_first: ["/files/*"],
    });
  });

  it("binds the emunas R2 bucket as FILES in production and staging", () => {
    const want = [{ binding: "FILES", bucket_name: "emunas" }];
    expect(cfg.r2_buckets).toEqual(want);
    expect(cfg.env["staging"]?.r2_buckets).toEqual(want);
  });

  it("is on the apex custom domain only (no www host)", () => {
    const routes = cfg.routes ?? [];
    expect(routes).toHaveLength(1);
    expect(routes[0]?.custom_domain).toBe(true);
    const apex = routes[0]?.pattern ?? "";
    expect(`https://${apex}`).toBe(productionHosts(apex).home);
  });

  it("has a staging Worker that claims no route", () => {
    expect(cfg.env["staging"]?.name).toBe("emunas-home-staging");
    expect(cfg.env["staging"]?.routes).toEqual([]);
  });

  it("has no redirects", () => {
    expect(existsSync(`${APP}public/_redirects`)).toBe(false);
  });
});

describe("apps/home/public/_headers", () => {
  const lines = headers.split("\n");
  const value = (pattern: string, name: string): string | undefined => {
    const i = lines.findIndex((l) => l.trim() === pattern);
    if (i === -1) return undefined;
    for (const l of lines.slice(i + 1)) {
      if (!/^\s/.test(l) || l.trim() === "") break;
      const m = /^\s+([A-Za-z-]+):\s*(.*)$/.exec(l);
      if (m?.[1] === name) return m[2];
    }
    return undefined;
  };

  it("has a strict CSP with no inline scripts or styles and no outside origins", () => {
    const csp = value("/*", "Content-Security-Policy") ?? "";
    const d = new Map(csp.split(";").map((x) => { const [k = "", ...v] = x.trim().split(/\s+/); return [k, v] as const; }));
    expect(d.get("default-src")).toEqual(["'self'"]);
    expect(d.get("script-src")).toEqual(["'self'"]);
    expect(d.get("style-src")).toEqual(["'self'"]);
    expect(d.get("font-src")).toEqual(["'self'"]);
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp).not.toMatch(/unsafe-inline|https?:/);
  });

  it("caches hashed assets forever, fonts for a day, and noindexes workers.dev", () => {
    expect(value("/_astro/*", "Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(value("/fonts/*", "Cache-Control")).not.toMatch(/immutable/);
    expect(value("https://:worker.:subdomain.workers.dev/*", "X-Robots-Tag")).toBe("noindex");
  });

  it("has every line within the platform limit", () => {
    expect(lines.every((l) => l.length <= 2000)).toBe(true);
  });
});
