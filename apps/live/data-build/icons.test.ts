/**
 * The committed PNG icons (`icons.ts`, W5.4): sizes and opacity match their purpose, the web manifest
 * lists only files that exist, and the mark sits inside the maskable safe zone.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { ICONS, ICONS_DIR, iconSvg } from "./icons.ts";

interface Png {
  width: number;
  height: number;
  colorType: number;
  /** Raw scanlines (filter byte + pixels per row). */
  data: Buffer;
}

function readPng(file: string): Png {
  const buf = readFileSync(file);
  expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  let off = 8;
  let ihdr: Buffer | null = null;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") ihdr = body;
    if (type === "IDAT") idat.push(body);
    off += 12 + len;
  }
  if (!ihdr) throw new Error(`${file}: no IHDR`);
  return { width: ihdr.readUInt32BE(0), height: ihdr.readUInt32BE(4), colorType: ihdr[9] ?? -1, data: inflateSync(Buffer.concat(idat)) };
}

/** Alpha of pixel (x, y) of an 8-bit RGBA PNG (undoes the scanline filters). */
function alphaAt(png: Png, x: number, y: number): number {
  const bpp = 4;
  const stride = png.width * bpp;
  const rows: Buffer[] = [];
  let prev = Buffer.alloc(stride);
  for (let r = 0; r <= y; r++) {
    const start = r * (stride + 1);
    const filter = png.data[start] ?? 0;
    const line = Buffer.from(png.data.subarray(start + 1, start + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? (line[i - bpp] ?? 0) : 0;
      const b = prev[i] ?? 0;
      const c = i >= bpp ? (prev[i - bpp] ?? 0) : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const add = [0, a, b, (a + b) >> 1, paeth][filter] ?? 0;
      line[i] = ((line[i] ?? 0) + add) & 0xff;
    }
    rows.push(line);
    prev = line;
  }
  return rows[y]?.[x * bpp + 3] ?? -1;
}

const manifest = JSON.parse(readFileSync(join(ICONS_DIR, "../manifest.webmanifest"), "utf8")) as {
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
  shortcuts: { icons?: { src: string }[] }[];
};

describe("app icons", () => {
  it("every PNG exists at its size; full-bleed ones are opaque, `any` keeps transparent corners", () => {
    for (const icon of ICONS) {
      const png = readPng(join(ICONS_DIR, icon.file));
      expect([png.width, png.height], icon.file).toEqual([icon.size, icon.size]);
      if (icon.variant === "full-bleed") {
        expect(png.colorType, `${icon.file} has no alpha channel`).toBe(2);
      } else {
        expect(png.colorType).toBe(6);
        expect(alphaAt(png, 0, 0), `${icon.file} corner`).toBe(0);
        expect(alphaAt(png, icon.size >> 1, icon.size >> 1), `${icon.file} centre`).toBe(255);
      }
    }
  });

  it("the manifest lists 192 and 512 PNGs for `any` and `maskable`, all of which exist", () => {
    const srcs = [...manifest.icons.map((i) => i.src), ...manifest.shortcuts.flatMap((s) => (s.icons ?? []).map((i) => i.src))];
    for (const src of srcs) expect(existsSync(join(ICONS_DIR, "..", src)), src).toBe(true);
    for (const purpose of ["any", "maskable"]) {
      const sizes = manifest.icons.filter((i) => i.type === "image/png" && i.purpose === purpose).map((i) => i.sizes);
      expect(sizes, purpose).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    }
    for (const i of manifest.icons) {
      const file = ICONS.find((x) => `/icons/${x.file}` === i.src);
      if (file) expect(i.sizes).toBe(`${file.size}x${file.size}`);
    }
  });

  it("the mark lies inside the maskable safe zone (a circle of 40% of the size)", () => {
    const svg = readFileSync(join(ICONS_DIR, "icon.svg"), "utf8");
    const box = /viewBox="0 0 (\d+) (\d+)"/u.exec(svg);
    const size = Number(box?.[1]);
    const stroke = Number(/stroke-width="([\d.]+)"/u.exec(svg)?.[1]);
    const lines = [...svg.matchAll(/d="M([\d.]+) ([\d.]+)v(-?[\d.]+)"/gu)];
    expect(lines.length).toBeGreaterThan(0);
    const c = size / 2;
    for (const m of lines) {
      const x = Number(m[1]);
      const y0 = Number(m[2]);
      const y1 = y0 + Number(m[3]);
      // Round caps reach stroke/2 beyond each end, in every direction.
      for (const y of [y0, y1]) expect(Math.hypot(x - c, y - c) + stroke / 2).toBeLessThanOrEqual(0.4 * size);
    }
    expect(iconSvg(svg, "full-bleed")).not.toMatch(/rx=/u);
    expect(iconSvg(svg, "any")).toBe(svg);
  });
});
