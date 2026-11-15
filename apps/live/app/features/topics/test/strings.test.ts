/**
 * The topic page and mix string tables: Yiddish has every English key with the same placeholders,
 * and follows the copy decisions the app-wide Yiddish check guards (section = חלק, no nikud).
 */
import { describe, expect, it } from "vitest";
import { mixEn, mixYi } from "../../mix/strings.ts";
import { topicsEn, topicsYi } from "../strings.ts";

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}
const placeholders = (v: unknown) => [...new Set(strings(v).flatMap((s) => s.match(/\{\w+\}/g) ?? []))].sort();

describe.each([
  ["topics", topicsEn, topicsYi],
  ["mix", mixEn, mixYi],
] as const)("%s strings", (_name, en, yi) => {
  it("Yiddish has the English keys and placeholders", () => {
    expect(Object.keys(yi).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries(en)) expect(placeholders((yi as Record<string, unknown>)[k]), k).toEqual(placeholders(v));
  });

  it("keeps the Yiddish copy decisions", () => {
    const all = strings(yi);
    expect(all.filter((s) => /[ְ-ׇֽֿׁׂׅׄװ-ײ]/u.test(s))).toEqual([]);
    expect(all.filter((s) => /(?<![א-ת])טייל(ן)?(?![א-ת])|קאפיטל|לאדנט|(?<![א-ת])ניט(?![א-ת])/u.test(s))).toEqual([]);
    expect(all.filter((s) => /דער רב(?![א-ת])/u.test(s))).toEqual([]);
  });
});
