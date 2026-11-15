import manifestJson from "../fonts/manifest.json" with { type: "json" };
import { hebrewSizeAdjust } from "./tokens.ts";

export interface FontMetrics {
  readonly unitsPerEm: number;
  readonly ascender: number;
  readonly descender: number;
  readonly lineGap: number;
  /** yMax of ה (U+05D4) at the default instance, when the face has it. */
  readonly hebrewHeight: number | null;
  /** yMax of x, when the face has it. */
  readonly xHeight: number | null;
}

export interface FontFace {
  readonly id: string;
  readonly family: FontFamily;
  readonly style: "normal" | "italic";
  /** [min, max]; equal for a static face. */
  readonly weight: readonly [number, number];
  readonly variable: boolean;
  /** File name inside fonts/. */
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  /** CSS unicode-range of the code points actually present in the subset. */
  readonly unicodeRange: string;
  readonly metrics: FontMetrics;
  readonly source: { readonly package: string; readonly file: string };
}

export interface FontManifest {
  readonly packages: Readonly<Record<string, { readonly spec: string; readonly integrity: string; readonly license: string }>>;
  readonly totalBytes: number;
  readonly faces: readonly FontFace[];
}

export type FontFamily = "Frank Ruhl Libre" | "Emunas Hebrew Marks" | "Source Serif 4" | "Noto Sans Hebrew" | "Noto Sans";

export const FONT_FAMILIES: readonly FontFamily[] = [
  "Frank Ruhl Libre",
  "Emunas Hebrew Marks",
  "Source Serif 4",
  "Noto Sans Hebrew",
  "Noto Sans",
];

function isFamily(value: string): value is FontFamily {
  return (FONT_FAMILIES as readonly string[]).includes(value);
}

function checkManifest(raw: typeof manifestJson): FontManifest {
  for (const face of raw.faces) {
    if (!isFamily(face.family)) throw new Error(`fonts/manifest.json: unknown family ${face.family}`);
    if (face.style !== "normal" && face.style !== "italic") throw new Error(`fonts/manifest.json: bad style ${face.style}`);
    if (face.weight.length !== 2) throw new Error(`fonts/manifest.json: bad weight for ${face.id}`);
  }
  return raw as unknown as FontManifest;
}

/** The generated font manifest (fonts/manifest.json, written by scripts/subset_fonts.py). */
export const fontManifest: FontManifest = checkManifest(manifestJson);

/**
 * What each family is for:
 * - Frank Ruhl Libre: Hebrew/Yiddish text face (Quiet body, headings on both sites).
 * - Emunas Hebrew Marks: Noto Serif Hebrew, only reached for clusters Frank Ruhl
 *   Libre cannot draw (cantillation U+0591–05AF, U+05C4–05C6, U+FB1E, U+FB29).
 * - Source Serif 4: Latin book face (English edition body), with transliteration.
 * - Noto Sans Hebrew + Noto Sans: UI sans for the Live shell.
 */
export interface FallbackFace {
  readonly family: string;
  readonly of: FontFamily;
  readonly local: readonly string[];
}

/** Locally installed faces with metric overrides, used while the web fonts load (`font-display: swap`). */
export const FALLBACK_FACES: readonly FallbackFace[] = [
  { family: "Frank Ruhl Libre Fallback", of: "Frank Ruhl Libre", local: ["Times New Roman", "Tinos", "Liberation Serif", "David"] },
  { family: "Source Serif 4 Fallback", of: "Source Serif 4", local: ["Georgia", "Times New Roman", "Tinos", "Liberation Serif"] },
  { family: "Noto Sans Hebrew Fallback", of: "Noto Sans Hebrew", local: ["Arial", "Arial Hebrew", "Arimo", "Liberation Sans"] },
  { family: "Noto Sans Fallback", of: "Noto Sans", local: ["Arial", "Helvetica", "Arimo", "Liberation Sans"] },
];

const q = (family: string): string => `"${family}"`;

/**
 * Font stacks, emitted as `--font-*` custom properties. The edition's script
 * comes first; the other script follows so mixed runs ("The קדושה of צדיקים")
 * draw each script from its own face.
 */
export const fontStacks = {
  "serif-latin": [
    "Source Serif 4",
    "Frank Ruhl Libre",
    "Emunas Hebrew Marks",
    "Source Serif 4 Fallback",
    "Frank Ruhl Libre Fallback",
  ].map(q).concat(["Georgia", "serif"]).join(", "),
  "serif-hebrew": [
    "Frank Ruhl Libre",
    "Emunas Hebrew Marks",
    "Source Serif 4",
    "Frank Ruhl Libre Fallback",
    "Source Serif 4 Fallback",
  ].map(q).concat(["serif"]).join(", "),
  "sans-latin": ["Noto Sans", "Noto Sans Hebrew", "Noto Sans Fallback", "Noto Sans Hebrew Fallback"]
    .map(q)
    .concat(["system-ui", "sans-serif"])
    .join(", "),
  "sans-hebrew": ["Noto Sans Hebrew", "Noto Sans", "Noto Sans Hebrew Fallback", "Noto Sans Fallback"]
    .map(q)
    .concat(["system-ui", "sans-serif"])
    .join(", "),
} as const;

/**
 * size-adjust per family, as a factor. Hebrew faces are enlarged by
 * `hebrewSizeAdjust`; the marks face is scaled so its ה matches Frank Ruhl
 * Libre's at that size.
 */
export function sizeAdjustOf(family: FontFamily, manifest: FontManifest = fontManifest): number {
  if (family === "Frank Ruhl Libre") return hebrewSizeAdjust.serif;
  if (family === "Noto Sans Hebrew") return hebrewSizeAdjust.sans;
  if (family === "Emunas Hebrew Marks") {
    const heightOf = (fam: FontFamily): number | null => {
      const face = manifest.faces.find((f) => f.family === fam && f.metrics.hebrewHeight !== null);
      return face?.metrics.hebrewHeight == null ? null : face.metrics.hebrewHeight / face.metrics.unitsPerEm;
    };
    const frank = heightOf("Frank Ruhl Libre");
    const marks = heightOf("Emunas Hebrew Marks");
    return frank && marks ? Math.round((hebrewSizeAdjust.serif * frank * 1000) / marks) / 1000 : hebrewSizeAdjust.serif;
  }
  return 1;
}

export type FontRole = "serif" | "sans";

/**
 * Files worth `<link rel=preload>` for an edition: only the body face of the
 * edition's script (tech-quiet §3.5 "only the edition's body face preloaded").
 */
export function preloadFonts(role: FontRole, lang: "en" | "yi", manifest: FontManifest = fontManifest): string[] {
  const id =
    role === "serif"
      ? lang === "yi"
        ? "frank-ruhl-libre-hebrew"
        : "source-serif-4-latin"
      : lang === "yi"
        ? "noto-sans-hebrew-hebrew"
        : "noto-sans-latin";
  return manifest.faces.filter((f) => f.id === id).map((f) => f.file);
}
