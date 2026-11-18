/**
 * `<Text>`: the one way the Live site renders a data string (tech-live "i18n and RTL",
 * concept-live §7). Every data string is direction-isolated and carries a correct `lang`, because
 * catalog titles mix scripts ("The קדושה of צדיקים"). Text is never rewritten or transliterated.
 *
 * Three forms:
 * - `<Text value="..." lang="en" />`: generated text whose language is known. `dir` follows the
 *   language.
 * - `<Text value={l} lang={reader} />` with a `LocalizedText` (`{en, yi, he?}`): picks the reader's
 *   language, falling back along `CONTENT_FALLBACK` (@emunas/i18n) when there is no current
 *   translation. The element carries the `lang`/`dir` of the text actually shown.
 * - `<Text value="..." shiurLang="yi" />`: a catalog/original string of unknown script. `lang` and
 *   `dir` come from `langFor` with the page's edition (Hebrew script → he in the Hebrew edition; yi in
 *   a Yiddish shiur, or with `shiurLang={null}` (no one shiur) in the Yiddish edition; he otherwise.
 *   Latin → en; mixed → by the first strong character, the same rule as `dir="auto"`). The edition
 *   is the `:ui` path segment unless `edition` is passed.
 *
 * The default element is `<bdi>`; pass `as` for block content (`p`, `h1`, …). Non-`bdi` elements
 * get an explicit `dir`, so they isolate too.
 */
import { langFor, pickText, UI_DIR, type AudioLang, type Dir, type LocalizedText, type UiLang } from "@emunas/i18n";
import type { JSX } from "react";
import { useUi } from "../i18n/index.ts";

type TextTag = "bdi" | "span" | "p" | "div" | "h1" | "h2" | "h3" | "h4" | "li" | "dd" | "dt" | "cite" | "strong" | "em";

interface Common {
  as?: TextTag;
  className?: string;
  id?: string;
}

export type TextProps = Common &
  (
    | { value: string; lang: UiLang; shiurLang?: never; edition?: never }
    | { value: LocalizedText; lang: UiLang; shiurLang?: never; edition?: never }
    | { value: string; shiurLang: AudioLang | null; edition?: UiLang; lang?: never }
  );

/**
 * `lang`/`dir` and the string to show, without rendering (for `aria-label`, `<title>`, tests).
 * `edition` is the page's interface language (used for catalog strings only).
 */
export function textAttrs(props: TextProps, edition: UiLang): { text: string; lang: UiLang; dir: Dir } {
  if (props.shiurLang !== undefined) {
    const a = langFor(props.value, props.shiurLang, props.edition ?? edition);
    return { text: props.value, lang: a.lang, dir: a.dir };
  }
  const lang = props.lang as UiLang;
  if (typeof props.value === "string") {
    return { text: props.value, lang, dir: UI_DIR[lang] };
  }
  const picked = pickText(props.value, lang);
  return { text: picked.text, lang: picked.lang, dir: picked.dir };
}

export function Text(props: TextProps): JSX.Element {
  const { as: Tag = "bdi", className, id } = props;
  const { text, lang, dir } = textAttrs(props, useUi());
  return (
    <Tag lang={lang} dir={dir} className={className} id={id}>
      {text}
    </Tag>
  );
}

/** Placeholder for a data string inside a message (`t("key", { name: TEXT_SLOT })`), see `aroundText`. */
export const TEXT_SLOT = "\u0000";

/**
 * A message with `TEXT_SLOT` in it, with `node` (usually a `<Text>`) in its place, so a data string
 * inside a sentence keeps the `lang`/`dir` of the text actually shown (a fallback language may differ
 * from the sentence's) instead of taking the sentence's.
 */
export function aroundText(message: string, node: JSX.Element): JSX.Element {
  const at = message.indexOf(TEXT_SLOT);
  if (at < 0) return <>{message}</>;
  return (
    <>
      {message.slice(0, at)}
      {node}
      {message.slice(at + TEXT_SLOT.length)}
    </>
  );
}
