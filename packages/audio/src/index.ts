/**
 * @emunas/audio — edge-safe entry point (no Node APIs, no AWS SDK).
 * The publish CLI lives at `@emunas/audio/publish` (Node only).
 */
export {
  AUDIO_EXT,
  AUDIO_ID_MAX_LENGTH,
  AUDIO_ID_RE,
  AUDIO_PREFIX,
  audioPath,
  audioTimePath,
  downloadPath,
  isAudioId,
  parseAudioPath,
  wantsDownload,
  type AudioPath,
} from "./paths.ts";
export {
  buildAudioTable,
  lookupAudio,
  type AudioTable,
  type AudioTableEntry,
  type AudioTableInput,
  type AudioTableIssue,
  type BuildAudioTableOptions,
} from "./table.ts";
export { asciiFilenameBase, attachmentDisposition, downloadFilename } from "./filename.ts";
export { isPublishableSourceKey, publicObjectKey, refuseSourceKey, type KeyRefusal } from "./keys.ts";
export {
  AUDIO_CACHE_CONTROL,
  AUDIO_CONTENT_TYPE,
  audioEnabled,
  handleAudio,
  type AudioBucket,
  type AudioEnv,
  type AudioObject,
  type AudioObjectBody,
} from "./handler.ts";
export {
  evaluateConditionals,
  ifRangeHolds,
  parseRangeHeader,
  resolveRange,
  type ByteRange,
  type ConditionalOutcome,
  type ParsedRange,
} from "./http.ts";
