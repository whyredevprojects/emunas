/** Player UI: the dock bound to the engine, and the app's engine accessor (W3.7). */
export { PlayerDock, SPEEDS, formatRate, nextSpeed } from "./PlayerDock.tsx";
export { ensureDockRegistered } from "./register.ts";
export {
  IDLE_STATE,
  appDescribe,
  canPlay,
  chooseAudioVersion,
  getEngine,
  installEngine,
  playAt,
  playShiur,
  playingInfo,
  registerShiur,
  usePlayerState,
  type PlayingInfo,
} from "./engine.ts";
export { makeDescribe, type SeriesTitleOf } from "./describe.ts";
export { VersionLine, versionLineState } from "./VersionLine.tsx";
