import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  THEME_INIT_SCRIPT,
  applyTheme,
  readThemeCookie,
  refreshThemeCookie,
  resyncTheme,
  saveTheme,
  themeCookie,
  type ThemeDocument,
} from "../src/theme.ts";

const https = (hostname: string) => ({ hostname, protocol: "https:" });

function fakeDoc(cookie = ""): ThemeDocument & { writes: string[] } {
  const writes: string[] = [];
  return {
    documentElement: { dataset: {} },
    writes,
    get cookie() {
      return cookie;
    },
    set cookie(v: string) {
      writes.push(v);
      cookie = v.split(";")[0] ?? "";
    },
  };
}

describe("themeCookie", () => {
  it("shares the cookie across the apex and the listen subdomain", () => {
    for (const host of ["emunas.com", "analyze.emunas.com"]) {
      expect(themeCookie("dark", https(host))).toBe(
        "emunas_theme=dark; Path=/; Max-Age=31536000; SameSite=Lax; Domain=emunas.com; Secure",
      );
    }
  });

  it("is host-only on localhost, IPs, workers.dev and look-alike hosts", () => {
    for (const host of ["localhost", "127.0.0.1", "x.y.workers.dev", "notemunas.com"]) {
      expect(themeCookie("light", https(host))).not.toContain("Domain=");
    }
  });

  it("is Secure only over https", () => {
    expect(themeCookie("dark", https("localhost"))).toContain("; Secure");
    expect(themeCookie("dark", { hostname: "localhost", protocol: "http:" })).not.toContain("Secure");
  });
});

describe("readThemeCookie", () => {
  it.each([
    ["", "light"],
    ["emunas_theme=dark", "dark"],
    ["a=1; emunas_theme=dark; b=2", "dark"],
    ["a=1;emunas_theme=dark", "dark"],
    ["emunas_theme=light", "light"],
    ["emunas_theme=darker", "light"],
    ["xemunas_theme=dark", "light"],
    ["emunas_ui=dark", "light"],
  ] as const)("%j → %s", (cookie, theme) => {
    expect(readThemeCookie(cookie)).toBe(theme);
  });
});

describe("applyTheme / saveTheme", () => {
  it("sets data-theme for dark and removes it for light", () => {
    const doc = fakeDoc();
    applyTheme(doc, "dark");
    expect(doc.documentElement.dataset["theme"]).toBe("dark");
    applyTheme(doc, "light");
    expect("theme" in doc.documentElement.dataset).toBe(false);
  });

  it("writes light rather than deleting the cookie", () => {
    const doc = fakeDoc("emunas_theme=dark");
    saveTheme(doc, https("emunas.com"), "light");
    expect(doc.writes[0]).toMatch(/^emunas_theme=light; /);
    expect(readThemeCookie(doc.cookie)).toBe("light");
  });

  it("survives a document whose cookie setter throws", () => {
    const doc: ThemeDocument = {
      documentElement: { dataset: {} },
      get cookie() {
        return "";
      },
      set cookie(_v: string) {
        throw new Error("blocked");
      },
    };
    expect(() => saveTheme(doc, https("localhost"), "dark")).not.toThrow();
    expect(doc.documentElement.dataset["theme"]).toBe("dark");
  });

  it("re-saves only a dark cookie", () => {
    const dark = fakeDoc("emunas_theme=dark");
    refreshThemeCookie(dark, https("localhost"));
    expect(dark.writes).toHaveLength(1);
    const light = fakeDoc("emunas_theme=light");
    refreshThemeCookie(light, https("localhost"));
    expect(light.writes).toHaveLength(0);
  });
});

describe("resyncTheme", () => {
  it("re-reads the cookie on pageshow and when the page becomes visible", () => {
    const winTarget = new EventTarget();
    const docTarget = new EventTarget();
    const doc = Object.assign(fakeDoc("emunas_theme=dark"), {
      visibilityState: "hidden",
      addEventListener: docTarget.addEventListener.bind(docTarget),
      removeEventListener: docTarget.removeEventListener.bind(docTarget),
    });
    const win = {
      addEventListener: winTarget.addEventListener.bind(winTarget),
      removeEventListener: winTarget.removeEventListener.bind(winTarget),
    };
    const seen = vi.fn();
    const stop = resyncTheme(win, doc, seen);

    winTarget.dispatchEvent(new Event("pageshow"));
    expect(doc.documentElement.dataset["theme"]).toBe("dark");

    doc.cookie = "emunas_theme=light";
    docTarget.dispatchEvent(new Event("visibilitychange"));
    expect(doc.documentElement.dataset["theme"]).toBe("dark");
    doc.visibilityState = "visible";
    docTarget.dispatchEvent(new Event("visibilitychange"));
    expect(doc.documentElement.dataset["theme"]).toBeUndefined();
    expect(seen.mock.calls).toEqual([["dark"], ["light"]]);

    stop();
    doc.cookie = "emunas_theme=dark";
    winTarget.dispatchEvent(new Event("pageshow"));
    expect(seen).toHaveBeenCalledTimes(2);
  });
});

describe("THEME_INIT_SCRIPT", () => {
  const run = (cookie: string) => {
    const doc = fakeDoc(cookie);
    runInNewContext(THEME_INIT_SCRIPT, { document: doc });
    return doc.documentElement.dataset["theme"];
  };

  it("sets data-theme=dark only for a dark cookie", () => {
    expect(run("emunas_theme=dark")).toBe("dark");
    expect(run("a=b; emunas_theme=dark")).toBe("dark");
    expect(run("emunas_theme=light")).toBeUndefined();
    expect(run("")).toBeUndefined();
    expect(run("emunas_theme=darkish")).toBeUndefined();
  });

  it("never throws, even without a document", () => {
    expect(() => runInNewContext(THEME_INIT_SCRIPT, {})).not.toThrow();
  });

  it("is byte-constant (Quiet's CSP in apps/quiet/public/_headers allows it by this hash)", () => {
    expect(createHash("sha256").update(THEME_INIT_SCRIPT).digest("base64")).toBe("Fi76lzGQR/8odRrMH1G21Mcsrp0gna3lNdJ2IFAzE70=");
  });
});
