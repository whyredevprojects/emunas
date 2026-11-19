/**
 * Media Session wiring (tech-live §4.1): lock screen, car and headset controls. Previous/next track
 * move by chapter; seek backward/forward by 15 s; seekto. Every call is guarded: browsers throw for
 * actions they do not support and for out-of-range position states.
 */
import { pickText, type UiLang } from "@emunas/i18n";
import type { DescribeContext, MediaSessionEnv, MetadataInit, PlayerChapter, PlayerShiur } from "./types.ts";

/** The Mashgiach's name as the Media Session artist, per interface language. */
export const RAV_NAME: Readonly<Record<UiLang, string>> = {
  en: 'Harav Moshe Wolfson zt"l',
  yi: 'הרב משה וואלפסאן זצ"ל',
  he: 'הגה"צ רבי משה וולפסון זצ"ל',
};

/** Default metadata: title = chapter title in the reading language, artist = the Mashgiach, album = catalog title. */
export function defaultDescribe({ shiur, chapter, readingLang }: DescribeContext): MediaMetadataInit {
  const album = shiur.catalog.heading ?? shiur.catalog.titleOriginal;
  const chapterTitle = chapter ? pickText(chapter.title, readingLang).text : "";
  return {
    title: chapterTitle || album,
    artist: RAV_NAME[readingLang],
    album,
  };
}

export interface MediaSessionHandlers {
  play(): void;
  pause(): void;
  previous(): void;
  next(): void;
  seekBy(delta: number): void;
  seekTo(t: number): void;
}

export function getDefaultMediaSession(): MediaSessionEnv | null {
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  const Metadata = (globalThis as { MediaMetadata?: MediaSessionEnv["Metadata"] }).MediaMetadata;
  if (!nav || !("mediaSession" in nav) || !nav.mediaSession || !Metadata) return null;
  return { session: nav.mediaSession, Metadata };
}

export class MediaSessionBridge {
  private lastMetadataKey = "";

  constructor(
    private readonly env: MediaSessionEnv,
    private readonly seekStep: number,
  ) {}

  attach(h: MediaSessionHandlers): void {
    const set = (action: MediaSessionAction, fn: MediaSessionActionHandler | null) => {
      try {
        this.env.session.setActionHandler(action, fn);
      } catch {
        /* unsupported action */
      }
    };
    set("play", () => h.play());
    set("pause", () => h.pause());
    set("previoustrack", () => h.previous());
    set("nexttrack", () => h.next());
    set("seekbackward", (d) => h.seekBy(-(d.seekOffset ?? this.seekStep)));
    set("seekforward", (d) => h.seekBy(d.seekOffset ?? this.seekStep));
    set("seekto", (d) => {
      if (typeof d.seekTime === "number") h.seekTo(d.seekTime);
    });
  }

  detach(): void {
    for (const a of ["play", "pause", "previoustrack", "nexttrack", "seekbackward", "seekforward", "seekto"] as const) {
      try {
        this.env.session.setActionHandler(a, null);
      } catch {
        /* unsupported action */
      }
    }
    try {
      this.env.session.metadata = null;
      this.env.session.playbackState = "none";
    } catch {
      /* ignore */
    }
  }

  setMetadata(init: MediaMetadataInit, shiur: PlayerShiur, chapters: readonly PlayerChapter[], readingLang: UiLang): void {
    const full: MetadataInit = { ...init };
    if (chapters.length > 0) {
      full.chapterInfo = chapters.map((c) => ({ title: pickText(c.title, readingLang).text, startTime: c.t }));
    }
    const key = JSON.stringify([shiur.id, init.title, init.artist, init.album, readingLang]);
    if (key === this.lastMetadataKey) return;
    this.lastMetadataKey = key;
    try {
      this.env.session.metadata = new this.env.Metadata(full);
    } catch {
      try {
        this.env.session.metadata = new this.env.Metadata(init);
      } catch {
        /* ignore */
      }
    }
  }

  setPlaybackState(state: MediaSessionPlaybackState): void {
    try {
      this.env.session.playbackState = state;
    } catch {
      /* ignore */
    }
  }

  setPosition(duration: number, position: number, playbackRate: number): void {
    if (!this.env.session.setPositionState || !(duration > 0)) return;
    try {
      this.env.session.setPositionState({
        duration,
        playbackRate,
        position: Math.min(Math.max(0, position), duration),
      });
    } catch {
      /* ignore */
    }
  }

  resetMetadataCache(): void {
    this.lastMetadataKey = "";
  }
}
