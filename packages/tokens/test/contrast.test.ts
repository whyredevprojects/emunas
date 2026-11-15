import { describe, expect, it } from "vitest";
import { colors, type ColorRole } from "../src/index.ts";

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => {
    const c = Number.parseInt(h ?? "0", 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground, background, minimum ratio]. Body ink is held to AAA, other text to AA, UI marks to 3:1. */
const PAIRS: [ColorRole, ColorRole, number][] = [
  ["ink", "paper", 7],
  ["ink", "paper-sunk", 7],
  ["ink", "surface", 7],
  ["ink", "highlight", 7],
  ["ink-muted", "paper", 4.5],
  ["ink-muted", "paper-sunk", 4.5],
  ["ink-muted", "surface", 4.5],
  ["accent", "paper", 4.5],
  ["accent", "surface", 4.5],
  ["accent-hover", "paper", 4.5],
  ["on-accent", "accent", 4.5],
  ["now-playing", "paper", 4.5],
  ["danger", "paper", 4.5],
  ["success", "paper", 4.5],
  ["focus", "paper", 3],
  ["focus", "surface", 3],
  ["rule-strong", "paper", 1.8],
];

describe("colour roles meet contrast minimums", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`${theme}`, () => {
      const failures = PAIRS.filter(([fg, bg, min]) => contrast(colors[theme][fg], colors[theme][bg]) < min).map(
        ([fg, bg, min]) => `${fg} on ${bg}: ${contrast(colors[theme][fg], colors[theme][bg]).toFixed(2)} < ${min}`,
      );
      expect(failures).toEqual([]);
    });
  }

  it("sanity: black on white is 21:1", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});
