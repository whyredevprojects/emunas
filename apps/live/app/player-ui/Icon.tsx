/**
 * Transport icons as inline SVG (no icon font, no requests). Decorative: the buttons carry the names.
 * Direction-dependent glyphs (previous/next, back/forward, play) flip in RTL via `:dir(rtl)` in the
 * CSS, so "next" always points the way the progress bar runs.
 */
import type { JSX } from "react";
import { dockStyles as s } from "./styles.ts";

export type IconName = "play" | "pause" | "prev" | "next" | "back15" | "fwd15";

const PATHS: Record<IconName, string> = {
  play: "M8 5v14l11-7z",
  pause: "M6 5h4v14H6zM14 5h4v14h-4z",
  prev: "M6 6h2v12H6zM9.5 12 18 18V6z",
  next: "M16 6h2v12h-2zM6 18l8.5-6L6 6z",
  back15: "M12 5V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z",
  fwd15: "M12 5V1l5 5-5 5V7a5 5 0 1 0 5 5h2a7 7 0 1 1-7-7z",
};

const DIRECTIONAL: ReadonlySet<IconName> = new Set<IconName>(["prev", "next", "back15", "fwd15", "play"]);

export function Icon({ name }: { name: IconName }): JSX.Element {
  return (
    <svg
      className={DIRECTIONAL.has(name) ? `${s.icon} ${s.iconFlip}` : s.icon}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} fill="currentColor" />
    </svg>
  );
}
