import { describe, expect, it } from "vitest";
import { en } from "./en.ts";
import { tFor, UI_TABLES } from "./index.ts";
import { he } from "./he.ts";
import { yi } from "./yi.ts";

const HEBREW_SCRIPT = { yi, he } as const;

describe("Live UI strings", () => {
  it("every table has exactly the same keys", () => {
    for (const [lang, table] of Object.entries(HEBREW_SCRIPT)) expect(Object.keys(table).sort(), lang).toEqual(Object.keys(en).sort());
    expect(UI_TABLES).toEqual({ en, yi, he });
  });

  it("placeholders match between languages", () => {
    const ph = (m: unknown) => [...JSON.stringify(m).matchAll(/\{([A-Za-z_]\w*)\}/g)].map((x) => x[1]).sort();
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      for (const [lang, table] of Object.entries(HEBREW_SCRIPT)) expect(ph(table[k]), `${lang} ${k}`).toEqual(ph(en[k]));
    }
  });

  it("Yiddish and Hebrew strings are in Hebrew script", () => {
    for (const [lang, table] of Object.entries(HEBREW_SCRIPT)) {
      for (const [k, v] of Object.entries(table)) {
        const text = typeof v === "string" ? v : v.other;
        const stripped = text.replace(/\{\w+\}/g, "").replace(/\bAI\b/g, "");
        expect(/[A-Za-z]/.test(stripped), `${lang} ${k}: ${text}`).toBe(false);
      }
    }
  });

  it("Hebrew strings have no nikud", () => {
    for (const [k, v] of Object.entries(he)) expect(/[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/u.test(JSON.stringify(v)), k).toBe(false);
  });

  it("has no exclamation marks (concept-live §7 tone)", () => {
    for (const table of [en, yi, he]) {
      for (const v of Object.values(table)) expect(JSON.stringify(v)).not.toContain("!");
    }
  });

  it("formats plurals and params", () => {
    expect(tFor("en")("count.shiurim", { count: 1 })).toBe("1 shiur");
    expect(tFor("en")("count.shiurim", { count: 997 })).toBe("997 shiurim");
    expect(tFor("yi")("count.shiurim", { count: 2 })).toBe("2 שיעורים");
    expect(tFor("he")("count.shiurim", { count: 2 })).toBe("2 שיעורים");
    expect(tFor("he")("count.shiurim", { count: 1 })).toBe("1 שיעור");
    expect(tFor("en")("page.shiur.lead", { id: "x" })).toBe("The listening room for shiur x.");
  });

  it("rejects unknown keys at compile time", () => {
    const t = tFor("en");
    // @ts-expect-error: not a UI key
    expect(t("no.such.key")).toBe("no.such.key");
  });
});
