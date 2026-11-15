/**
 * Typed access to `PlayerDock.module.css` (same pattern as `shell/styles.ts`): Vite types CSS Modules
 * as a string index; this lists the classes once and `player-ui.test.tsx` checks the list against
 * the stylesheet.
 */
import raw from "./PlayerDock.module.css";

export const DOCK_CLASSES = [
  "bar",
  "button",
  "extras",
  "icon",
  "iconFlip",
  "idle",
  "info",
  "notice",
  "play",
  "range",
  "root",
  "select",
  "speed",
  "textButton",
  "tick",
  "ticks",
  "time",
  "title",
  "titleRow",
  "transport",
  "visuallyHidden",
  "wide",
] as const;

export type DockClass = (typeof DOCK_CLASSES)[number];

export const dockStyles: Readonly<Record<DockClass, string>> = Object.fromEntries(
  DOCK_CLASSES.map((k) => [k, (raw as Readonly<Record<string, string | undefined>>)[k] ?? k]),
) as Record<DockClass, string>;
