/**
 * The player dock (concept-live §4.1, §6.1): current chapter title, a chapter-segmented scrubber and
 * transport, bound to the one engine. Mounted once in the shell's dock slot (`registerDock`) and
 * never remounted by navigation, so audio continues across route changes.
 *
 * Accessibility (tech-live §10): the scrubber is a native range input (an ARIA slider) with
 * `aria-valuetext` like "12:03 of 43:10, chapter 3: …"; chapter changes go to a polite live region,
 * at most one per 10 s; all buttons have names; 44 px targets.
 *
 * The notice row shows one thing, by priority: unavailable > error > moment ended > "the improved
 * version could not load" > skipped/undo > the version line ("Sound improved by AI · Switch to the
 * original", cleaned-audio-ux §4). On a narrow dock the version line shows only its button (the
 * listening room carries the full sentence). A switch is announced in its own polite region, not
 * the throttled chapter one.
 */
import { audioVersionLabel, formatClock, pickText, sectionKindLabel, type AudioVersion, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useEffect, useRef, useState, type ChangeEvent, type JSX } from "react";
import { Link } from "react-router";
import { Text } from "../components/Text.tsx";
import { useT, useUi } from "../i18n/index.ts";
import { roomT, type RoomT } from "../features/listening-room/strings.ts";
import type { PlayerState, SkipKind, SleepSpec } from "../player-engine/index.ts";
import { announceVersion, useVersionAnnouncement, type VersionAnnouncement } from "./audio-version.ts";
import { getEngine, playingInfo, usePlayerState, useRegistryVersion } from "./engine.ts";
import { Icon } from "./Icon.tsx";
import { dockStyles as s } from "./styles.ts";
import { VersionLine, versionLineState } from "./VersionLine.tsx";

export const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 0.75] as const;
const ANNOUNCE_EVERY_MS = 10_000;
const paths = livePaths();

export function nextSpeed(rate: number): number {
  const i = SPEEDS.findIndex((r) => Math.abs(r - rate) < 0.01);
  return SPEEDS[(i + 1) % SPEEDS.length]!;
}

export function formatRate(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}

function skipKindLabel(kind: SkipKind, ui: UiLang): string {
  return sectionKindLabel(kind === "pause" ? "noise" : kind, ui);
}

type SleepChoice = "off" | "running" | "15" | "30" | "60" | "chapter" | "shiur";

function sleepChoice(state: PlayerState): SleepChoice {
  const sl = state.sleep;
  if (!sl) return "off";
  return sl.kind === "minutes" ? "running" : sl.kind;
}

function sleepSpec(choice: SleepChoice): SleepSpec | null {
  switch (choice) {
    case "off":
    case "running":
      return null;
    case "chapter":
      return { kind: "chapter" };
    case "shiur":
      return { kind: "shiur" };
    default:
      return { kind: "minutes", minutes: Number(choice) };
  }
}

function positionText(rt: RoomT, state: PlayerState, chapterTitle: string | null): string {
  const now = formatClock(state.t);
  const total = formatClock(state.duration);
  if (chapterTitle !== null && state.chapterIndex >= 0) {
    return rt("dock.positionChapter", { now, total, n: state.chapterIndex + 1, title: chapterTitle });
  }
  return rt("dock.position", { now, total });
}

/** Polite announcement of the chapter, throttled. */
function useChapterAnnouncement(title: string | null, chapterIndex: number, playing: boolean): string {
  const [text, setText] = useState("");
  const last = useRef(0);
  useEffect(() => {
    if (!playing || title === null || chapterIndex < 0) return;
    const now = Date.now();
    if (now - last.current < ANNOUNCE_EVERY_MS) return;
    last.current = now;
    setText(title);
  }, [title, chapterIndex, playing]);
  return text;
}

export type DockNotice = "unavailable" | "error" | "moment" | "fallback" | "skip" | "version" | null;

