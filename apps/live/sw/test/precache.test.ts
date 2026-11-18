import { describe, expect, it } from "vitest";
import { SPA_FALLBACK, precacheFile, selectPrecache } from "../src/precache.ts";

describe("selectPrecache", () => {
  const files = [
    "__spa-fallback.html",
    "index.html",
    "en/index.html",
    "yi/index.html",
    "he/index.html",
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
      "/__spa-fallback",
      "/assets/noto-sans-latin-x.woff2",
      "/assets/root-abc.css",
      "/assets/root-abc.js",
      "/en/",
      "/he/",
      "/icons/icon.svg",
      "/manifest.webmanifest",
      "/yi/",
    ]);
  });

  it("includes the SPA fallback that offline navigation needs", () => {
    expect(selectPrecache(files)).toContain(SPA_FALLBACK);
  });

  it("precaches pages by the URL the host serves without a redirect, never `/` or `/index.html`", () => {
    const urls = selectPrecache(files);
    expect(urls).not.toContain("/index.html");
    expect(urls).not.toContain("/");
    expect(urls.filter((u) => u.endsWith(".html"))).toEqual([]);
  });

  it("maps each precache URL back to its build file", () => {
    expect(selectPrecache(files).map(precacheFile)).toEqual([
      "__spa-fallback.html",
      "assets/noto-sans-latin-x.woff2",
      "assets/root-abc.css",
      "assets/root-abc.js",
      "en/index.html",
      "he/index.html",
      "icons/icon.svg",
      "manifest.webmanifest",
      "yi/index.html",
    ]);
    expect(precacheFile("/assets/a%20b.js")).toBe("assets/a b.js");
  });

  it("encodes path segments", () => {
    expect(selectPrecache(["assets/a b.js"])).toEqual(["/assets/a%20b.js"]);
  });
});
