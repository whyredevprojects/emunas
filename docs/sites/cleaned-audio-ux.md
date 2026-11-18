# Cleaned-up audio: UX design (Quiet and Live)

Status: design, nothing built. Date: 2026-11-18.
Scope: both sites. "Library" is **Quiet** (`apps/quiet`, the catalog as a sefer, works without
JavaScript); "analyze" is **Live** (`apps/live`, the listening workspace with one app-wide player).

## 1. Summary

Every recording may have a second copy in the `emunas` bucket at
`fixed/sidon/<original key, unchanged>`, made by an AI speech-restoration model (noise removed, voice
rebuilt). The sites play the cleaned copy by default and keep the original one click away, because
restoration can occasionally change how a word sounds.

Recommendation in one paragraph:

- **Data:** the corpus build adds `cleanedUrl` next to `audioUrl` on every playable recording. It
  is `null` when there is no approved cleaned copy. Availability comes from a reviewed, site-owned
  list, `site-policy/audio-cleaned.json`, the same pattern as `audio-transcoded.json`. A site-side
  script fills the list from an R2 listing of `fixed/sidon/`. There are no runtime HEAD requests and
  nothing changes in the pipeline's directories.
- **UI:** one short, muted line under the player. In Quiet it sits under the track list. In Live it
  sits in the dock's notice row and under the play button in the listening room. It reads
  "Sound cleaned up by AI · Switch to the original", or "A version with the sound cleaned up by AI is
  also available · Listen to it". If a shiur has no cleaned copy, there is no line.
- **Behaviour:** switching keeps the position, the play/pause state and the speed. The choice is
  **one global preference per listener** (localStorage, guarded), applied to every shiur that has
  both copies.
- **Everything else follows the selected version:** downloads, Live offline copies and time links
  under JS. Media Session metadata, share links and URLs stay the same in both versions.

## 2. How audio works today

### Shared

- `packages/audio/src/media.ts:96` `mediaUrl(key, origin)` builds `${MEDIA_ORIGIN}/${encodeKeyPath(key)}`.
  `refuseKey` (`media.ts:75`) blocks unsafe keys.
- `packages/audio/src/playable.ts:46` `servedKey()` gives the key actually linked: the key itself
  for `.mp3`, or the `.mp3` sibling for the three `.WMA` files listed in
  `site-policy/audio-transcoded.json`.
- `packages/audio/src/table.ts:23-25` `AudioTableEntry` is `{ canonicalId, size, playable, url }`.
  `buildAudioTable` (`table.ts:70-121`) resolves `duplicateOf` to the canonical recording and calls
  `servedKey` / `mediaUrl` (`table.ts:110-118`).
- `packages/corpus/src/build/build.ts:320-325` builds the table from `ingest.recordings`, with
  `loadAudioTranscoded` from `packages/corpus/src/build/policy.ts:55-66`. Each shiur's audio rows
  are part of its fingerprint (`build.ts:203,221`), so a URL change rewrites that shiur's file.
- `packages/corpus/src/build/project.ts:91-100` `recordingsOf()` emits
  `PublicRecording = { audioUrl: MediaUrl, playable: true } | { audioUrl: null, playable: false }`
  (`packages/corpus/src/public/types.ts:46-47`).
- `workers/api` does not serve audio. It only knows `audio_lang` as a search filter
  (`workers/api/src/params.ts:38`). Nothing changes there.
- Audio is cross-origin on the media host. CSP `media-src` (and, for Live, `connect-src`) already
  allows that origin (`docs/sites/ops-runbook.md` §2). The new prefix is on the same origin.

### Quiet (library)

- `apps/quiet/src/components/Listen.astro:28-33,51-69` renders one native
  `<audio controls preload="none" src={url} data-rec data-offset>` per recording, with a
  `Download` / `Download part N` link under each (`:64-69`). It is used on the shiur page
  (`apps/quiet/src/components/shiur/ShiurPage.astro:30`).
- `apps/quiet/src/lib/audio.ts:29-42` `playableUrl()` and `:77-95` `timeTarget()` build every no-JS
  time link as `audioUrl#t=<local>`. These are used by `components/shiur/Time.astro` and
  `components/TimeLink.astro`. The gated follow-along view (`components/shiur/FollowText.astro:47`,
  off) also carries `data-audio`.
