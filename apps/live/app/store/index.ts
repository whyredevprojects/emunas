/**
 * Personal data for the Live app (tech-live §4.2): local-first, IndexedDB through `idb`, with an
 * in-memory fallback when storage is unavailable. See `README.md` for how other features use it.
 */
export type * from "./schema.ts";
export { LIMITS, PERSONAL_DB_NAME, PERSONAL_SCHEMA_VERSION, PREF_QUEUE_CURRENT, STORE_NAMES } from "./schema.ts";
export { MemoryBackend, type Backend, type BackendKind } from "./backend.ts";
export { MIGRATIONS, openBestBackend, openIdbBackend, type Migration, type OpenedBackend } from "./idb-backend.ts";
export {
  CONTINUE_MIN_SECONDS,
  FINISHED_WITHIN,
  continueListening,
  createPersonal,
  getPersonal,
  listenedSeconds,
  notesFor,
  queueCurrentKey,
  savedFor,
  setPersonal,
  usePersonal,
  type MomentInput,
  type Personal,
  type PersonalData,
  type PersonalState,
  type PersonalStoreApi,
  type ProgressInput,
} from "./personal.ts";
export { attachProgressRecorder } from "./progress-recorder.ts";
export {
  createQueuePlayer,
  getQueuePlayer,
  peekQueuePlayer,
  setQueuePlayer,
  useQueuePlayerState,
  type QueuePlayer,
  type QueuePlayerState,
} from "./queue-player.ts";
export { decodePlaylist, encodePlaylist, playlistPath, type PlaylistTuple } from "./playlist-link.ts";
export {
  EXPORT_FORMAT,
  ImportError,
  buildExport,
  exportFileName,
  mergeDumps,
  parseImport,
  serializeExport,
  type ExportFile,
  type ImportErrorCode,
  type ImportMode,
  type ParsedImport,
} from "./transfer.ts";
