import { brotliDecompressSync } from "node:zlib";

/**
 * Minimal WOFF2 reader for tests: decodes the table directory, decompresses the
 * brotli stream and returns the code points of the `cmap` table. No dependency
 * on Python or a font library, so the coverage test runs under plain `vitest`.
 * (cmap is never transformed in WOFF2; only glyf/loca/hmtx can be.)
 */

const KNOWN_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ",
  "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS",
  "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc",
  "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop",
  "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
] as const;

interface Cursor {
  pos: number;
}

function readBase128(view: DataView, c: Cursor): number {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = view.getUint8(c.pos++);
    if (i === 0 && byte === 0x80) throw new Error("woff2: UIntBase128 with leading zero");
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error("woff2: UIntBase128 longer than 5 bytes");
}

export interface Woff2Font {
  readonly tables: ReadonlyMap<string, Uint8Array>;
  readonly codePoints: ReadonlySet<number>;
}

export function readWoff2(file: Uint8Array): Woff2Font {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (view.getUint32(0) !== 0x774f4632) throw new Error("woff2: bad signature");
  if (view.getUint32(4) === 0x74746366) throw new Error("woff2: font collections are not supported");
  const numTables = view.getUint16(12);
  const totalCompressedSize = view.getUint32(20);
  const c: Cursor = { pos: 48 };
  const dir: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = view.getUint8(c.pos++);
    const tagIndex = flags & 0x3f;
    const transform = flags >> 6;
    let tag: string;
    if (tagIndex === 63) {
      tag = String.fromCharCode(...file.subarray(c.pos, c.pos + 4));
      c.pos += 4;
    } else {
      tag = KNOWN_TAGS[tagIndex] ?? `#${tagIndex}`;
    }
    const origLength = readBase128(view, c);
    const transformed = tag === "glyf" || tag === "loca" ? transform !== 3 : transform !== 0;
    const length = transformed ? readBase128(view, c) : origLength;
    dir.push({ tag, length });
  }
  const stream = brotliDecompressSync(file.subarray(c.pos, c.pos + totalCompressedSize));
  const tables = new Map<string, Uint8Array>();
  let offset = 0;
  for (const { tag, length } of dir) {
    tables.set(tag, new Uint8Array(stream.buffer, stream.byteOffset + offset, length));
    offset += length;
  }
  const cmap = tables.get("cmap");
  if (!cmap) throw new Error("woff2: no cmap table");
  return { tables, codePoints: parseCmap(cmap) };
}

function parseCmap(cmap: Uint8Array): Set<number> {
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  const numTables = view.getUint16(2);
  const out = new Set<number>();
  for (let i = 0; i < numTables; i++) {
    const platform = view.getUint16(4 + i * 8);
    const encoding = view.getUint16(6 + i * 8);
    const offset = view.getUint32(8 + i * 8);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    const format = view.getUint16(offset);
    if (format === 4) parseFormat4(view, offset, out);
    else if (format === 12) parseFormat12(view, offset, out);
  }
  return out;
}

function parseFormat4(view: DataView, base: number, out: Set<number>): void {
  const segCount = view.getUint16(base + 6) / 2;
  const endCodes = base + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;
  for (let s = 0; s < segCount; s++) {
    const end = view.getUint16(endCodes + s * 2);
    const start = view.getUint16(startCodes + s * 2);
    const delta = view.getUint16(idDeltas + s * 2);
    const rangeOffset = view.getUint16(idRangeOffsets + s * 2);
    for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (cp + delta) & 0xffff;
      } else {
        const addr = idRangeOffsets + s * 2 + rangeOffset + (cp - start) * 2;
        glyph = view.getUint16(addr);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) out.add(cp);
    }
  }
}

function parseFormat12(view: DataView, base: number, out: Set<number>): void {
  const groups = view.getUint32(base + 12);
  for (let g = 0; g < groups; g++) {
    const start = view.getUint32(base + 16 + g * 12);
    const end = view.getUint32(base + 20 + g * 12);
    const glyph = view.getUint32(base + 24 + g * 12);
    for (let cp = start; cp <= end; cp++) if (glyph + (cp - start) !== 0) out.add(cp);
  }
}

/** Expands a CSS unicode-range ("U+0591-05C7,U+05D0") to code points. */
export function parseUnicodeRange(spec: string): Set<number> {
  const out = new Set<number>();
  for (const raw of spec.split(",")) {
    const part = raw.trim().replace(/^U\+/i, "");
    if (!part) continue;
    const [lo = "", hi] = part.split("-");
    const start = Number.parseInt(lo, 16);
    const end = hi === undefined ? start : Number.parseInt(hi, 16);
    for (let cp = start; cp <= end; cp++) out.add(cp);
  }
  return out;
}