- `apps/quiet/src/scripts/player.ts` is the progressive enhancement. It finds every
  `audio.listen-audio[data-rec]` (`:93`), docks the `.listen` section once playback starts
  (`:135-139`; CSS `components/shiur/shiur.css:36-50` hides the label, `.track-meta` and the
  non-current tracks when docked), and handles seeks with a pending-until-`loadedmetadata` map
  (`:116,141-169`). It also sets Media Session metadata on `play` (`:227-244`) and moves on to the
  next recording on `ended` (`:259-262`). It has "no storage, no network of its own" and a
  budget of 6 KB brotli.
- Lists (catalog table, series, sections) do not play audio. They only use `playable` from
  `audio-table.json` (`components/catalog/model.ts:95`).
- Styles: `apps/quiet/src/styles/quiet.css:433-456` (`.track-meta` is muted, `--step-0`).
- UI languages: the `en` and `yi` editions (`apps/quiet/src/i18n/en.ts:42-49`, `yi.ts:45-52`).

### Live (analyze)

- There is one engine and one `Audio` element for the whole app:
  `apps/live/app/player-engine/engine.ts`. The URL comes from the `resolveAudioUrl` option
  (`types.ts:199-200`), which defaults to `recordingAudioUrl` (`plan.ts:29-31`, which returns
  `rec.audioUrl`). `goTo(t)` (`engine.ts:239`) swaps `src` whenever
  `index !== recIndex || url !== currentSrc` (`engine.ts:269`). It sets `pendingLocal` and keeps
  `wantPlaying` through the swap (`swapping`, `:109,461-472`). A version switch can reuse this path
  as it is.
- `PlayerState` (`types.ts:99-120`) has no notion of which version is playing.
- The dock is `apps/live/app/player-ui/PlayerDock.tsx`. Its notice row (`:115-138`, rendered at
  `:206`) already uses the "muted text · text button" pattern ("Skipped 2:10 of singing · Undo").
  The styles are `.notice` and `.textButton` in `PlayerDock.module.css`.
- The listening room's play button, Printable page, Report and Download sit in
  `apps/live/app/features/listening-room/Header.tsx:107-124`. The room's audio notes come right
  under them (`:125-130`).
- Every list or inline "play" (Today, mixes, search results, chapters, topics) goes through
  `player-ui/engine.ts:77-123` (`playShiur` / `playAt`) into the same engine, so it follows the
  resolver automatically.
- Offline downloads: `apps/live/sw/client/downloads.ts:62-72` `planDownload()` fetches every
  `audioUrl` into Cache Storage `audio-v1`, keyed by the exact URL (`sw/src/protocol.ts:8`). The SW
  serves those URLs with Range support (`sw/src/handler.ts:88-110`). Bookkeeping uses
  `DownloadRecord` (`app/store/schema.ts:105-111`).
- The data contract is a strict schema: `apps/live/data-build/schemas.ts:80-81`, plus the comment
  type at `app/data/types.ts:261`.
- Media Session: `player-engine/media-session.ts:11-19` sets the title to the chapter, the artist to
  `Harav Moshe Wolfson zt"l`, and the album to the catalog title.
- UI languages: `en` and `yi` (`features/listening-room/strings.ts`, e.g. `dock.undo` `:125` /
  `:251`).
- The query parameter `audio` is already taken by the shiur-language filter
  (`app/shell/settings.ts`). Do not reuse it.

## 3. The three states

Defined per recording. When a shiur has several recordings, a line describes the recording that is
current or about to play.

| State | When | What plays | Line under the player |
|---|---|---|---|
| **A. Cleaned** (default) | `cleanedUrl` set and preference is `cleaned` | `cleanedUrl` | "Sound cleaned up by AI · **Switch to the original**" |
| **B. Original, by choice** | `cleanedUrl` set and preference is `original` | `audioUrl` | "A version with the sound cleaned up by AI is also available · **Listen to it**" |
| **C. Original only** | `cleanedUrl` is `null` | `audioUrl` | none |
| (unplayable, as today) | `audioUrl` is `null` | nothing | existing "not yet available" copy |

