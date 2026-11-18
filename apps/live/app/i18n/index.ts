/**
 * Live UI strings: typed `t()` per interface language (`createT` from @emunas/i18n).
 * `t("missing")` is a type error because the key union comes from `en.ts`.
 */
import { createT, isUiLang, type TFunction, type UiLang } from "@emunas/i18n";
import { useParams } from "react-router";
import { en, type UiKey } from "./en.ts";
import { he } from "./he.ts";
import { yi } from "./yi.ts";

export type { UiKey };
export type LiveT = TFunction<UiKey>;

export const UI_TABLES = { en, yi, he } as const;

const cache: Partial<Record<UiLang, LiveT>> = {};

/** The typed `t()` for one interface language (memoized). */
export function tFor(ui: UiLang): LiveT {
  return (cache[ui] ??= createT<UiKey>(UI_TABLES, ui));
}

/** The interface language from the `:ui` path segment; English when the segment is missing or invalid. */
export function useUi(): UiLang {
  const { ui } = useParams();
  return isUiLang(ui) ? ui : "en";
}

/** `t()` for the current interface language. */
export function useT(): LiveT {
  return tFor(useUi());
}
