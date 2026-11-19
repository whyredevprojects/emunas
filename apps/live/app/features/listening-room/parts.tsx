/** Small shared pieces of the listening room. */
import { formatClock, notice, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import type { JSX, ReactNode } from "react";
import { Link } from "react-router";
import { Text } from "../../components/Text.tsx";
import { ReportButton, type FeedbackField } from "../feedback/index.ts";
import type { EntityChip } from "./data.ts";
import type { RoomContext } from "./context.ts";
import { roomStyles as s } from "./styles.ts";

const paths = livePaths();

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

/** "Something's wrong here" (W4.7) on one item of this shiur, or on the shiur itself (`id` null). */
export function Report({ room, id, field }: { room: RoomContext; id: string | null; field?: FeedbackField }): JSX.Element {
  return <ReportButton ui={room.ui} rev={room.shiur.rev} target={{ shiurId: room.shiur.id, momentId: id, field: field ?? null }} />;
}

/** A topic of this shiur as a chip: opens the topic beside the shiur (side pane or sheet). */
export function TopicChipButton({ room, topic }: { room: RoomContext; topic: EntityChip }): JSX.Element {
  const label = <Text value={topic.label} lang={room.ui} />;
  const open = room.openTopic;
  if (!open) {
    return (
      <Link to={paths.topic(room.ui, topic.id)} className={s.topicChip} data-topic-chip={topic.id}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" className={s.topicChip} onClick={() => open(topic)} aria-haspopup="dialog" data-topic-chip={topic.id}>
      {label}
    </button>
  );
}
