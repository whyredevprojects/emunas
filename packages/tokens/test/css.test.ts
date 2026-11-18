import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fontsCss, tokensCss } from "../src/css.ts";
import { colors, fontStacks, sizeAdjustOf, space, typeScale, type ColorRole } from "../src/index.ts";

const cssDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "css");
const read = (name: string): string => readFileSync(join(cssDir, name), "utf8");

describe("generated CSS", () => {
  it("is up to date with src/ and the font manifest (run `npm run css -w @emunas/tokens`)", () => {
    expect(read("tokens.css")).toBe(tokensCss());
    expect(read("fonts.css")).toBe(fontsCss());
  });

  it("declares every token as a custom property", () => {
    const css = read("tokens.css");
    for (const k of Object.keys(typeScale)) expect(css).toContain(`--step-${k}: `);
    for (const k of Object.keys(space)) expect(css).toContain(`--space-${k}: `);
    for (const k of Object.keys(fontStacks)) expect(css).toContain(`--font-${k}: `);
    for (const role of Object.keys(colors.light) as ColorRole[]) {
      expect(css).toContain(`--color-${role}: ${colors.light[role]};`);
      expect(css).toContain(`--color-${role}: ${colors.dark[role]};`);
    }
  });

  it("orders the type scale from small to large", () => {
    const steps = [...read("tokens.css").matchAll(/--step-(-?\d+): ([\d.]+)rem;/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    expect(steps.map(([k]) => k)).toEqual([-2, -1, 0, 1, 2, 3, 4, 5, 6]);
    for (let i = 1; i < steps.length; i++) expect(steps[i]?.[1]).toBeGreaterThan(steps[i - 1]?.[1] ?? 0);
  });

  it("is light by default whatever the OS prefers; data-theme=\"dark\" opts into dark", () => {
    const css = read("tokens.css");
    expect(css).toMatch(/:root \{\s*color-scheme: light;/);
    expect(css).not.toContain("prefers-color-scheme");
    expect(css).toContain(':root[data-theme="dark"] {\n    color-scheme: dark;');
    expect(css).not.toContain('[data-theme="light"]');
  });

  it("uses no physical direction properties (RTL and LTR share one stylesheet)", () => {
    for (const name of ["tokens.css", "fonts.css"]) {
      expect(read(name)).not.toMatch(/\b(margin|padding|border)-(left|right)\b|\b(left|right)\s*:|text-align:\s*(left|right)/);
    }
  });

  it("enlarges Hebrew faces and keeps fonts self-hosted", () => {
    const css = read("fonts.css");
    expect(sizeAdjustOf("Frank Ruhl Libre")).toBeGreaterThan(1);
    expect(sizeAdjustOf("Source Serif 4")).toBe(1);
    expect(sizeAdjustOf("Emunas Hebrew Marks")).toBeGreaterThan(0.8);
    expect(sizeAdjustOf("Emunas Hebrew Marks")).toBeLessThan(1.4);
    expect(css).not.toMatch(/https?:/);
    expect(css).toContain("font-display: swap;");
    expect(css).toMatch(/font-family: "Frank Ruhl Libre Fallback";[^}]*ascent-override: [\d.]+%;/);
  });
});
