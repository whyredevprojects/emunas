/**
 * The room header (concept-live §5.3): catalog title as written, the generated one-liner, year,
 * parsha/zman, series position, duration, recording language, path notes, the catalog topics as a
 * clickable table of contents (`catalogTopicIdx`), the play control and the "Printable page" link.
 * Above them, the shiur's top three topics (salience 0.5 and above) as one line, each opening the topic
 * beside the shiur, with the corpus layer's AI label once for the page (concept-live-corpus D, E.3).
 * Under the play button, the version line (cleaned-audio-ux §4 Live): which copy plays, and the
 * button to switch. When the room's shiur is not the loaded one it describes the version that would
 * play.
 */
import { audioLanguageLabel, formatDuration, formatHebrewYears, notice } from "@emunas/i18n";
import type { JSX } from "react";
import { DownloadButton } from "../../../sw/client/DownloadButton.tsx";
import { CorpusLabel } from "../../components/CorpusLabel.tsx";
import { Text } from "../../components/Text.tsx";
import type { AudioVersion } from "@emunas/i18n";
import { getEngine, usePlayerState, VersionLine, versionLineState } from "../../player-ui/index.ts";
import { locate, type PlayerState } from "../../player-engine/index.ts";
import type { RoomContext } from "./context.ts";
import type { ShiurFile } from "./data.ts";
import { mainTopics } from "./corpus.ts";
import { topicTargets } from "./model.ts";
import { AiLabel, Report, TopicChipButton } from "./parts.tsx";
import { printableUrl } from "./quiet-link.ts";
import { roomStyles as s } from "./styles.ts";

/**
 * The version line's state for this room: the engine's when the shiur is loaded, else the recording
 * at the room's start point with the listener's preference (null: no improved copy, no line).
 */
export function roomVersion(state: PlayerState, shiur: ShiurFile, start: number): AudioVersion | null {
  if (state.shiurId === shiur.id) return versionLineState(state.playingVersion, state.cleanedAvailable);
  const loc = locate(shiur, start);
  const rec = (loc ? shiur.recordings[loc.index] : undefined) ?? shiur.recordings.find((r) => r.playable);
  return rec?.playable && rec.cleanedUrl ? state.audioVersion : null;
}

function RoomVersionLine({ room }: { room: RoomContext }): JSX.Element | null {
  const state = usePlayerState();
  const version = room.playable ? roomVersion(state, room.shiur, room.start) : null;
  if (version === null) return null;
  return (
    <p className={s.versionLine} data-room-version="">
      <VersionLine version={version} ui={room.ui} buttonClassName={s.versionButton} />
    </p>
  );
}

