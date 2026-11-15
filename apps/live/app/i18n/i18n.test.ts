import { describe, expect, it } from "vitest";
import { en } from "./en.ts";
import { tFor, UI_TABLES } from "./index.ts";
import { yi } from "./yi.ts";

describe("Live UI strings", () => {
  it("both tables have exactly the same keys", () => {
    expect(Object.keys(yi).sort()).toEqual(Object.keys(en).sort());
    expect(UI_TABLES.yi).toBe(yi);
  });

  it("placeholders match between languages", () => {
    const ph = (m: unknown) => [...JSON.stringify(m).matchAll(/\{([A-Za-z_]\w*)\}/g)].map((x) => x[1]).sort();
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(ph(yi[k]), k).toEqual(ph(en[k]));
    }
  });

  it("Yiddish strings are in Hebrew script, except the deliberate English language name", () => {
    const latinOk = new Set(["lang.uiSwitch", "home.en"]);
    for (const [k, v] of Object.entries(yi)) {
      const text = typeof v === "string" ? v : v.other;
      const stripped = text.replace(/\{\w+\}/g, "").replace(/\bAI\b/g, "");
      if (latinOk.has(k)) continue;
      expect(/[A-Za-z]/.test(stripped), `${k}: ${text}`).toBe(false);
    }
  });

  it("has no exclamation marks (concept-live §7 tone)", () => {
    for (const table of [en, yi]) {
      for (const v of Object.values(table)) expect(JSON.stringify(v)).not.toContain("!");
    }
  });

  it("formats plurals and params", () => {
    expect(tFor("en")("count.shiurim", { count: 1 })).toBe("1 shiur");
    expect(tFor("en")("count.shiurim", { count: 997 })).toBe("997 shiurim");
    expect(tFor("yi")("count.shiurim", { count: 2 })).toBe("2 שיעורים");
    expect(tFor("en")("page.shiur.lead", { id: "x" })).toBe("The listening room for shiur x.");
  });

  it("rejects unknown keys at compile time", () => {
    const t = tFor("en");
    // @ts-expect-error: not a UI key
    expect(t("no.such.key")).toBe("no.such.key");
  });
});
