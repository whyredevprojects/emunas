import type { UiLang } from "./lang.ts";

/** Spoken language of a recording (`Shiur["lang"]` in src/types.ts). */
export type AudioLang = "yi" | "en";

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

/** Base direction of each spoken language, for mixed-script strings that belong to a shiur. */
const AUDIO_DIR: Readonly<Record<AudioLang, Dir>> = { en: "ltr", yi: "rtl" };

/** `lang`/`dir` of a data string. `lang` is one of the interface languages (`en`, `yi`, `he`, …). */
export interface LangAttrs {
  readonly lang: UiLang;
  readonly dir: Dir;
  readonly script: Script;
}

/**
 * The language of Hebrew-script text in a data string (catalog titles, names, sefer titles), which
 * carries no language tag of its own:
 * - In the Hebrew edition it is `he`. Most Hebrew-script data is loshn koydesh (names, seforim,
 *   catalog phrases such as "ענין חנוכה"), and reading it as Hebrew keeps it consistent with the
 *   surrounding page for screen readers, fonts and hyphenation; a Yiddish catalog title inside a
 *   Hebrew page is read by Hebrew rules rather than switching to a `yi` voice most readers lack.
 * - Otherwise it is `yi` when the string belongs to a Yiddish shiur (`shiurLang === "yi"`), or, for
 *   a string that belongs to no one shiur (`shiurLang === null`: corpus names, index entries), when
 *   the edition is Yiddish.
 * - Otherwise `he`: Hebrew-script words in an English shiur or an English page are loshn koydesh
 *   terms.
 * The rule depends only on "is the edition Hebrew" and "is the context Yiddish", so a further
 * Latin-script language follows the English case without change.
 */
export function hebrewScriptLang(shiurLang: AudioLang | null, edition: UiLang): "yi" | "he" {
  if (edition === "he") return "he";
  return (shiurLang ?? edition) === "yi" ? "yi" : "he";
}

/**
 * `lang`/`dir` for a catalog or data string shown in `edition`, given the language of the shiur it
 * belongs to (`null` when it belongs to no one shiur):
 * - Latin-only text → `en`, `ltr`.
 * - Hebrew-script text → `hebrewScriptLang(shiurLang, edition)`, `rtl`.
 * - Mixed text → the direction of the shiur's language: an English shiur's title is an English
 *   phrase with Hebrew-script terms ("יעקב's Tremendous Accomplishment …" is LTR even though it starts
 *   with a Hebrew word), a Yiddish shiur's title is a Yiddish phrase with English words ("המקוה …
 *   embassy …", "DIGITAL ELECTRONICS הנסיון …" are RTL). With no shiur (`null`), the direction of
 *   the first strong character (the `dir="auto"` rule). The language follows the direction by the
 *   rules above. Render it isolated (`<bdi>` or `dir` on its own element) so the embedded run does
 *   not reorder its neighbours.
 *
 * Generated text whose language is known (`writeup.en`, `oneLiner.yi`, a translation overlay) does
 * not need this: use the `lang`/`dir` from `pickText` / `pickLocalized` (./content.ts).
 */
export function langFor(text: string, shiurLang: AudioLang | null, edition: UiLang): LangAttrs {
  const script = scriptOf(text);
  const hebrewLang = hebrewScriptLang(shiurLang, edition);
  if (script === "latin") return { lang: "en", dir: "ltr", script };
  if (script === "he") return { lang: hebrewLang, dir: "rtl", script };
  const dir = shiurLang === null ? (firstStrongDir(text) ?? "ltr") : AUDIO_DIR[shiurLang];
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