The preference is never shown as a setting anywhere else, and the line never names the model.

## 4. Placement and sketches

### Quiet

The line is one paragraph, `p.listen-version`, placed after `<ol class="tracks">` inside
`section.listen`. It is muted and uses `--step-0`, like `.track-meta`. It stays visible when the
section is docked, because it is the only way to switch while listening (one line; the dock already
hides the label and the download links).

Single recording, state A:

```
LISTEN
[ ▶  0:00 / 43:10  ━━━━━━━━━━━━━━━━━━  🔊 ⋮ ]      native <audio controls>
Download · Length 43:10
Sound cleaned up by AI · Switch to the original     ← muted; "Switch…" is a button
```

State B:

```
LISTEN
[ ▶  12:03 / 43:10 ━━━━━━●━━━━━━━━━━━  🔊 ⋮ ]
Download · Length 43:10
A version with the sound cleaned up by AI is also available · Listen to it
```

State C: exactly as today, with no third line.

Several recordings where only part 2 lacks a cleaned copy (state A for the shiur):

```
LISTEN
Part 1 of 2 · 30:30
[ ▶ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ]
Download part 1
Part 2 of 2 · 25:00
[ ▶ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ]
Download part 2 · Part 2: original recording only
Sound cleaned up by AI · Switch to the original
```

Docked (sticky, while playing):

```
┌──────────────────────────────────────────────────────────┐
│ [ ❚❚ 12:03 / 43:10 ━━━━━━●━━━━━━━━━━━━  🔊 ⋮ ]          │
│ Sound cleaned up by AI · Switch to the original          │
└──────────────────────────────────────────────────────────┘
```

When docked, the line describes the current track. The script updates it on `play` and `ended`,
and hides it while the current track is in state C.

**Without JavaScript:** the `<audio src>`, the download links and the time links all use the
cleaned copy. The line is still rendered, but "Switch to the original" is a plain
`<a href="{audioUrl}">` that opens the original file in the browser's own player. The script turns
that link into a `<button type="button">`, the same progressive pattern as the theme switch in
`layouts/Base.astro:95`. In print, the line is hidden like the other player chrome
(`styles/print.css`).

### Live

There are two places, both bound to the same engine state:

1. **Dock notice row.** This is the player that is always on screen, including when a shiur was
   started from a list. The version line shows only when there is no other notice (priority:
   unavailable > error > moment ended > skipped/undo > version line). It uses the existing
   `.notice` + `.textButton`, so it looks like "Skipped … · Undo".
2. **Listening room**, directly under the actions row (`Header.tsx:124`), where the room's other
   audio notes already sit. This makes the choice visible before pressing play, and also while the
   dock is showing a skip notice. When the room's shiur is not the loaded one, the line describes
   the version that *would* play.

Dock, wide screen, state A:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ⏮  ⟲15  (❚❚)  15⟳  ⏭ │ Chapter 3: The light of Chanukah          12:03 / 43:10 │ 1× │ Sleep ▾ │
│                       │ ━━━━━━|━━━━━●━━━━|━━━━━━━━━|━━━━━━━━━━━━━━━━          │    │         │
│                       │ Sound cleaned up by AI · Switch to the original        │    │         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Dock, narrow screen (≤ 40rem hides `.wide`, `.extras`, `.time`). The notice row stays:

```
┌──────────────────────────────────────────┐
│ ⏮ (❚❚) ⏭ │ Chapter 3: The light of …     │
│          │ ━━━━━━|━━━━●━━━━|━━━━━━━━━━   │
│          │ Sound cleaned up by AI · Switch to the original
└──────────────────────────────────────────┘
```

(If the narrow dock cannot fit the full line in its fixed `--dock-height`, the text may truncate
with an ellipsis, but the button must never truncate. See open question 5.)

Listening room header, state B:

```
[ ▶ Play the shiur ]  Printable page  Report  Download
A version with the sound cleaned up by AI is also available · Listen to it
```

State C: no line in either place.

## 5. Copy

The wording is proposed and needs the owner's sign-off and a named Yiddish reviewer, the same as
`AI_LABEL` (`packages/i18n/src/vocab/ai-label.ts`). Add an entry to `docs/sites/copy-review.md`.
Keep the wording in one shared module, `packages/i18n/src/vocab/audio-version.ts`, so both sites use
the same words. The site string tables only reference it.

