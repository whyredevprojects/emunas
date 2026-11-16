/**
 * Chapters (concept-live §5.3): titles and summaries, the active one highlighted while it plays.
 * `kind` drives behaviour: noise / singing / other_speaker are greyed and marked as skipped (when the
 * skip setting covers them); `story` carries a marker; intro / closing / brachah are collapsed. An
 * interlude (`noise`) shows its neutral title from the data with no kind label.
 * Each chapter shows its topic chips from the corpus layer (none on other-speaker chapters); a chip
 * opens the topic beside the shiur while the audio continues (concept-live-corpus D).
 */
import { formatClock, sectionKindLabel } from "@emunas/i18n";
import type { JSX } from "react";
import { Text } from "../../components/Text.tsx";
import type { RoomContext } from "./context.ts";
import { chapterTopics } from "./corpus.ts";
import { COLLAPSED_KINDS, SKIPPED_KINDS, chapterAt } from "./model.ts";
import { AiLabel, Report, TimeButton, TopicChipButton } from "./parts.tsx";
import { roomStyles as s } from "./styles.ts";

export function Chapters({ room }: { room: RoomContext }): JSX.Element | null {
  const { shiur, ui, rt, reading } = room;
  const chapters = shiur.notes?.chapters;
  if (!chapters || chapters.length === 0) return null;
  const active = room.now === null ? -1 : chapterAt(chapters, room.now);

  return (
    <section className={s.chapters} aria-labelledby="room-chapters">
      <h2 id="room-chapters" className={s.h2}>
        {rt("room.chapters")}
      </h2>
      <AiLabel ui={ui} />
      <ol className={s.chapterList}>
        {chapters.map((c, i) => {
          const skipped = SKIPPED_KINDS.has(c.kind) && room.skippedKinds.has(c.kind);
          const collapsed = COLLAPSED_KINDS.has(c.kind);
          const classes = [s.chapter];
          if (i === active) classes.push(s.active);
          if (skipped) classes.push(s.muted);
          if (room.focusedMoment === c.id) classes.push(s.focused);
          const title = (
            <button
              type="button"
              className={s.chapterTitle}
              onClick={() => room.playAt(c.t)}
              disabled={!room.playable}
              data-seek={c.t}
              data-chapter={i}
            >
              <span className={s.timeText}>{formatClock(c.t)}</span>
              <Text value={c.title} lang={reading} />
            </button>
          );
          const summary = <Text as="p" className={s.chapterSummary} value={c.summary} lang={reading} />;
          const topics = c.kind === "other_speaker" ? [] : chapterTopics(shiur, c.idx);
          return (
            <li
              key={c.id}
              id={`chapter-${c.idx}`}
              className={classes.join(" ")}
              aria-current={i === active ? "true" : undefined}
              data-kind={c.kind}
              data-moment={c.id}
            >
              <div className={s.chapterHead}>
                {title}
                {c.kind === "story" ? <span className={s.badge}>{rt("room.storyMarker")}</span> : null}
                {c.kind !== "story" && c.kind !== "main" && c.kind !== "noise" ? (
                  <span className={s.kind}>{sectionKindLabel(c.kind, ui)}</span>
                ) : null}
                {skipped ? <span className={s.kind}>{rt("room.chapterSkipped")}</span> : null}
                <Report room={room} id={c.id} field="summary" />
              </div>
              {collapsed ? (
                <details className={s.details}>
                  <summary>{rt("room.moreAbout")}</summary>
                  {summary}
                </details>
              ) : (
                summary
              )}
              {topics.length > 0 ? (
                <ul className={s.topicChips} aria-label={rt("corpus.chapterTopics")} data-chapter-topics={c.idx}>
                  {topics.map((topic) => (
                    <li key={topic.id}>
                      <TopicChipButton room={room} topic={topic} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {c.sub.length > 0 && !collapsed ? (
                <ul className={s.subList}>
                  {c.sub.map((sub) => (
                    <li key={`${sub.t}-${sub.title.en}`}>
                      <TimeButton room={room} t={sub.t} />
                      <Text value={sub.title} lang={reading} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
