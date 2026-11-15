/** Typed access to `Mix.module.css` (same pattern as `features/series/styles.ts`); a test checks the list. */
import raw from "./Mix.module.css";

export const MIX_CLASSES = ["actions", "auto", "button", "header", "items", "link", "meta", "mix", "muted", "primary", "title"] as const;

export type MixClass = (typeof MIX_CLASSES)[number];

export const mixStyles: Readonly<Record<MixClass, string>> = Object.fromEntries(
  MIX_CLASSES.map((k) => [k, (raw as Readonly<Record<string, string | undefined>>)[k] ?? k]),
) as Record<MixClass, string>;
