/**
 * Where the human-written About texts come from: `src/content/about/{ed}/{part}.md` (W5.3 owns
 * src/content/**). A part without a file in the edition's language falls back along
 * `CONTENT_FALLBACK` from `@emunas/i18n` (Hebrew → Yiddish → English), shown with the `lang`/`dir` of
 * the text actually used; a part with no file in any language is left out of the page. Nothing is
 * generated or machine-translated.
 *
 * Links in the texts are ordinary Markdown links. Pages of this site are written root-relative
 * (`/en/calendar/`) or as in-page anchors (`#report`); the two targets whose address depends on the
 * build are written as tokens and resolved by `resolveAboutLinks`:
 *
 * - `live:`  the listening app's home in the text's edition;
 * - `guide:` the 2012 Pocket Guide.
 *
 * Both open in a new tab, marked like `NewTabLink`. Any other scheme fails the build.
 */
import type { MarkdownInstance } from "astro";
import { NEW_TAB_ICON_SVG } from "../../../components/new-tab-icon.ts";
import { ABOUT_PARTS, type AboutPart } from "./_strings.ts";
import { pickLocalized } from "@emunas/i18n";
import { isEd, switchEdition, type Ed } from "../../../lib/edition.ts";

type Md = MarkdownInstance<Record<string, unknown>>;

const FILES = import.meta.glob<Md>("../../../content/about/*/*.md", { eager: true });

/** Parses `…/content/about/{ed}/{part}.md` into its edition and part, or null for other files. */
export function aboutFileKey(path: string): { ed: Ed; part: AboutPart } | null {
  const m = /\/content\/about\/([a-z]+)\/([a-z]+)\.md$/.exec(path);
  if (!m || !isEd(m[1])) return null;
  const part = m[2] as AboutPart;
  return ABOUT_PARTS.includes(part) ? { ed: m[1], part } : null;
}

/** An About text picked for an edition, with the language it is actually written in. */
export interface AboutText {
  readonly md: Md;
  /** The language of the file used; differs from the edition when the part fell back. */
  readonly lang: Ed;
  readonly dir: "ltr" | "rtl";
  readonly fallback: boolean;
}

/**
 * The supplied text of a part for an edition: the edition's own file, else the first file along
 * `CONTENT_FALLBACK[ed]`; null when no language has one (the part is not shown).
 */
export function aboutText(ed: Ed, part: AboutPart, files: Readonly<Record<string, Md>> = FILES): AboutText | null {
  const byLang: Partial<Record<Ed, Md>> = {};
  for (const [path, mod] of Object.entries(files)) {
    const key = aboutFileKey(path);
    if (key && key.part === part) byLang[key.ed] = mod;
  }
  const picked = pickLocalized(byLang, ed, () => true);
  return picked ? { md: picked.value, lang: picked.lang, dir: picked.dir, fallback: picked.fallback } : null;
}

export interface AboutLinkTargets {
  /** The edition of the page the text is shown on. */
  readonly ed: Ed;
  /**
   * The language the text is written in, when it differs from `ed` (a fallback text). Its links into
   * its own edition (`/yi/calendar/`) are moved to `ed` so the reader stays in the edition; a link to
   * an edition's home (`/yi/`) names that edition on purpose and is kept.
   */
  readonly textLang?: Ed;
  /** The Live home in `ed` (absolute). */
  readonly live: string;
  /** The Pocket Guide (absolute). */
  readonly guide: string;
  /** The screen-reader words after a new-tab link, "(opens in a new tab)". */
  readonly newTab: string;
}

const escapeAttr = (v: string): string => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * Resolves the `live:` and `guide:` tokens in an About text's HTML into new-tab links. Throws on a
 * link with any other scheme, so a stray or misspelled token can never reach the page.
 */
export function resolveAboutLinks(html: string, t: AboutLinkTargets): string {
  return html.replace(/<a href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g, (whole, href: string, rest: string, text: string) => {
    if (href.startsWith("#")) return whole;
    if (href.startsWith("/")) {
      const from = t.textLang ?? t.ed;
      if (from === t.ed || href === `/${from}/` || !href.startsWith(`/${from}/`)) return whole;
      return whole.replace(`href="${href}"`, `href="${switchEdition(href, t.ed)}"`);
    }
    const target = href === "live:" ? { url: t.live, lang: t.ed } : href === "guide:" ? { url: t.guide, lang: undefined } : null;
    if (target === null) throw new Error(`About text (${t.ed}): unknown link "${href}"; use a root-relative path, #anchor, live: or guide:`);
    const lang = target.lang === undefined ? "" : ` hreflang="${target.lang}"`;
    return (
      `<a href="${escapeAttr(target.url)}"${lang}${rest} target="_blank" rel="noopener">` +
      `${text}${NEW_TAB_ICON_SVG}<span class="visually-hidden"> ${escapeAttr(t.newTab)}</span></a>`
    );
  });
}
