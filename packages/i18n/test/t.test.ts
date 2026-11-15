import { describe, expect, it } from "vitest";
import { createT, type MessageTable } from "../src/index.ts";

const en = {
  "nav.home": "Home",
  "shiur.by": "Shiur by {name}",
  "list.count": { one: "{count} shiur", other: "{count} shiurim" },
} as const;
type UiKey = keyof typeof en;
const yi: MessageTable<UiKey> = {
  "nav.home": "היים",
  "shiur.by": "שיעור פון {name}",
  "list.count": { one: "{count} שיעור", other: "{count} שיעורים" },
};

describe("createT", () => {
  const tEn = createT<UiKey>({ en, yi }, "en");
  const tYi = createT<UiKey>({ en, yi }, "yi");

  it("looks up plain messages per language", () => {
    expect(tEn("nav.home")).toBe("Home");
    expect(tYi("nav.home")).toBe("היים");
    expect(tEn.lang).toBe("en");
    expect(tYi.lang).toBe("yi");
  });

  it("interpolates params and leaves unknown placeholders visible", () => {
    expect(tEn("shiur.by", { name: "the Rav" })).toBe("Shiur by the Rav");
    expect(tYi("shiur.by", { name: "דער משגיח" })).toBe("שיעור פון דער משגיח");
    expect(tEn("shiur.by")).toBe("Shiur by {name}");
    expect(tEn("shiur.by", {})).toBe("Shiur by {name}");
  });

  it("selects plurals with Intl.PluralRules in both languages", () => {
    expect(tEn("list.count", { count: 1 })).toBe("1 shiur");
    expect(tEn("list.count", { count: 0 })).toBe("0 shiurim");
    expect(tEn("list.count", { count: 1997 })).toBe("1,997 shiurim");
    expect(tYi("list.count", { count: 1 })).toBe("1 שיעור");
    expect(tYi("list.count", { count: 2 })).toBe("2 שיעורים");
    expect(tYi("list.count")).toBe("{count} שיעורים");
  });

  it("narrows untyped keys with has()", () => {
    const fromData: string = "nav.home";
    expect(tEn.has(fromData)).toBe(true);
    expect(tEn.has("nope")).toBe(false);
    expect(tEn.has("toString")).toBe(false);
  });

  it("rejects unknown keys at the type level (and returns the key at runtime)", () => {
    // @ts-expect-error -- "missing" is not a UiKey: t('missing') must fail tsc
    expect(tEn("missing")).toBe("missing");
  });

  it("requires every key in every table at the type level", () => {
    // @ts-expect-error -- the yi table lacks "list.count"
    const incomplete: MessageTable<UiKey> = { "nav.home": "היים", "shiur.by": "שיעור פון {name}" };
    expect(Object.keys(incomplete)).toHaveLength(2);
  });
});
