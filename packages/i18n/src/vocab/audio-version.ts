import { byUiLang, type UiLang } from "../lang.ts";
import { createT, type MessageTable, type MessageTables, type Params, type TFunction } from "../t.ts";

/**
 * Shared wording for the AI-improved audio (docs/sites/cleaned-audio-ux.md §3, §5). Every playable
 * recording has a second copy with the sound improved by AI; the sites play the original by default
 * and keep the improved copy one click away (owner, 2026-11-19). Both sites take the words from here, so they cannot drift apart.
 *
 * - `cleaned.*`: the line under the player while the listener chose the improved copy (state A).
 * - `original.*`: the line while the original plays, the default (state B).
 * - `announce.*`: the polite status message after a switch.
 * - `partOriginal`: Quiet, multi-part shiur, a part with no improved copy (`{part}` = 1-based).
 * - `about`: the paragraph for the About pages.
 *
 * Copy rules: speak of the sound or the recording only, never of the shiur or its content; never
 * name the model; never mention transcription or speech recognition. Yiddish says "מקורית" for
 * "the original", Hebrew "ההקלטה המקורית".
 *
 * Status: owner-approved English wording; Yiddish and Hebrew await a named reviewer. See
 * docs/sites/copy-review.md, "Improved audio".
 */
export const AUDIO_VERSION_LABEL_STATUS = "proposed" as const;

/** Which copy of a recording plays: the original (the default) or the AI-improved one. */
export type AudioVersion = "cleaned" | "original";

/** Every value of `AudioVersion`; the first is the default. */
export const AUDIO_VERSIONS: readonly AudioVersion[] = ["original", "cleaned"];

/** The default version: a missing, blocked or unknown stored value means this. */
export const DEFAULT_AUDIO_VERSION: AudioVersion = "original";

/**
 * `localStorage` key of the listener's one global choice, the same on both sites (each site has its
 * own origin, so the choices stay independent). Values: `"cleaned"` | `"original"`. Read and write
 * it inside try/catch; only an explicit click writes it.
 */
export const AUDIO_VERSION_KEY = "emunas.audioVersion";

/** Narrows a stored value: `"cleaned"` stays, anything else (missing, garbage) is the default. */
export function parseAudioVersion(value: unknown): AudioVersion {
  return value === "cleaned" ? "cleaned" : DEFAULT_AUDIO_VERSION;
}

const en = {
  "cleaned.text": "Sound improved by AI",
  "cleaned.action": "Switch to the original",
  "original.text": "A version with the sound improved by AI is also available",
  "original.action": "Listen to it",
  "announce.cleaned": "Now playing the version improved by AI.",
  "announce.original": "Now playing the original recording.",
  partOriginal: "Part {part}: original recording only",
  about:
    "By default the original recording plays. There is also a version with the sound improved by AI, which removes noise and hiss; switch to it from the line under the player. Now and then the improvement can change how a word sounds.",
} as const;

export type AudioVersionLabelKey = keyof typeof en;

const yi: MessageTable<AudioVersionLabelKey> = {
  "cleaned.text": "קלאנג אויסגעבעסערט דורך AI",
  "cleaned.action": "הערט די מקורית",
  "original.text": "א ווערסיע מיט קלאנג אויסגעבעסערט דורך AI איז אויך דא",
  "original.action": "הערט זי",
  "announce.cleaned": "יעצט שפילט די ווערסיע אויסגעבעסערט דורך AI.",
  "announce.original": "יעצט שפילט די מקורית.",
  partOriginal: "טייל {part}: נאר די מקורית",
  about:
    "ווען מען קלייבט נישט אנדערש, שפילט די מקורית. עס איז אויך דא א ווערסיע מיט קלאנג אויסגעבעסערט דורך AI, וואס נעמט אראפ דעם רעש; מען קען איבערגיין צו איר אונטער דעם שפילער. אמאל קען דאס אויסבעסערן טוישן ווי א ווארט הערט זיך.",
};

const he: MessageTable<AudioVersionLabelKey> = {
  "cleaned.text": "הקול שופר על ידי AI",
  "cleaned.action": "מעבר להקלטה המקורית",
  "original.text": "יש גם גרסה שהקול בה שופר על ידי AI",
  "original.action": "שמעו אותה",
  "announce.cleaned": "כעת מתנגנת הגרסה שהקול בה שופר על ידי AI.",
  "announce.original": "כעת מתנגנת ההקלטה המקורית.",
  partOriginal: "חלק {part}: ההקלטה המקורית בלבד",
  about:
    "כברירת מחדל מושמעת ההקלטה המקורית. יש גם גרסה שהקול בה שופר על ידי AI, המסיר רעשים ורחשים; אפשר לעבור אליה מהשורה שמתחת לנגן. לפעמים השיפור עלול לשנות את צליל המילה.",
};

/** Every language's table, over one key union; the one accessor for a table (`AUDIO_VERSION_LABELS[lang]`). */
export const AUDIO_VERSION_LABELS: MessageTables<AudioVersionLabelKey> = { en, yi, he };

const T: Readonly<Record<UiLang, TFunction<AudioVersionLabelKey>>> = byUiLang((lang) =>
  createT<AudioVersionLabelKey>(AUDIO_VERSION_LABELS, lang),
);

/** One improved-audio string, e.g. `audioVersionLabel("partOriginal", "yi", { part: 2 })`. */
export function audioVersionLabel(key: AudioVersionLabelKey, lang: UiLang, params?: Params): string {
  return T[lang](key, params);
}
