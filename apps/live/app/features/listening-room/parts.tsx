/** Small shared pieces of the listening room. */
import { formatClock, notice, type UiLang } from "@emunas/i18n";
import type { JSX, ReactNode } from "react";
import type { RoomContext } from "./context.ts";
import { roomStyles as s } from "./styles.ts";

/** The constant AI label on every generated-text surface (concept-live §2, tech-live W8). */
export function AiLabel({ ui }: { ui: UiLang }): JSX.Element {
  return (
    <p className={s.aiLabel} data-ai-label="">
      {notice("aiNotesShort", ui)}
    </p>
  );
}

/**
 * A "play from mm:ss" button. Rendered only for timed items (C6: an untimed item shows without a
 * play control). The visible text is the time; the accessible name says what it does.
 */
export function TimeButton({
  room,
  t,
  end,
  label,
  children,
}: {
  room: RoomContext;
  t: number | null;
  end?: number | undefined;
  /** Accessible name; defaults to "Play from mm:ss". */
  label?: string;
  children?: ReactNode;
}): JSX.Element | null {
  if (t === null) return null;
  const time = formatClock(t);
  return (
    <button
      type="button"
      className={s.timeButton}
      onClick={() => room.playAt(t, end)}
      disabled={!room.playable}
      aria-label={label ?? room.rt("room.playFrom", { time })}
      data-seek={t}
    >
      {children ?? <span className={s.timeText}>{time}</span>}
    </button>
  );
}

/** Whether `t` lies in [start, end). */
export function isActive(now: number | null, start: number | null, end: number | null): boolean {
  return now !== null && start !== null && end !== null && start <= now && now < end;
}
