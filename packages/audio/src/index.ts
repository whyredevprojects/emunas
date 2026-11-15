/**
 * @emunas/audio: public audio URLs on the media host, the audio table and the playability rule
 * (integration-plan Amendment A1). Pure and browser/Workers/Node-safe; no dependencies.
 */
export {
  DEFAULT_MEDIA_ORIGIN,
  MEDIA_ORIGIN_ENV,
  encodeKeyPath,
  mediaTimeUrl,
  mediaUrl,
  normalizeMediaOrigin,
  refuseKey,
  type KeyRefusal,
  type MediaTimeUrl,
  type MediaUrl,
} from "./media.ts";
export { isPlayableKey, unplayableReason, type UnplayableReason } from "./playable.ts";
export {
  buildAudioTable,
  lookupAudio,
  type AudioTable,
  type AudioTableEntry,
  type AudioTableInput,
  type AudioTableIssue,
  type BuildAudioTableOptions,
} from "./table.ts";