export function RoomHeaderDetails({ room, quietOrigin }: { room: RoomContext; quietOrigin: string | null }): JSX.Element {
  const { shiur, ui, rt, reading } = room;
  const notes = shiur.notes;
  const targets = topicTargets(shiur.catalog.topics.length, notes);
  const occasion = shiur.parsha ?? shiur.zman;
  const series = room.info.seriesTitle;
  const printable = printableUrl(quietOrigin, ui, shiur.id);
  const main = mainTopics(shiur);

  const onPlay = () => {
    const engine = getEngine();
    if (engine.getState().shiurId === shiur.id) engine.toggle();
    else room.playAt(room.start);
  };

  return (
    <>
      {main.length > 0 ? (
        <nav aria-label={rt("corpus.topics")} data-room-topics="">
          <ul className={s.topicLine}>
            {main.map((topic) => (
              <li key={topic.id}>
                <TopicChipButton room={room} topic={topic} />
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {shiur.corpus ? <CorpusLabel ui={ui} reviewed={false} className={s.corpusLabel} /> : null}
      {shiur.catalog.subTitle ? (
        <Text as="p" className={s.subTitle} value={shiur.catalog.subTitle} shiurLang={shiur.lang} />
      ) : null}
      {notes ? (
        <div className={s.oneLiner}>
          <Text as="p" value={notes.summary.oneLiner} lang={reading} />
          <AiLabel ui={ui} />
        </div>
      ) : null}

      <dl className={s.facts}>
        {shiur.years.length > 0 ? (
          <div>
            <dt>{rt("room.years")}</dt>
            <dd>{formatHebrewYears(shiur.years, ui)}</dd>
          </div>
        ) : null}
        {occasion ? (
          <div>
            <dt>{rt("room.occasion")}</dt>
            <dd>
              <Text value={occasion.raw} shiurLang={shiur.lang} />
            </dd>
          </div>
        ) : null}
        {shiur.series && series ? (
          <div>
            <dt className={s.visuallyHidden}>{rt("related.series")}</dt>
            <dd>
              {shiur.series.order !== null
                ? rt("room.seriesPart", { series: series[ui], n: shiur.series.order, count: shiur.series.count })
                : rt("room.seriesPartNoOrder", { series: series[ui] })}
              {shiur.perek ? <> · {rt("room.perek", { perek: shiur.perek })}</> : null}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>{rt("room.duration")}</dt>
          <dd>{formatDuration(shiur.duration, ui)}</dd>
        </div>
        <div>
          <dt>{rt("room.audioLang")}</dt>
          <dd>{audioLanguageLabel(shiur.lang, ui)}</dd>
        </div>
      </dl>

      {shiur.pathNotes.length > 0 ? (
        <ul className={s.pathNotes}>
          {shiur.pathNotes.map((n) => (
            <li key={n}>
              <Text value={n} shiurLang={shiur.lang} />
            </li>
          ))}
        </ul>
      ) : null}
      {shiur.catalog.source === "uncatalogued-guide" ? <p className={s.note}>{notice("uncatalogued", ui)}</p> : null}

      <div className={s.actions}>
        <button
          type="button"
          className={s.playButton}
          onClick={onPlay}
          disabled={!room.playable}
          data-room-play=""
        >
          {room.playing ? rt("room.pause") : rt("room.playShiur")}
        </button>
        {printable ? (
          <a className={s.printable} href={printable}>
            {rt("room.printable")}
          </a>
        ) : null}
        <Report room={room} id={null} />
        <DownloadButton shiur={shiur} ui={ui} className={s.printable} />
      </div>
      <RoomVersionLine room={room} />
      {!room.playable ? <p className={s.note}>{rt("room.unavailable")}</p> : null}
      {shiur.recordings.some((r) => !r.playable) && room.playable ? (
        <p className={s.note}>
          {rt("room.unavailablePart", { n: shiur.recordings.findIndex((r) => !r.playable) + 1 })}
        </p>
      ) : null}

      {shiur.catalog.topics.length > 1 || targets.some((x) => x !== null) ? (
        <section className={s.topics} aria-labelledby="room-topics">
          <h2 id="room-topics" className={s.h3}>
            {notes ? rt("room.catalogTopics") : rt("room.outline")}
          </h2>
          <ol className={s.topicList}>
            {shiur.catalog.topics.map((topic, i) => {
              const target = targets[i] ?? null;
              return (
                <li key={`${i}-${topic}`}>
                  {target !== null ? (
                    <button
                      type="button"
                      className={s.topicButton}
                      onClick={() => room.playAt(target)}
                      disabled={!room.playable}
                      title={rt("room.topicGo")}
                      data-topic={i}
                    >
                      <Text value={topic} shiurLang={shiur.lang} />
                    </button>
                  ) : (
                    <Text value={topic} shiurLang={shiur.lang} />
                  )}
                </li>
              );
            })}
          </ol>
          {!notes ? <p className={s.note}>{rt("room.outline.note")}</p> : null}
        </section>
      ) : null}
      {!notes ? <p className={s.pending}>{notice("notesPending", ui)}</p> : null}
    </>
  );
}
