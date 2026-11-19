/**
 * Plain download links for the room header: one `<a href download>` per playable recording ("Download"
 * for a single recording, "Download part N" otherwise, numbered like the Library's Listen block and
 * `room.unavailablePart`). No fetch, no storage, no progress: the browser saves the file.
 *
 * Each link points at the file the listener hears. For the shiur loaded in the player, the current
 * recording takes the engine's `playingVersion` (which already folds in a fallback to the original or
 * a recording with no improved copy); its other recordings follow the listener's choice
 * (`audioVersion`) with the per-recording rule of `recordingAudioUrl`: the improved copy only where
 * `cleanedUrl` exists. For any other shiur, the same rule with the stored choice, which the engine
 * state carries. During prerender and hydration `usePlayerState()` gives the idle state (the default
 * choice), then the real one, as `RoomVersionLine` does.
 *
 * The `download` attribute is ignored cross-origin (the media host), so some browsers open the file
 * instead of saving it (integration-plan Amendment A1).
 */
import type { AudioVersion } from "@emunas/i18n";
import type { JSX } from "react";
import { recordingAudioUrl, type PlayerState } from "../../player-engine/index.ts";
import { usePlayerState } from "../../player-ui/index.ts";
import type { RoomContext } from "./context.ts";
import type { ShiurFile } from "./data.ts";

export interface DownloadTarget {
  /** 1-based position of the recording in the shiur. */
  part: number;
  url: string;
  version: AudioVersion;
}

/** The download link targets for `shiur` under `state`; empty when no recording is playable. */
export function downloadTargets(state: PlayerState, shiur: ShiurFile): DownloadTarget[] {
  const loaded = state.shiurId === shiur.id;
  const out: DownloadTarget[] = [];
  shiur.recordings.forEach((rec, i) => {
    if (!rec.playable || !rec.audioUrl) return;
    const wanted: AudioVersion =
      loaded && i === state.recordingIndex ? state.playingVersion : rec.cleanedUrl ? state.audioVersion : "original";
    const url = recordingAudioUrl(rec, wanted);
    if (!url) return;
    out.push({ part: i + 1, url, version: url === rec.cleanedUrl ? "cleaned" : "original" });
  });
  return out;
}

export function DownloadLinks({ room, className }: { room: RoomContext; className?: string }): JSX.Element | null {
  const state = usePlayerState();
  const { shiur, rt } = room;
  const targets = downloadTargets(state, shiur);
  if (targets.length === 0) return null;
  const multi = shiur.recordings.length > 1;
  return (
    <>
      {targets.map(({ part, url, version }) => {
        const text = multi ? rt("room.downloadPart", { n: part }) : rt("room.download");
        const label = multi
          ? rt(version === "cleaned" ? "room.downloadPartCleaned" : "room.downloadPartOriginal", { n: part })
          : rt(version === "cleaned" ? "room.downloadCleaned" : "room.downloadOriginal");
        return (
          <a
            key={part}
            className={className}
            href={url}
            download
            aria-label={label}
            title={label}
            data-room-download={part}
            data-version={version}
          >
            {text}
          </a>
        );
      })}
    </>
  );
}
