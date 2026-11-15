/**
 * The Transcript tab of the listening room (concept-live §2 "Designed-in but OFF"; tech-live §3.5;
 * W5.2). Rendered only behind `TRANSCRIPT_VIEW` (app/config/feature-flags.ts) and only for recordings
 * whose approved public file was emitted. Each cue is a time button that seeks the shared player; the
 * cue under the play position is marked (`aria-current`), with no auto-scroll.
 */
import type { JSX } from "react";
import type { RoomContext } from "../listening-room/context.ts";
import { TimeButton } from "../listening-room/parts.tsx";
import { roomStyles as s } from "../listening-room/styles.ts";
import { activeCue, globalCues, type TranscriptFile } from "./contract.ts";
import { transcriptT } from "./strings.ts";

export function TranscriptTab({ room, files }: { room: RoomContext; files: ReadonlyMap<string, TranscriptFile> }): JSX.Element {
  const t = transcriptT(room.ui);
  const recordings = room.shiur.recordings.filter((r) => files.has(r.id));
  const cues = globalCues(recordings, files);
  const active = activeCue(cues, room.now);
  const multi = room.shiur.recordings.length > 1;
  let i = 0;
  return (
    <div data-transcript-tab="">
      <h3 className={s.h3}>{t("tx.heading")}</h3>
      <p className={s.note}>{t("tx.note")}</p>
      {recordings.length === 0 ? <p className={s.note}>{t("tx.none")}</p> : null}
      {recordings.map((r) => {
        const f = files.get(r.id)!;
        const dir = f.lang === "yi" || f.lang === "he" ? "rtl" : "ltr";
        return (
          <section key={r.id} className={s.group} data-recording={r.id}>
            {multi ? <h4 className={s.h3}>{t("tx.part", { n: r.order + 1 })}</h4> : null}
            <p className={s.kind}>{t(f.quality === "reviewed" ? "tx.reviewed" : "tx.highAsr")}</p>
            <ol className={s.itemList} lang={f.lang ?? undefined} dir={dir}>
              {f.cues.map(([start, end, text]) => {
                const idx = i++;
                const on = idx === active;
                return (
                  <li key={`${start}-${idx}`} className={on ? `${s.item} ${s.active}` : s.item} aria-current={on ? "true" : undefined}>
                    <TimeButton room={room} t={r.offset + start} end={r.offset + end} />
                    <span className={s.itemBody}>{text}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