| Key | English | Yiddish |
|---|---|---|
| `audioVersion.cleaned.text` | Sound cleaned up by AI | קלאנג אויסגעבעסערט דורך AI |
| `audioVersion.cleaned.action` | Switch to the original | הערט דעם אריגינאל |
| `audioVersion.original.text` | A version with the sound cleaned up by AI is also available | א ווערסיע מיט קלאנג אויסגעבעסערט דורך AI איז אויך דא |
| `audioVersion.original.action` | Listen to it | הערט זי |
| `audioVersion.announce.cleaned` | Now playing the version cleaned up by AI. | יעצט שפילט די ווערסיע אויסגעבעסערט דורך AI. |
| `audioVersion.announce.original` | Now playing the original recording. | יעצט שפילט די אריגינעלע רעקארדירונג. |
| `audioVersion.partOriginal` (Quiet, multi-part) | Part {part}: original recording only | טייל {part}: נאר די אריגינעלע רעקארדירונג |
| `audioVersion.about` (About pages, optional) | Most recordings play with the sound cleaned up by AI, which removes noise and hiss. Now and then this can change how a word sounds, so the original recording is always one click away, under the player. | ביי רוב רעקארדירונגען איז דער קלאנג אויסגעבעסערט דורך AI, וואס נעמט אראפ דעם רעש. אמאל קען דאס טוישן ווי א ווארט הערט זיך, דעריבער איז די אריגינעלע רעקארדירונג שטענדיג איין קליק אוועק, אונטער דעם שפילער. |

The separator is ` · `, as in the existing track meta and dock notices.

Copy rules:

- Talk about the **sound** or the **recording** only. Never say the shiur, or anything in it, is
  unclear or garbled. Never mention transcription or speech recognition. The guard's meta-comment
  list (`packages/corpus-guard/src/meta-comment.ts:24-62`) would flag "speech recognition", so the
  model is described as cleaning up the sound and never as recognising speech.
- Do not name the model ("Sidon") in UI copy. It may change and means nothing to a listener.
- The "may change a word" caveat goes only in the optional About paragraph, not under the player.
  The line stays short.

## 6. Behaviour rules

### Switching

1. A switch happens only on the button. Nothing switches automatically, and nothing falls back
   silently, apart from rule 8.
2. **Position:** both files have the same length, so the same local second is used. Read the
   current local time (in Quiet, use `pending.get(a)` if a seek is still waiting), set the new
   `src`, and apply that time on `loadedmetadata`. In Live this is the existing swap path: set the
   version, then call `goTo(currentGlobalT)`. Because `url !== currentSrc`, the engine sets
   `pendingLocal`, keeps `wantPlaying` and suppresses the pause events of the swap
   (`engine.ts:269-283`). In Quiet, reuse `seek(a, local, wasPlaying)` (`player.ts:141-169`) after
   changing `a.src`.
3. **Play/pause:** playing keeps playing (with a brief buffering pause) and paused stays paused. A
   recording that has never loaded (`preload="none"`, `readyState 0`) only gets its `src` changed,
   with no load and no network.
4. **Speed** (`playbackRate`, and in Live `defaultPlaybackRate`) is carried over. Live does this
   already in the swap. Quiet must set it again after `load()`.
5. **Other recordings of the same shiur** (Quiet has several `<audio>` elements) switch too: their
   `src` attribute is swapped while they are idle. The ended-then-next rule then starts the next
   recording in the chosen version.
6. **Focus** stays on the button, which keeps its place and now carries the other label. A
   visually hidden `role="status"` region announces the `announce.*` sentence. In Live, use a
   separate polite region next to the dock's existing chapter announcer (`PlayerDock.tsx:207-209`).
   Do not reuse that region, because it is throttled.
7. **Margin mark, chapters and skip ranges** are in global seconds and do not depend on the
   version. Nothing to change.
8. **A failure on the cleaned file** (`error` event: a 404 because the object was removed after the
   build, or a decode error) falls back once to the original for that recording only. The line
   stays in state B, so the listener can see it, and the preference is not changed. This is the
   only automatic switch.

