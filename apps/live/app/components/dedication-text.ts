/**
 * The dedication (owner request, corpus-wave-plan F.3): its exact text and the check the post-build
 * step (`app/seo/check.server.ts`) runs over every built HTML file. Plain TypeScript (no JSX, no
 * CSS) so the build config can import it.
 */

export const DEDICATION = "לעילוי נשמת אשר בן ישראל";

/** A paragraph that is the last thing in a `<footer>`. */
const LAST_LINE = /<footer\b[^>]*>(?:(?!<\/footer>)[\s\S])*?<p\b([^>]*)>([^<]*)<\/p>\s*<\/footer>/gu;

/**
 * Problems with the dedication in one HTML document (empty when it is right): the text must appear
 * exactly once, as the last line of a `<footer>`, marked `lang="he"` and `dir="rtl"`.
 */
export function dedicationProblems(html: string): string[] {
  const count = html.split(DEDICATION).length - 1;
  if (count === 0) return ["no dedication line"];
  if (count > 1) return [`the dedication appears ${count} times`];
  const line = [...html.matchAll(LAST_LINE)].find((m) => m[2] === DEDICATION);
  if (!line) return ["the dedication is not the last line of a <footer>"];
  const attrs = line[1] ?? "";
  const out: string[] = [];
  if (!/\blang="he"/u.test(attrs)) out.push('the dedication is not marked lang="he"');
  if (!/\bdir="rtl"/u.test(attrs)) out.push('the dedication is not marked dir="rtl"');
  return out;
}
