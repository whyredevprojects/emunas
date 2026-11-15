/**
 * `<Text>`: the one way the Live site renders a data string (tech-live "i18n and RTL",
 * concept-live §7). Every data string is direction-isolated and carries a correct `lang`, because
 * catalog titles mix scripts ("The קדושה of צדיקים"). Text is never rewritten or transliterated.
 *
 * Three forms:
 * - `<Text value="..." lang="en" />`: generated text whose language is known (summary.en,
 *   writeup.yi). `dir` follows the language.
 * - `<Text value={l} lang="yi" />` with an `L` (`{en, yi}`): picks that language's string.
 * - `<Text value="..." shiurLang="yi" />`: a catalog/original string of unknown script. `lang` and
 *   `dir` come from `langFor` (Hebrew script → yi in a Yiddish shiur, he in an English one; Latin
 *   → en; mixed → by the first strong character, the same rule as `dir="auto"`).
 *
 * The default element is `<bdi>`; pass `as` for block content (`p`, `h1`, …). Non-`bdi` elements
 * get an explicit `dir`, so they isolate too.
 */
import { langFor, type ContentLang, type Dir, type UiLang } from "@emunas/i18n";
import type { L } from "@emunas/corpus/public";
import type { JSX } from "react";

type TextTag = "bdi" | "span" | "p" | "div" | "h1" | "h2" | "h3" | "h4" | "li" | "dd" | "dt" | "cite" | "strong" | "em";

interface Common {
  as?: TextTag;
  className?: string;
  id?: string;
}

export type TextProps = Common &
  (
    | { value: string; lang: ContentLang; shiurLang?: never }
    | { value: L; lang: UiLang; shiurLang?: never }
    | { value: string; shiurLang: UiLang; lang?: never }
  );

const LANG_DIR: Readonly<Record<ContentLang, Dir>> = { en: "ltr", yi: "rtl", he: "rtl" };

/** `lang`/`dir` and the string to show, without rendering (for `aria-label`, `<title>`, tests). */
export function textAttrs(props: TextProps): { text: string; lang: ContentLang; dir: Dir } {
  if (props.shiurLang !== undefined) {
    const a = langFor(props.value, props.shiurLang);
    return { text: props.value, lang: a.lang, dir: a.dir };
  }
  if (typeof props.value === "string") {
    return { text: props.value, lang: props.lang, dir: LANG_DIR[props.lang] };
  }
  const lang = props.lang as UiLang;
  return { text: props.value[lang], lang, dir: LANG_DIR[lang] };
}

export function Text(props: TextProps): JSX.Element {
  const { as: Tag = "bdi", className, id } = props;
  const { text, lang, dir } = textAttrs(props);
  return (
    <Tag lang={lang} dir={dir} className={className} id={id}>
      {text}
    </Tag>
  );
}
