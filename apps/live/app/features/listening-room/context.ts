/** What every part of the listening room needs: the shiur, languages, the play position and actions. */
import type { UiLang } from "@emunas/i18n";
import type { Ed, ShiurFile } from "./data.ts";
import type { PlayingInfo } from "../../player-ui/index.ts";
import type { RoomT } from "./strings.ts";

export interface RoomContext {
  ui: UiLang;
  rt: RoomT;
  shiur: ShiurFile;
  info: PlayingInfo;
  /** Reading language for generated text. */
  reading: Ed;
  /** Global seconds playing in this shiur, or null when the engine is on another shiur / idle. */
  now: number | null;
  /** Whether this shiur is the one loaded and currently playing. */
  playing: boolean;
  /** Where "Play this shiur" starts: the deep-link time (`?t=` / `&m=`), else 0. */
  start: number;
  /** The moment named by `&m=`, if any. */
  focusedMoment: string | null;
  /** Skip settings currently in force (kinds that are skipped). */
  skippedKinds: ReadonlySet<string>;
  /** Seek (loading the shiur when needed) and play; `end` pauses there (moments). */
  playAt(t: number, end?: number): void;
  /** Whether any recording of this shiur can be played. */
  playable: boolean;
}
