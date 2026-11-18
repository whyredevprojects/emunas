/**
 * Where the human-written About texts come from: `src/content/about/{ed}/{part}.md` (W5.3 owns
 * src/content/**). A part without its file renders a marked placeholder. Nothing is generated.
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
import type { Ed } from "../../../lib/edition.ts";

type Md = MarkdownInstance<Record<string, unknown>>;

const FILES = import.meta.glob<Md>("../../../content/about/*/*.md", { eager: true });

/** Parses `…/content/about/{ed}/{part}.md` into its edition and part, or null for other files. */
export function aboutFileKey(path: string): { ed: Ed; part: AboutPart } | null {
  const m = /\/content\/about\/(yi|en)\/([a-z]+)\.md$/.exec(path);
  if (!m) return null;
  const part = m[2] as AboutPart;
  return ABOUT_PARTS.includes(part) ? { ed: m[1] as Ed, part } : null;
}

/** The supplied text of a part in an edition, or null (placeholder). */
export function aboutText(ed: Ed, part: AboutPart, files: Readonly<Record<string, Md>> = FILES): Md | null {
  for (const [path, mod] of Object.entries(files)) {
    const key = aboutFileKey(path);
    if (key && key.ed === ed && key.part === part) return mod;
  }
  return null;
}

export interface AboutLinkTargets {
  readonly ed: Ed;
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
    if (href.startsWith("/") || href.startsWith("#")) return whole;
    const target = href === "live:" ? { url: t.live, lang: t.ed } : href === "guide:" ? { url: t.guide, lang: undefined } : null;
    if (target === null) throw new Error(`About text (${t.ed}): unknown link "${href}"; use a root-relative path, #anchor, live: or guide:`);
    const lang = target.lang === undefined ? "" : ` hreflang="${target.lang}"`;
    return (
      `<a href="${escapeAttr(target.url)}"${lang}${rest} target="_blank" rel="noopener">` +
      `${text}${NEW_TAB_ICON_SVG}<span class="visually-hidden"> ${escapeAttr(t.newTab)}</span></a>`
    );
  });
}
