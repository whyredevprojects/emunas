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
const he: MessageTable<UiKey> = {
  "nav.home": "בית",
  "shiur.by": "שיעור מאת {name}",
  "list.count": { one: "שיעור אחד", two: "שני שיעורים", other: "{count} שיעורים" },
};
const tables = { en, yi, he };

describe("createT", () => {
  const tEn = createT<UiKey>(tables, "en");
  const tYi = createT<UiKey>(tables, "yi");
  const tHe = createT<UiKey>(tables, "he");

  it("looks up plain messages per language", () => {
    expect(tEn("nav.home")).toBe("Home");
    expect(tYi("nav.home")).toBe("היים");
    expect(tEn.lang).toBe("en");
    expect(tYi.lang).toBe("yi");
    expect(tHe("nav.home")).toBe("בית");
    expect(tHe.lang).toBe("he");
  });

  it("interpolates params and leaves unknown placeholders visible", () => {
    expect(tEn("shiur.by", { name: "the Mashgiach" })).toBe("Shiur by the Mashgiach");
    expect(tYi("shiur.by", { name: "דער משגיח" })).toBe("שיעור פון דער משגיח");
    expect(tEn("shiur.by")).toBe("Shiur by {name}");
    expect(tEn("shiur.by", {})).toBe("Shiur by {name}");
  });

  it("selects plurals with Intl.PluralRules in every language", () => {
    expect(tEn("list.count", { count: 1 })).toBe("1 shiur");
    expect(tEn("list.count", { count: 0 })).toBe("0 shiurim");
    expect(tEn("list.count", { count: 1997 })).toBe("1,997 shiurim");
    expect(tYi("list.count", { count: 1 })).toBe("1 שיעור");
    expect(tYi("list.count", { count: 2 })).toBe("2 שיעורים");
    expect(tYi("list.count")).toBe("{count} שיעורים");
  });

  it("uses the Hebrew dual form for 2, and other for a message without one", () => {
    expect(tHe("list.count", { count: 1 })).toBe("שיעור אחד");
    expect(tHe("list.count", { count: 2 })).toBe("שני שיעורים");
    expect(tHe("list.count", { count: 3 })).toBe("3 שיעורים");
    expect(tHe("list.count", { count: 0 })).toBe("0 שיעורים");
    const noDual = createT<UiKey>({ ...tables, he: { ...he, "list.count": { one: "שיעור אחד", other: "{count} שיעורים" } } }, "he");
    expect(noDual("list.count", { count: 2 })).toBe("2 שיעורים");
  });

  it("requires a table for every language at the type level", () => {
    // @ts-expect-error -- the he table is missing
    const t = createT<UiKey>({ en, yi }, "en");
    expect(t("nav.home")).toBe("Home");
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