### Remembering the choice

- **Global, per listener.** A listener who prefers the original usually prefers it everywhere, for
  example when checking a quotation. A per-shiur memory would surprise people more and would need
  a table that grows without limit. The line under every player shows the current state, so a
  forgotten choice is visible and is one click to undo.
- **Storage:** `localStorage` key `emunas.audioVersion`, value `"cleaned"` or `"original"`, read
  and written inside `try/catch`. A missing value, a blocked store or any other value means
  `"cleaned"`. Only an explicit click writes it. Same key on both sites; each site has its own
  origin, so the choices are independent.
  - Quiet: read once in `initPlayer` before the first swap. Pages are pre-rendered with the cleaned
    copy, so a listener whose preference is "original" gets the `src` swapped on load. That is
    harmless with `preload="none"`. Update the player header comment, which says "no storage".
  - Live: read once when the engine is created, so the very first `load()` uses the right URL. The
    personal store's `prefs` (IndexedDB) loads asynchronously and would start the wrong file first,
    so it is not used (see open question 3).
- **Not in URLs.** Share links (Quiet `#t=`, Live `?t=` / `&m=`) stay the same in both versions.
  A shared moment plays in the recipient's own preferred version.

### Downloads, offline, links, metadata

| Surface | Version used |
|---|---|
| Quiet `Download` / `Download part N` links | The selected version. Without JS that is the cleaned copy; the script rewrites `href` on a switch. The label does not change. |
| Quiet time links (`a.time`, `TimeLink`) `href` | Built with the default (cleaned) URL. With JS, clicks seek the element, which already plays the selected version. Rewriting hrefs is not needed. |
| Live offline download | The version selected when the listener presses Download. Only one copy is stored (no doubled storage). `DownloadRecord` records which version it holds. A switch while offline is refused with the existing "cannot be played here" handling, or, better, the button is disabled offline when the other version is not cached (open question 4). |
| Live lists, search, Today, chapters, topics ("listen" anywhere) | Automatically the selected version, through the engine resolver. No per-list work. |
| Media Session metadata | Unchanged in both versions. Do not add "(AI)" to lock-screen titles. |
| Share links, feedback "Report" | Version-neutral links. The Live/Quiet Report form should attach the version that was playing (`cleaned` / `original`), so that a report of a wrong-sounding word can be checked. |

### Accessibility

- The toggle is a native `<button type="button">`, reachable by Tab in both the docked and
  undocked states. In Live it is in the dock's tab order after the scrubber, using `.textButton`.
- Its visible text is its accessible name ("Switch to the original" / "Listen to it"). It has
  `aria-describedby` pointing at the sentence before it, so "Listen to it" is clear on its own in a
  screen reader's list of buttons. It has no `aria-pressed`: the label already says what the button
  does, and a pressed state on a label that changes is confusing.
- The state change is announced with a polite `role="status"` (rule 6).
- Target size: Live's `.textButton` is `min-block-size: 1.5rem`, the same as Undo. In the room, use
  the 44 px `--tap-min` the room's other actions use. In Quiet, give the button enough padding for
  a 24 px minimum target (WCAG 2.2 AA).
- Under `dir="rtl"` the line mirrors with logical properties. The ` · ` separator needs no
  isolation. The Yiddish text includes the Latin "AI", so wrap it in the existing `isolate()`
  helper if the axe or bidi tests ask for it.
- Keyboard shortcuts on the Quiet dock (Space/K, arrows) are unchanged. There is no new shortcut.

## 7. Availability: how the site learns which recordings have a cleaned copy

Three options were considered:

| Option | Verdict |
|---|---|
| HEAD request per recording at runtime | Rejected. It costs one extra request per page, the line would flicker, it does not work without JS (Quiet), and it cannot express "rejected after review". |
| Manifest object in R2 (`fixed/sidon/manifest.json`) read by the build | Possible, but CI would need R2 read credentials for every build (deploy only has them for the embedding cache today), and review would happen outside git. |
| **Reviewed site-policy list, filled by a site-side script** | **Recommended.** It is the same pattern as `audio-transcoded.json` (ops-runbook §10). The build stays offline and deterministic, every change is a PR, and a rejected copy is recorded. |

