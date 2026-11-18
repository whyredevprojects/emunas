/**
 * The line that says which version of the recording plays, with the button to switch
 * (docs/sites/cleaned-audio-ux.md §3, §4 Live, §6). Used in the dock's notice row and under the play
 * button in the listening room; the words come from the shared `@emunas/i18n` module only.
 *
 * - State A (the improved copy plays): "Sound improved by AI · Switch to the original".
 * - State B (the original plays, an improved copy exists): "A version with the sound improved by AI
 *   is also available · Listen to it".
 * - State C (no improved copy): nothing.
 *
 * The button is a native `<button type="button">`; its visible text is its name and
 * `aria-describedby` points at the sentence before it. No `aria-pressed`. The switch is announced
 * by the dock's own polite region (`useVersionAnnouncement`).
 */
import { audioVersionLabel, type AudioVersion, type UiLang } from "@emunas/i18n";
import { useId, type JSX } from "react";
import { chooseAudioVersion } from "./engine.ts";

/** The version a line describes, or null for state C (no line). */
export function versionLineState(playingVersion: AudioVersion, cleanedAvailable: boolean): AudioVersion | null {
  return cleanedAvailable ? playingVersion : null;
}

export function VersionLine({
  version,
  ui,
  textClassName,
  buttonClassName,
  separatorClassName,
}: {
  /** The version playing (or about to play): "cleaned" is state A, "original" state B. */
  version: AudioVersion;
  ui: UiLang;
  textClassName?: string;
  buttonClassName?: string;
  separatorClassName?: string;
}): JSX.Element {
  const id = useId();
  const cleaned = version === "cleaned";
  const target: AudioVersion = cleaned ? "original" : "cleaned";
  return (
    <>
      <span id={id} className={textClassName}>
        {audioVersionLabel(cleaned ? "cleaned.text" : "original.text", ui)}
      </span>
      <span className={separatorClassName} aria-hidden="true">
        ·
      </span>
      <button
        type="button"
        className={buttonClassName}
        aria-describedby={id}
        onClick={() => chooseAudioVersion(target)}
        data-audio-version={version}
      >
        {audioVersionLabel(cleaned ? "cleaned.action" : "original.action", ui)}
      </button>
    </>
  );
}
