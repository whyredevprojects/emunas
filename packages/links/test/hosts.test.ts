import { describe, expect, it } from "vitest";
import {
  createLinks,
  hostsFromEnv,
  isIndexableOrigin,
  momentId,
  normalizeOrigin,
  parseMomentId,
  productionHosts,
  siteHostsFromEnv,
  validateHosts,
  workersDevHosts,
} from "../src/index.ts";

describe("host config", () => {
  it("production: apex for home, library. for Quiet, listen. for Live", () => {
    expect(productionHosts("Example.org")).toEqual({
      home: "https://example.org",
      quiet: "https://library.example.org",
      live: "https://listen.example.org",
    });
    expect(productionHosts("www.example.org").home).toBe("https://example.org");
    expect(productionHosts("emunas.torahlearningtools.com")).toEqual({
      home: "https://emunas.torahlearningtools.com",
      quiet: "https://library.emunas.torahlearningtools.com",
      live: "https://listen.emunas.torahlearningtools.com",
    });
    for (const sub of ["listen", "library", "media"]) expect(() => productionHosts(`${sub}.example.org`)).toThrow(/apex/);
    expect(() => productionHosts("not a domain")).toThrow();
  });

  it("workers.dev fallbacks, production and staging", () => {
    expect(workersDevHosts("acct")).toEqual({
      home: "https://emunas-home.acct.workers.dev",
      quiet: "https://emunas-quiet.acct.workers.dev",
      live: "https://emunas-live.acct.workers.dev",
    });
    expect(workersDevHosts("acct", "staging")).toEqual({
      home: "https://emunas-home-staging.acct.workers.dev",
      quiet: "https://emunas-quiet-staging.acct.workers.dev",
      live: "https://emunas-live-staging.acct.workers.dev",
    });
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
        EMUNAS_HOME_ORIGIN: "http://localhost:4322",
        EMUNAS_QUIET_ORIGIN: "http://localhost:4321/",
        EMUNAS_LIVE_ORIGIN: "http://localhost:5173",
      }),
    ).toEqual({ home: "http://localhost:4322", quiet: "http://localhost:4321", live: "http://localhost:5173" });
    expect(hostsFromEnv({ EMUNAS_DOMAIN: "example.org", EMUNAS_HOME_ORIGIN: "http://localhost:4322" })).toEqual({
      ...productionHosts("example.org"),
      home: "http://localhost:4322",
    });
    expect(() => hostsFromEnv({})).toThrow(/no hosts configured/);
    expect(() =>
      hostsFromEnv({ EMUNAS_QUIET_ORIGIN: "http://localhost:4321", EMUNAS_LIVE_ORIGIN: "http://localhost:5173" }),
    ).toThrow(/EMUNAS_HOME_ORIGIN/);
  });

  it("siteHostsFromEnv needs only Quiet and Live", () => {
    expect(siteHostsFromEnv({ EMUNAS_DOMAIN: "example.org" })).toEqual({
      quiet: "https://library.example.org",
      live: "https://listen.example.org",
    });
    expect(
      siteHostsFromEnv({ EMUNAS_QUIET_ORIGIN: "http://localhost:4321/", EMUNAS_LIVE_ORIGIN: "http://localhost:5173" }),
    ).toEqual({ quiet: "http://localhost:4321", live: "http://localhost:5173" });
    expect(() => siteHostsFromEnv({ EMUNAS_LIVE_ORIGIN: "http://localhost:5173" })).toThrow(/no hosts configured/);
  });

  it("rejects a Quiet origin on listen.* and any two identical origins", () => {
    expect(() => validateHosts({ quiet: "https://listen.example.org", live: "https://example.org" })).toThrow();
    expect(() => validateHosts({ quiet: "https://a.example", live: "https://A.example/" })).toThrow();
    expect(() =>
      validateHosts({ home: "https://library.example.org", quiet: "https://library.example.org/", live: "https://listen.example.org" }),
    ).toThrow(/different origins/);
    expect(() =>
      validateHosts({ home: "https://listen.example.org", quiet: "https://library.example.org", live: "https://listen.example.org" }),
    ).toThrow(/different origins/);
    expect(validateHosts({ home: "https://Example.org/", quiet: "https://library.example.org", live: "https://listen.example.org" })).toEqual(
      productionHosts("example.org"),
    );
    expect(() => createLinks({ hosts: { quiet: "https://listen.x.org", live: "https://x.org" } })).toThrow();
    expect(createLinks({ hosts: productionHosts("example.org") }).hosts).toEqual({
      quiet: "https://library.example.org",
      live: "https://listen.example.org",
    });
    expect(() => normalizeOrigin("ftp://x.org")).toThrow();
    expect(() => normalizeOrigin("https://x.org/path")).toThrow();
  });

  it("noindex for workers.dev, localhost and IPs", () => {
    expect(isIndexableOrigin("https://example.org")).toBe(true);
    expect(isIndexableOrigin("https://listen.example.org")).toBe(true);
    expect(isIndexableOrigin("https://library.example.org")).toBe(true);
    expect(isIndexableOrigin("https://emunas-home.acct.workers.dev")).toBe(false);
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
