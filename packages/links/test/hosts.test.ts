import { describe, expect, it } from "vitest";
import {
  createLinks,
  hostsFromEnv,
  isIndexableOrigin,
  momentId,
  normalizeOrigin,
  parseMomentId,
  productionHosts,
  validateHosts,
  workersDevHosts,
} from "../src/index.ts";

describe("host config", () => {
  it("production: apex for Quiet, listen. for Live", () => {
    expect(productionHosts("Example.org")).toEqual({ quiet: "https://example.org", live: "https://listen.example.org" });
    expect(productionHosts("www.example.org").quiet).toBe("https://example.org");
    expect(() => productionHosts("listen.example.org")).toThrow();
    expect(() => productionHosts("not a domain")).toThrow();
  });

  it("workers.dev fallbacks, production and staging", () => {
    expect(workersDevHosts("acct")).toEqual({
      quiet: "https://emunas-quiet.acct.workers.dev",
      live: "https://emunas-live.acct.workers.dev",
    });
    expect(workersDevHosts("acct", "staging").live).toBe("https://emunas-live-staging.acct.workers.dev");
    expect(() => workersDevHosts("a.b")).toThrow();
  });

  it("hostsFromEnv precedence: origins > domain > workers.dev", () => {
    expect(hostsFromEnv({ EMUNAS_DOMAIN: "example.org", EMUNAS_WORKERS_SUBDOMAIN: "acct" })).toEqual(
      productionHosts("example.org"),
    );
    expect(hostsFromEnv({ EMUNAS_DOMAIN: "", EMUNAS_WORKERS_SUBDOMAIN: "acct" })).toEqual(workersDevHosts("acct"));
    expect(hostsFromEnv({ EMUNAS_DOMAIN: "example.org", EMUNAS_WORKERS_SUBDOMAIN: "acct", EMUNAS_STAGE: "staging" })).toEqual(
      workersDevHosts("acct", "staging"),
    );
    expect(
      hostsFromEnv({
        EMUNAS_DOMAIN: "example.org",
        EMUNAS_QUIET_ORIGIN: "http://localhost:4321/",
        EMUNAS_LIVE_ORIGIN: "http://localhost:5173",
      }),
    ).toEqual({ quiet: "http://localhost:4321", live: "http://localhost:5173" });
    expect(() => hostsFromEnv({})).toThrow(/no hosts configured/);
  });

  it("rejects a Quiet origin on listen.* and identical origins", () => {
    expect(() => validateHosts({ quiet: "https://listen.example.org", live: "https://example.org" })).toThrow();
    expect(() => validateHosts({ quiet: "https://a.example", live: "https://A.example/" })).toThrow();
    expect(() => createLinks({ hosts: { quiet: "https://listen.x.org", live: "https://x.org" } })).toThrow();
    expect(() => normalizeOrigin("ftp://x.org")).toThrow();
    expect(() => normalizeOrigin("https://x.org/path")).toThrow();
  });

  it("noindex for workers.dev, localhost and IPs", () => {
    expect(isIndexableOrigin("https://example.org")).toBe(true);
    expect(isIndexableOrigin("https://listen.example.org")).toBe(true);
    expect(isIndexableOrigin("https://emunas-quiet.acct.workers.dev")).toBe(false);
    expect(isIndexableOrigin("https://pr-12-emunas-live.acct.workers.dev")).toBe(false);
    expect(isIndexableOrigin("http://localhost:4321")).toBe(false);
    expect(isIndexableOrigin("http://127.0.0.1:8787")).toBe(false);
    expect(isIndexableOrigin("http://example.org")).toBe(false);
  });
});

describe("moment ids", () => {
  it("round-trips every kind, with hyphenated shiur ids", () => {
    for (const kind of ["s", "i", "q", "st", "tk", "kp"] as const) {
      const id = momentId("yi-zmanim-tv-bb-04", kind, 7);
      expect(parseMomentId(id)).toEqual({ shiurId: "yi-zmanim-tv-bb-04", kind, index: 7 });
    }
    expect(parseMomentId("a~st1")?.kind).toBe("st");
    expect(parseMomentId("a~x1")).toBeNull();
    expect(parseMomentId("a~s")).toBeNull();
    expect(() => momentId("a", "s", 1.5)).toThrow();
  });
});
