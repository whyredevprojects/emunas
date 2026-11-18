import type { UiLang } from "../lang.ts";
import { createT, type MessageTable, type MessageTables, type Params, type TFunction } from "../t.ts";

/**
 * Shared wording for the AI-improved audio (docs/sites/cleaned-audio-ux.md §3, §5). Every playable
 * recording has a second copy with the sound improved by AI; the sites play it by default and keep
 * the original one click away. Both sites take the words from here, so they cannot drift apart.
 *
 * - `cleaned.*`: the line under the player while the improved copy plays (state A).
 * - `original.*`: the line while the listener chose the original (state B).
 * - `announce.*`: the polite status message after a switch.
 * - `partOriginal`: Quiet, multi-part shiur, a part with no improved copy (`{part}` = 1-based).
 * - `about`: the paragraph for the About pages.
 *
 * Copy rules: speak of the sound or the recording only, never of the shiur or its content; never
 * name the model; never mention transcription or speech recognition. Yiddish says "מקורית" for
 * "the original".
 *
 * Status: owner-approved English wording; Yiddish awaits a named reviewer. See
 * docs/sites/copy-review.md, "Improved audio".
 */
export const AUDIO_VERSION_LABEL_STATUS = "proposed" as const;

/** Which copy of a recording plays: the AI-improved one (the default) or the original. */
export type AudioVersion = "cleaned" | "original";

/** Every value of `AudioVersion`; the first is the default. */
export const AUDIO_VERSIONS: readonly AudioVersion[] = ["cleaned", "original"];

/** The default version: a missing, blocked or unknown stored value means this. */
export const DEFAULT_AUDIO_VERSION: AudioVersion = "cleaned";

/**
 * `localStorage` key of the listener's one global choice, the same on both sites (each site has its
 * own origin, so the choices stay independent). Values: `"cleaned"` | `"original"`. Read and write
 * it inside try/catch; only an explicit click writes it.
 */
export const AUDIO_VERSION_KEY = "emunas.audioVersion";

/** Narrows a stored value: `"original"` stays, anything else (missing, garbage) is the default. */
export function parseAudioVersion(value: unknown): AudioVersion {
  return value === "original" ? "original" : DEFAULT_AUDIO_VERSION;
}

export const audioVersionLabelsEn = {
  "cleaned.text": "Sound improved by AI",
  "cleaned.action": "Switch to the original",
  "original.text": "A version with the sound improved by AI is also available",
  "original.action": "Listen to it",
  "announce.cleaned": "Now playing the version improved by AI.",
  "announce.original": "Now playing the original recording.",
  partOriginal: "Part {part}: original recording only",
  about:
    "The recordings play with the sound improved by AI, which removes noise and hiss. Now and then this can change how a word sounds, so the original recording is always one click away, under the player. Downloads are always the original recording.",
} as const;

export type AudioVersionLabelKey = keyof typeof audioVersionLabelsEn;

export const audioVersionLabelsYi: MessageTable<AudioVersionLabelKey> = {
  "cleaned.text": "קלאנג אויסגעבעסערט דורך AI",
  "cleaned.action": "הערט די מקורית",
  "original.text": "א ווערסיע מיט קלאנג אויסגעבעסערט דורך AI איז אויך דא",
  "original.action": "הערט זי",
  "announce.cleaned": "יעצט שפילט די ווערסיע אויסגעבעסערט דורך AI.",
  "announce.original": "יעצט שפילט די מקורית.",
  partOriginal: "טייל {part}: נאר די מקורית",
  about:
    "די רעקארדירונגען שפילן מיט קלאנג אויסגעבעסערט דורך AI, וואס נעמט אראפ דעם רעש. אמאל קען דאס טוישן ווי א ווארט הערט זיך, דעריבער איז די מקורית שטענדיג איין קליק אוועק, אונטער דעם שפילער. אראפלאדן גיט שטענדיג די מקורית.",
};

export const AUDIO_VERSION_LABELS: MessageTables<AudioVersionLabelKey> = {
  en: audioVersionLabelsEn,
  yi: audioVersionLabelsYi,
};

const T: Readonly<Record<UiLang, TFunction<AudioVersionLabelKey>>> = {
  en: createT<AudioVersionLabelKey>(AUDIO_VERSION_LABELS, "en"),
  yi: createT<AudioVersionLabelKey>(AUDIO_VERSION_LABELS, "yi"),
};

/** One improved-audio string, e.g. `audioVersionLabel("partOriginal", "yi", { part: 2 })`. */
export function audioVersionLabel(key: AudioVersionLabelKey, lang: UiLang, params?: Params): string {
  return T[lang](key, params);
}
