/**
 * Where the human-written About texts come from: `src/content/about/{ed}/{part}.md` (W5.3 owns
 * src/content/**). A part without its file renders a marked placeholder. Nothing is generated.
 */
import type { MarkdownInstance } from "astro";
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
