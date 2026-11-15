/**
 * Language settings (concept-live §7): three separate things.
 *  1. Interface language: the `:ui` path segment (`/en/…`, `/yi/…`). Not stored here.
 *  2. Shiur (audio) language filter: Yiddish, English or both. Default both.
 *  3. Reading language for generated text: defaults to the interface language.
 *
 * (2) and (3) live in a Zustand store and in the query string (`?audio=yi&read=en`), never in the
 * path, so the number of prerendered pages does not multiply (tech-live §1). Defaults are omitted
 * from the query string. Query values win when present (shared links reproduce the sender's view);
 * otherwise the store keeps the last choice across navigation.
 */
import type { Ed } from "@emunas/corpus/public";
import { createStore, useStore } from "zustand";

export type AudioFilter = "both" | Ed;

export interface LanguageSettings {
  audio: AudioFilter;
  /** `null` = follow the interface language. */
  read: Ed | null;
}

export interface SettingsState extends LanguageSettings {
  setAudio(audio: AudioFilter): void;
  setRead(read: Ed | null): void;
  apply(partial: Partial<LanguageSettings>): void;
  reset(): void;
}

export const DEFAULT_SETTINGS: Readonly<LanguageSettings> = { audio: "both", read: null };

export const settingsStore = createStore<SettingsState>()((set) => ({
  ...DEFAULT_SETTINGS,
  setAudio: (audio) => set({ audio }),
  setRead: (read) => set({ read }),
  apply: (partial) => set(partial),
  reset: () => set({ ...DEFAULT_SETTINGS }),
}));

export function useSettings<T>(selector: (s: SettingsState) => T): T {
  return useStore(settingsStore, selector);
}

function isEd(v: string): v is Ed {
  return v === "en" || v === "yi";
}

/**
 * Reads `audio` and `read` from a query string. `audio=yi,en` (either order) means both. Unknown
 * values are ignored, so a mistyped link falls back to the stored choice.
 */
export function parseSettingsQuery(search: string | URLSearchParams): Partial<LanguageSettings> {
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  const out: Partial<LanguageSettings> = {};
  const audio = q.get("audio");
  if (audio !== null) {
    const langs = new Set(
      audio
        .split(",")
        .map((s) => s.trim())
        .filter(isEd),
    );
    if (langs.size === 2) out.audio = "both";
    else if (langs.size === 1) out.audio = [...langs][0]!;
  }
  const read = q.get("read");
  if (read !== null && isEd(read)) out.read = read;
  return out;
}

/** Writes the settings into a copy of `params`, leaving every other parameter alone. */
export function settingsToQuery(
  settings: LanguageSettings,
  params: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (settings.audio === "both") next.delete("audio");
  else next.set("audio", settings.audio);
  if (settings.read === null) next.delete("read");
  else next.set("read", settings.read);
  return next;
}

/** The effective reading language. */
export function readingLang(settings: Pick<LanguageSettings, "read">, ui: Ed): Ed {
  return settings.read ?? ui;
}

/** Whether a shiur in `lang` passes the audio filter. */
export function audioAllows(filter: AudioFilter, lang: Ed): boolean {
  return filter === "both" || filter === lang;
}
