/**
 * Design primitives shared by both sites (integration-plan §1.3): type scale,
 * spacing, radii, rules, motion and semantic colour roles for light and dark.
 * Theme, components and layout stay in each app (Quiet: printed catalog; Live:
 * app shell). This file is the source of truth; `npm run css` writes
 * css/tokens.css from it and a test keeps the two in sync.
 *
 * Every custom property is emitted as `--<group>-<name>`, e.g. `--space-m`,
 * `--color-ink`, `--step-1`.
 */

/** Modular type scale (ratio ≈ 1.2) in rem. `0` is body text. */
export const typeScale = {
  "-2": "0.75rem",
  "-1": "0.875rem",
  "0": "1rem",
  "1": "1.125rem",
  "2": "1.3125rem",
  "3": "1.5625rem",
  "4": "1.875rem",
  "5": "2.25rem",
  "6": "2.75rem",
} as const;

export const lineHeight = {
  tight: "1.2",
  snug: "1.35",
  body: "1.6",
  /** Hebrew/Yiddish running text: nikud need more room between lines. */
  hebrew: "1.75",
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

/** Reading measures for a single column of running text. */
export const measure = {
  narrow: "45ch",
  text: "66ch",
  wide: "80ch",
} as const;

/** Spacing scale in rem, used for margins, gaps and padding (logical properties only). */
export const space = {
  "0": "0",
  "3xs": "0.125rem",
  "2xs": "0.25rem",
  xs: "0.5rem",
  s: "0.75rem",
  m: "1rem",
  l: "1.5rem",
  xl: "2rem",
  "2xl": "3rem",
  "3xl": "4rem",
  "4xl": "6rem",
} as const;

export const radius = {
  none: "0",
  s: "2px",
  m: "4px",
  l: "8px",
  pill: "999px",
} as const;

export const rule = {
  hairline: "1px",
  thick: "2px",
  focus: "3px",
} as const;

export const motion = {
  fast: "120ms",
  base: "200ms",
  slow: "320ms",
  ease: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

export type ColorRole =
  | "paper"
  | "paper-sunk"
  | "surface"
  | "ink"
  | "ink-muted"
  | "ink-faint"
  | "rule"
  | "rule-strong"
  | "accent"
  | "accent-hover"
  | "on-accent"
  | "focus"
  | "highlight"
  | "now-playing"
  | "danger"
  | "success";

/**
 * Semantic colour roles. Quiet reads "paper and ink with one restrained accent"
 * (concept-quiet §11); Live builds its shell from the same roles. `ink-faint`
 * and `rule*` are for decoration and hairlines only, never for text.
 */
export const colors: Readonly<Record<"light" | "dark", Readonly<Record<ColorRole, string>>>> = {
  light: {
    paper: "#fbf8f1",
    "paper-sunk": "#f2ede2",
    surface: "#fffdf8",
    ink: "#1c1a17",
    "ink-muted": "#575248",
    "ink-faint": "#8c8578",
    rule: "#ddd5c5",
    "rule-strong": "#b9af9c",
    accent: "#7a2e1f",
    "accent-hover": "#5e2215",
    "on-accent": "#fffdf8",
    focus: "#1f5fbf",
    highlight: "#f3e6bd",
    "now-playing": "#7a2e1f",
    danger: "#a1261b",
    success: "#2f6b3a",
  },
  dark: {
    paper: "#16140f",
    "paper-sunk": "#0f0d0a",
    surface: "#1f1c16",
    ink: "#ede7da",
    "ink-muted": "#b5ad9d",
    "ink-faint": "#7a7366",
    rule: "#38332a",
    "rule-strong": "#5a5345",
    accent: "#e4a483",
    "accent-hover": "#f0bea3",
    "on-accent": "#16140f",
    focus: "#8ab4ff",
    highlight: "#4a3f22",
    "now-playing": "#e4a483",
    danger: "#f08a7e",
    success: "#8cc79a",
  },
};

/**
 * Hebrew is set somewhat larger than the Latin beside it so the two read at equal
 * weight (concept-quiet §8). Applied as `size-adjust` on the Hebrew faces, so it
 * works inside mixed runs without markup.
 */
export const hebrewSizeAdjust = {
  serif: 1.1,
  sans: 1.04,
} as const;
