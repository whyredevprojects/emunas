/**
 * A small window-scroll virtualizer for Explore's result lists (tech-live §4.3; 997 shiurim, ~17,000
 * moments per language). Rows have one fixed height (the CSS clamps their text), so the visible
 * range is plain arithmetic and nothing is measured per row. Only the rows in view, plus an
 * overscan on each side, are in the DOM; spacer heights keep the scrollbar honest.
 *
 * Keyboard users tab through the rendered rows; moving focus to the last rendered link scrolls the
 * page, which renders the next rows before focus needs them (overscan ≥ one screen).
 */
import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";

export interface WindowRange {
  start: number;
  /** Exclusive. */
  end: number;
}

/**
 * Rows to render for a list whose top is `listTop` px from the top of the viewport.
 * @param viewport viewport height in px
 */
export function windowRange(listTop: number, viewport: number, rowHeight: number, count: number, overscan: number): WindowRange {
  if (count === 0 || rowHeight <= 0) return { start: 0, end: 0 };
  const first = Math.floor(-listTop / rowHeight) - overscan;
  const last = Math.ceil((viewport - listTop) / rowHeight) + overscan;
  const start = Math.min(count, Math.max(0, first));
  const end = Math.max(start, Math.min(count, Math.max(0, last)));
  return { start, end };
}

const useIsoLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

/** Pixels per rem (16 when the computed style is unavailable, e.g. jsdom). */
export function remPx(): number {
  if (typeof document === "undefined") return 16;
  const v = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(v) && v > 0 ? v : 16;
}

export function useVirtualWindow(ref: RefObject<HTMLElement | null>, count: number, rowHeight: number, overscan = 8): WindowRange {
  const initial = Math.min(count, overscan * 3);
  const [range, setRange] = useState<WindowRange>({ start: 0, end: initial });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const viewport = window.innerHeight || document.documentElement.clientHeight || 800;
    const next = windowRange(top, viewport, rowHeight, count, overscan);
    setRange((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, [ref, count, rowHeight, overscan]);

  useIsoLayoutEffect(() => {
    update();
  }, [update]);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [update]);

  return range;
}
