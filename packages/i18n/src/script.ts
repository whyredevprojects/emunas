import type { UiLang } from "./lang.ts";

/**
 * Script and direction helpers for data strings. Catalog titles mix scripts within
 * a line ("The קדושה of צדיקים", "המקוה והתיבה הם כמו embassy של שמים על הארץ"),
 * and every such string is rendered as its own direction-isolated run with
 * correct `lang` (concept-quiet §8, concept-live §7, tech-live "i18n and RTL").
 * Nothing here rewrites or transliterates text.
 */

export type Script = "he" | "latin" | "mixed";
export type Dir = "ltr" | "rtl";

/** Hebrew-script letters: the Hebrew block letters and the presentation forms (U+FB1D–FB4F). */
const HEBREW_LETTER = /[א-תׯ-ײיִ-ﭏ]/u;
const ANY_LETTER = /\p{L}/gu;
/** Right-to-left scripts that could plausibly appear (Hebrew, Arabic, Syriac, Thaana, NKo). */
const RTL_LETTER = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;

/**
 * Which scripts the letters of `text` belong to. Marks (nikud, cantillation),
 * digits, spaces and punctuation are ignored. Any non-Hebrew letter counts as
 * Latin (the corpus has no other script). A string with no letters at all
 * (digits, punctuation) is reported as `latin`, which is the harmless choice for
 * `dir="ltr"` numbers.
 */
export function scriptOf(text: string): Script {
  let he = false;
  let latin = false;
  for (const [ch] of text.matchAll(ANY_LETTER)) {
    if (HEBREW_LETTER.test(ch)) he = true;
    else latin = true;
    if (he && latin) return "mixed";
  }
  return he ? "he" : "latin";
}

/**
 * Direction of the first strong (letter) character, the rule browsers apply for
 * `dir="auto"` and `<bdi>` (Unicode Bidi P2–P3). Using the same rule at build time
 * keeps server-rendered `dir` attributes identical to what the browser would pick:
 * "The קדושה of צדיקים" is LTR, "המקוה … embassy …" is RTL. `null` when there is
 * no letter.
 */
export function firstStrongDir(text: string): Dir | null {
  for (const [ch] of text.matchAll(ANY_LETTER)) {
    return RTL_LETTER.test(ch) ? "rtl" : "ltr";
  }
  return null;
}

/** `lang` attribute values used for data strings. */
export type ContentLang = "en" | "yi" | "he";

export interface LangAttrs {
  readonly lang: ContentLang;
  readonly dir: Dir;
  readonly script: Script;
}

/**
 * `lang`/`dir` for a catalog or data string, given the language of the shiur it
 * belongs to:
 * - Latin-only text → `en`, `ltr`.
 * - Hebrew-script text → `yi` in a Yiddish shiur, `he` in an English shiur (where
 *   Hebrew-script words are loshn koydesh terms), `rtl`.
 * - Mixed text → direction of the first strong character; the language follows
 *   that direction by the same rule. Render it isolated (`<bdi>` or `dir` on its
 *   own element) so the embedded run does not reorder its neighbours.
 *
 * Generated text whose language is known (`writeup.en`, `oneLiner.yi`) does not
 * need this: it is `lang="en"` or `lang="yi"` by construction.
 */
export function langFor(text: string, shiurLang: UiLang): LangAttrs {
  const script = scriptOf(text);
  const hebrewLang: ContentLang = shiurLang === "yi" ? "yi" : "he";
  if (script === "latin") return { lang: "en", dir: "ltr", script };
  if (script === "he") return { lang: hebrewLang, dir: "rtl", script };
  const dir = firstStrongDir(text) ?? "ltr";
  return { lang: dir === "rtl" ? hebrewLang : "en", dir, script };
}

const FSI = "⁨";
const LRI = "⁦";
const RLI = "⁧";
const PDI = "⁩";

/**
 * Wraps `text` in Unicode isolate controls for plain-text contexts where no
 * element can carry `dir` (`<title>`, `aria-label`, `<meta name=description>`,
 * Media Session metadata). Default is first-strong isolation (FSI); pass a
 * direction to force it, e.g. `isolate("1:19:05", "ltr")` for times inside RTL.
 */
export function isolate(text: string, dir?: Dir): string {
  const open = dir === "ltr" ? LRI : dir === "rtl" ? RLI : FSI;
  return `${open}${text}${PDI}`;
}

/** Removes isolate/embedding/override controls, e.g. before comparing or indexing strings. */
export function stripBidiControls(text: string): string {
  return text.replace(/[‎‏‪-‮⁦-⁩]/gu, "");
}