/** Which notice the dock's one notice row shows (highest priority first). */
export function noticeKind(state: PlayerState, version: AudioVersion | null): DockNotice {
  if (state.status === "unavailable") return "unavailable";
  if (state.status === "error") return "error";
  if (state.momentEnded) return "moment";
  if (state.versionFallback) return "fallback";
  if (state.lastSkip) return "skip";
  if (version !== null) return "version";
  return null;
}

function announcementText(a: VersionAnnouncement | null, ui: UiLang, rt: RoomT): string {
  if (!a) return "";
  if (a.version === "fallback") return rt("dock.versionFallback");
  return audioVersionLabel(a.version === "cleaned" ? "announce.cleaned" : "announce.original", ui);
}

/** The polite region for version switches (separate from the throttled chapter announcer). */
function VersionStatus({ ui, rt }: { ui: UiLang; rt: RoomT }): JSX.Element {
  const a = useVersionAnnouncement();
  return (
    <div className={s.visuallyHidden} role="status" aria-live="polite" data-version-status="">
      {/* The key re-mounts the text so the same sentence twice is announced again. */}
      <span key={a?.n ?? 0}>{announcementText(a, ui, rt)}</span>
    </div>
  );
}

export function PlayerDock(): JSX.Element {
  const ui = useUi();
  const t = useT();
  const rt = roomT(ui);
  const state = usePlayerState();
  useRegistryVersion();
  const info = playingInfo(state.shiurId);
  const chapters = info?.shiur.notes?.chapters ?? [];
  const chapter = chapters[state.chapterIndex] ?? null;
  const reading = state.readingLang;
  const picked = chapter ? pickText(chapter.title, reading) : null;
  const chapterTitle = picked ? picked.text : null;
  const playing = state.status === "playing" || state.status === "loading";
  const announcement = useChapterAnnouncement(chapterTitle, state.chapterIndex, playing);
  useEffect(() => {
    if (state.versionFallback) announceVersion("fallback");
  }, [state.versionFallback]);

  if (!info || state.shiurId === null) {
    return (
      <div className={s.root} data-player-status={state.status}>
        <p className={s.idle}>{t("shell.dockIdle")}</p>
        <VersionStatus ui={ui} rt={rt} />
      </div>
    );
  }

  const engine = getEngine();
  const shiur = info.shiur;
  const disabled = state.status === "unavailable";
  const onSeek = (e: ChangeEvent<HTMLInputElement>) => engine.seek(Number(e.currentTarget.value));
  const onSleep = (e: ChangeEvent<HTMLSelectElement>) => {
    const choice = e.currentTarget.value as SleepChoice;
    if (choice !== "running") engine.setSleepTimer(sleepSpec(choice));
  };

  const version = versionLineState(state.playingVersion, state.cleanedAvailable);
  const kind = noticeKind(state, version);
  let notice: JSX.Element | null = null;
  if (kind === "unavailable") notice = <span>{rt("dock.unavailable")}</span>;
  else if (kind === "error") notice = <span>{rt("dock.error")}</span>;
  else if (kind === "moment") {
    notice = (
      <>
        <span>{rt("dock.momentEnded")}</span>
        <button type="button" className={s.textButton} onClick={() => engine.keepListening()}>
          {rt("dock.keepListening")}
        </button>
      </>
    );
  } else if (kind === "fallback") {
    notice = <span className={s.noticeText}>{rt("dock.versionFallback")}</span>;
  } else if (kind === "skip" && state.lastSkip) {
    notice = (
      <>
        <span>
          {rt("dock.skipped", { time: formatClock(state.lastSkip.seconds), kind: skipKindLabel(state.lastSkip.kind, ui) })}
        </span>
        <button type="button" className={s.textButton} onClick={() => engine.undoSkip()}>
          {rt("dock.undo")}
        </button>
      </>
    );
  } else if (kind === "version" && version !== null) {
    notice = (
      <VersionLine
        version={version}
        ui={ui}
        textClassName={`${s.noticeText} ${s.versionText}`}
        separatorClassName={s.versionText}
        buttonClassName={s.textButton}
      />
    );
  }

  const duration = Math.max(state.duration, 0.001);
  return (
    <div
      className={s.root}
      data-player-status={state.status}
      data-player-shiur={shiur.id}
      data-player-t={state.t.toFixed(2)}
      data-player-chapter={state.chapterIndex}
    >
      <div className={s.transport}>
        <button type="button" className={s.button} onClick={() => engine.prevChapter()} aria-label={rt("dock.prevChapter")} disabled={disabled}>
          <Icon name="prev" />
        </button>
        <button type="button" className={`${s.button} ${s.wide}`} onClick={() => engine.seekBy(-15)} aria-label={rt("dock.back")} disabled={disabled}>
          <Icon name="back15" />
        </button>
        <button
          type="button"
          className={`${s.button} ${s.play}`}
          onClick={() => engine.toggle()}
          aria-label={playing ? rt("dock.pause") : rt("dock.play")}
          disabled={disabled}
          data-player-toggle=""
        >
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <button type="button" className={`${s.button} ${s.wide}`} onClick={() => engine.seekBy(15)} aria-label={rt("dock.forward")} disabled={disabled}>
          <Icon name="fwd15" />
        </button>
        <button type="button" className={s.button} onClick={() => engine.nextChapter()} aria-label={rt("dock.nextChapter")} disabled={disabled}>
          <Icon name="next" />
        </button>
      </div>

      <div className={s.info}>
        <div className={s.titleRow}>
          <Link className={s.title} to={paths.shiur(ui, shiur.id)} aria-label={`${rt("dock.open")}: ${chapterTitle ?? shiur.catalog.titleOriginal}`}>
            {chapterTitle !== null ? (
              <Text value={chapterTitle} lang={picked?.lang ?? reading} />
            ) : (
              <Text value={shiur.catalog.titleOriginal} shiurLang={shiur.lang} />
            )}
          </Link>
          <span className={s.time} aria-hidden="true">
            {formatClock(state.t)} / {formatClock(state.duration)}
          </span>
        </div>
        <div className={s.bar}>
          <div className={s.ticks} aria-hidden="true">
            {chapters.slice(1).map((c) => (
              <span key={c.id} className={s.tick} style={{ insetInlineStart: `${(c.t / duration) * 100}%` }} />
            ))}
          </div>
          <input
            className={s.range}
            type="range"
            min={0}
            max={Math.max(0, Math.floor(state.duration))}
            step={1}
            value={Math.floor(state.t)}
            onChange={onSeek}
            aria-label={rt("dock.seek")}
            aria-valuetext={positionText(rt, state, chapterTitle)}
            disabled={disabled}
          />
        </div>
        {notice ? (
          <div className={s.notice} data-dock-notice={kind}>
            {notice}
          </div>
        ) : null}
        <div className={s.visuallyHidden} role="status" aria-live="polite">
          {announcement ? rt("dock.chapterNow", { title: announcement }) : ""}
        </div>
        <VersionStatus ui={ui} rt={rt} />
      </div>

      <div className={s.extras}>
        <button
          type="button"
          className={`${s.button} ${s.speed}`}
          onClick={() => engine.setRate(nextSpeed(state.rate))}
          aria-label={`${rt("dock.speed")}: ${formatRate(state.rate)}`}
        >
          {formatRate(state.rate)}
        </button>
        <select className={s.select} value={sleepChoice(state)} onChange={onSleep} aria-label={rt("dock.sleep")}>
          <option value="off">{rt("dock.sleep.off")}</option>
          {state.sleep?.kind === "minutes" ? <option value="running">{rt("dock.sleep.running")}</option> : null}
          <option value="15">{rt("dock.sleep.minutes", { n: 15 })}</option>
          <option value="30">{rt("dock.sleep.minutes", { n: 30 })}</option>
          <option value="60">{rt("dock.sleep.minutes", { n: 60 })}</option>
          <option value="chapter" disabled={chapters.length === 0}>
            {rt("dock.sleep.chapter")}
          </option>
          <option value="shiur">{rt("dock.sleep.shiur")}</option>
        </select>
      </div>
    </div>
  );
}
