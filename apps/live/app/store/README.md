# Personal store (`app/store`)

Local-first personal data for the Live app (tech-live §4.2, concept-live §5.8, §6.2, §6.4). No
account, no server: everything lives in the browser's IndexedDB (`emunas-live-personal`), through
`idb`.

| Store | Key | Record |
|---|---|---|
| `progress` | shiurId | `t`, `duration`, `completedChapters`, `completedAt` |
| `queue` | key | moment (`shiurId`, `start`, `end`, `momentId`) + `pos` |
| `playlists` | id | `name`, `items` (moments) |
| `saved` | id | `shiurId`, `t`, `end`, `momentId` |
| `notes` | id | `shiurId`, `t`, `text` (the listener's own words) |
| `history` | shiurId | `t`, `lastPlayedAt` |
| `prefs` | key | JSON `value` (`queue.current` = current queue entry) |
| `downloads` | shiurId | `recordingIds`, `bytes`, `state` (bytes live in Cache Storage) |

Every record has `updatedAt` (for import merge now and sync later, decision D4).

**Schema changes.** The database version is `PERSONAL_SCHEMA_VERSION`. Append a migration to
`MIGRATIONS` in `idb-backend.ts` (it runs inside the `versionchange` transaction; a throw rolls the
upgrade back), raise the version, and if record shapes change add a `RECORD_UPGRADES` step in
`transfer.ts` so older export files still import. `idb-backend.test.ts` shows the pattern.

**Storage unavailable.** `openBestBackend` falls back to memory when IndexedDB is missing, throws
(private windows, blocked site data), is newer than this build, or stays blocked by another tab; a
write that fails later switches to memory with the current state. The app keeps working and
`persistent: false` lets the UI say so.

## Using it from other features

```ts
import { getPersonal, usePersonal, continueListening, getQueuePlayer, attachProgressRecorder } from "../store/index.ts";

// React: subscribe to a slice (starts loading on first use). Select raw slices; derive with useMemo.
const progress = usePersonal((s) => s.progress);
const rows = useMemo(() => continueListening({ progress }, 10), [progress]);  // Today's continue row (W3.8)

// Actions (async; they wait for the initial load)
await getPersonal().enqueue([{ shiurId, start: t, end, momentId }], "end");  // "Add to queue"
await getPersonal().saveMoment({ shiurId, start: t, momentId });
await getPersonal().addNote(shiurId, t, text);

// Queue playback across shiurim (binds the shared player engine on first call)
getQueuePlayer().play(key);

// The player UI (W3.7) should record progress app-wide once the engine exists (idempotent):
attachProgressRecorder(getPlayerEngine(), getPersonal());
```

Shared playlists: `playlistPath(ui, items)` → `/:ui/pl#<base64url(JSON [shiurId, t, end?][])>`;
`decodePlaylist(hash)` returns `null` for anything malformed.