### `site-policy/audio-cleaned.json` (new, site-owned)

```json
{
  "policyVersion": 1,
  "cleaned": ["<served key>", "…"],
  "rejected": [{ "key": "<served key>", "reason": "a word changed at 12:40", "reviewedBy": "…", "reviewedAt": "YYYY-MM-DD" }]
}
```

- Keys are **served keys** (what `servedKey()` returns, so the `.mp3` sibling for the three WMA
  files). The cleaned object is `fixed/sidon/<served key>`. Like every key, these never appear in
  public output.
- A key in both `cleaned` and `rejected` is fatal. So is a key that is not a playable `.mp3` key.
- Document it in `site-policy/README.md`.

### Sync script (new): `packages/audio/scripts/sync-cleaned.ts`

Run it as `npm run cleaned:sync --workspace=@emunas/audio [-- --dry-run] [-- --verify-duration]`.
It uses the same `.env` loading as `transcode-wma.ts` and never prints credentials.

1. Read `data/derived/ingest.json` (read-only, as `transcode-wma.ts` does) for the in-scope
   recordings' served keys and `durationSec`.
2. `ListObjectsV2` with the prefix `fixed/sidon/`, then match each object against the served keys.
3. For each match, check `Content-Type: audio/mpeg` (or a `.mp3` key) and a non-zero size. With
   `--verify-duration`, download the file and `ffprobe` it: the duration must be within 0.5 s of the
   original. Restoration must not trim or pad, or every chapter time would drift.
4. Add each passing key to `cleaned`. Skip keys in `rejected`. Report keys with no cleaned copy
   and objects under the prefix that match no recording.
5. Commit the file by PR. The next `corpus:build` emits `cleanedUrl` for the listed keys.

### Build changes (site-owned packages)

- `packages/audio`: add `CLEANED_PREFIX = "fixed/sidon/"` and `cleanedKey(servedKey)`.
  `AudioTableEntry` becomes
  `{ playable: true; url: MediaUrl; cleanedUrl: MediaUrl | null } | { playable: false; url: null; cleanedUrl: null }`.
  `buildAudioTable` gets a `cleaned?: Iterable<string>` option. Duplicates take their canonical's
  `cleanedUrl`, as they already do for `url`.
- `packages/corpus`: `loadAudioCleaned()` in `build/policy.ts`; pass it in `build.ts:320`.
  `PublicRecording` gets `cleanedUrl` (`public/types.ts:46-47`) and `project.ts:97-98` emits it.
  The fingerprint already covers the audio rows. Change the shape directly and bump
  `SCHEMA_VERSION` (`public/index.ts:11`) as for any shape change. There is no compatibility field.

### Request to whoever produces the cleaned files (pipeline owner)

The site needs nothing in `data/`, `scripts/`, `src/`, `config/` or `prompts/`. It does need the
cleaned objects to meet these conditions:

1. MP3 (`audio/mpeg`), at exactly `fixed/sidon/<served key>`.
2. The same duration as the original (±0.5 s), with no leading or trailing silence added or
   removed.
3. For the three `.WMA` recordings: clean the `.mp3` transcode and store it under the `.mp3` key.
   A cleaned `.WMA` would not play.
4. Optional: a short note (or a `fixed/sidon/_status.json`) listing failures, so the sync report can
   tell "not processed yet" apart from "failed".

## 8. Files an implementer would touch

Shared:

- `packages/audio/src/{media.ts,table.ts,index.ts}`, plus tests in `packages/audio/test/`
- `packages/audio/scripts/sync-cleaned.ts` (new), `packages/audio/package.json` (`cleaned:sync`)
- `packages/corpus/src/build/{policy.ts,build.ts,project.ts}`, `packages/corpus/src/public/{types.ts,index.ts}`
- `packages/i18n/src/vocab/audio-version.ts` (new), and export it from `packages/i18n/src/index.ts`
- `site-policy/audio-cleaned.json` (new), `site-policy/README.md`
- `docs/sites/copy-review.md` (new entry), `docs/sites/ops-runbook.md` (new section after §10: running `cleaned:sync` and reviewing a rejection)

Quiet:

