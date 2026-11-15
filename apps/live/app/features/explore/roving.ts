/**
 * Roving tabindex for the SVG lenses: one stop in each group is in the tab order; arrow keys move
 * between stops (mirrored in right-to-left layouts), Home/End jump to the ends, Enter/Space choose.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

/** The index a key moves to, or null when the key is not a navigation key. */
export function rovingTarget(key: string, index: number, count: number, rtl: boolean): number | null {
  if (count === 0) return null;
  const fwd = (n: number) => (index + n + count) % count;
  switch (key) {
    case "ArrowRight":
      return fwd(rtl ? -1 : 1);
    case "ArrowLeft":
      return fwd(rtl ? 1 : -1);
    case "ArrowDown":
      return fwd(1);
    case "ArrowUp":
      return fwd(-1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export interface Roving {
  /** Props for stop `i`. */
  item(i: number, onChoose: () => void): {
    tabIndex: number;
    ref: (el: SVGElement | HTMLElement | null) => void;
    onKeyDown: (e: KeyboardEvent) => void;
    onFocus: () => void;
    onClick: () => void;
  };
}

export function useRoving(count: number, rtl: boolean, initial = 0): Roving {
  const [active, setActive] = useState(Math.min(Math.max(0, initial), Math.max(0, count - 1)));
  const els = useRef<(SVGElement | HTMLElement | null)[]>([]);
  useEffect(() => {
    if (active >= count && count > 0) setActive(count - 1);
  }, [active, count]);
  const item = useCallback<Roving["item"]>(
    (i, onChoose) => ({
      tabIndex: i === active ? 0 : -1,
      ref: (el) => {
        els.current[i] = el;
      },
      onFocus: () => setActive(i),
      onClick: onChoose,
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onChoose();
          return;
        }
        const next = rovingTarget(e.key, i, count, rtl);
        if (next === null) return;
        e.preventDefault();
        setActive(next);
        els.current[next]?.focus();
      },
    }),
    [active, count, rtl],
  );
  return { item };
}
