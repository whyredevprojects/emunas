import { describe, expect, it } from "vitest";
import { SPA_FALLBACK, selectPrecache } from "../src/precache.ts";

describe("selectPrecache", () => {
  const files = [
    "__spa-fallback.html",
    "index.html",
    "en/index.html",
    "yi/index.html",
    "en/s/yi-tanya-1-01/index.html",
    "assets/root-abc.js",
    "assets/root-abc.css",
    "assets/root-abc.js.map",
    "assets/noto-sans-latin-x.woff2",
    "icons/icon.svg",
    "manifest.webmanifest",
    "_headers",
    "sw.js",
    "data/corpus.json",
    "data/shiur/yi-tanya-1-01.json",
    "en/s/yi-tanya-1-01.data",
  ];

  it("takes the shell and leaves out data, maps, deep prerendered pages and the worker", () => {
    expect(selectPrecache(files)).toEqual([
      "/__spa-fallback.html",
      "/assets/noto-sans-latin-x.woff2",
      "/assets/root-abc.css",
      "/assets/root-abc.js",
      "/en/index.html",
      "/icons/icon.svg",
      "/index.html",
      "/manifest.webmanifest",
      "/yi/index.html",
    ]);
  });

  it("includes the SPA fallback that offline navigation needs", () => {
    expect(selectPrecache(files)).toContain(SPA_FALLBACK);
  });

  it("encodes path segments", () => {
    expect(selectPrecache(["assets/a b.js"])).toEqual(["/assets/a%20b.js"]);
  });
});