- `apps/quiet/src/lib/audio.ts`: add `cleanedUrl` to `AudioRecording`, add `defaultUrl(rec)`
  (cleaned, else original), and use it in `timeTarget`
- `apps/quiet/src/components/Listen.astro`: `src` and download use `defaultUrl`;
  `data-original` / `data-cleaned` on each `<audio>`; the `p.listen-version` line with its no-JS
  link; the per-part "original recording only" note
- `apps/quiet/src/components/TimeLink.astro`, `components/shiur/Time.astro`,
  `components/shiur/FollowText.astro:47`: use `defaultUrl`
- `apps/quiet/src/scripts/player.ts`: read the preference, swap `src` on all `<audio>` elements,
  carry position, play state and rate across the swap, upgrade link to button, update the line on
  track change, rewrite download hrefs, fall back on `error`, and add the status region. Re-check
  the 6 KB budget test.
- `apps/quiet/src/i18n/{en,yi}.ts`, `components/shiur/shiur.css` (keep `.listen-version` visible
  when docked), `styles/quiet.css`, `styles/print.css`
- `apps/quiet/src/lib/sample.ts` and the shell-sample page: add a sample recording in each state

Live:

- `apps/live/app/player-engine/types.ts`: add `PlayerRecording.cleanedUrl`; add
  `PlayerState.version` (`"cleaned" | "original"`) and `PlayerState.versionAvailable` (whether the
  current recording has a cleaned copy); add `PlayerEngine.setVersion()` and an engine option
  `version`
- `apps/live/app/player-engine/plan.ts`: `recordingAudioUrl(rec, version)`
- `apps/live/app/player-engine/engine.ts`: `setVersion` calls `goTo(t)`; add the one-time
  fallback on `error`
- `apps/live/app/player-ui/engine.ts`: read and write `emunas.audioVersion` and pass it on engine
  creation
- `apps/live/app/player-ui/PlayerDock.tsx` (notice priority, button, status region) and
  `PlayerDock.module.css`
- `apps/live/app/features/listening-room/Header.tsx`, `strings.ts` (or reference the shared vocab)
  and `styles.ts`
- `apps/live/data-build/schemas.ts:80-81`, `apps/live/app/data/types.ts`
- `apps/live/sw/client/downloads.ts` (`planDownload(shiur, version)`),
  `apps/live/app/store/schema.ts` (`DownloadRecord.version`) and the Download button
- Feedback/Report payload: add the version that was playing
- Tests: engine swap keeps t, rate and play state; dock notice priority; axe on the dock with the
  line present; e2e switch on a multi-part shiur

`workers/api` needs no changes.

## 9. Open questions

1. **Wording sign-off.** Is "cleaned up" right, or would "Sound improved by AI" read better? The
   Yiddish needs a named reviewer (the "אריגינאל" / "אריגינעלע" spelling, and whether to keep the
   Latin "AI" as `AI_LABEL` does).
2. **Global preference vs. per-shiur.** The recommendation is global. Does the owner want the About
   paragraph as well, or is the line enough?
3. **Live storage.** localStorage is recommended so the first load is synchronous. Should the value
   also be mirrored into the personal store's `prefs`, so that Live's export/transfer of personal
   data carries it?
4. **Offline switching in Live.** When the downloaded version is not the one selected and the
   listener is offline, should the engine play the downloaded one and show state A/B accordingly?
   (Recommended: yes, as a variant of rule 8.) Or should the switch button be disabled?
5. **Narrow Live dock height.** Check whether the `--dock-height` row fits title + scrubber + one
   notice line on a 320 px screen in Yiddish. If it does not, the dock could show only the button
   ("Switch to the original") and the room could carry the full sentence.
6. **Downloads.** Should Quiet offer both downloads ("Download · Download original") instead of
   following the selection? Following the selection is simpler and keeps the line uncluttered.
7. **Review workflow for rejections.** Who listens to and rejects cleaned copies, and is a
   per-recording rejection enough, or are partial rejections ("fine except 12:40") needed? If the
   latter, the only safe UI answer is to reject the whole recording.
8. **Rollout.** Ship the code with an empty `cleaned` list (every shiur in state C, no visible
   change), then fill the list. Is that acceptable as the first PR?
