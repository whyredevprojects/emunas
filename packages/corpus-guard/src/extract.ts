/**
 * Text extraction for the post-pass: undo the encodings a string can hide behind
 * in built output (HTML entities, JS/JSON string escapes) so keys, substrings and
 * verbatim runs are found however the bundler or the framework serialized them.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  shy: "",
  lrm: "",
  rlm: "",
  zwj: "",
  zwnj: "",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
};

function fromCodePoint(cp: number): string {
  return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
}

export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      return fromCodePoint(Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10));
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Decode JS/JSON string escapes anywhere in the text (\uXXXX, \u{…}, \xXX, \n, \", \/ …). */
export function decodeJsEscapes(s: string): string {
  if (!s.includes("\\")) return s;
  return s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_w, e: string) => {
    if (e.startsWith("u{")) return fromCodePoint(Number.parseInt(e.slice(2, -1), 16));
    if (e[0] === "u" && e.length === 5) return String.fromCharCode(Number.parseInt(e.slice(1), 16));
    if (e[0] === "x" && e.length === 3) return String.fromCharCode(Number.parseInt(e.slice(1), 16));
    switch (e) {
      case "n":
      case "r":
      case "t":
      case "f":
      case "v":
      case "b":
        return " ";
      default:
        return e;
    }
  });
}

/**
 * Visible and embedded text of an HTML document: tags become spaces, entities are
 * decoded, and `<script>` bodies (framework data payloads) are kept with JS escapes
 * decoded. `<style>` bodies are dropped.
 */
export function htmlToText(html: string): string {
  const withoutStyle = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ");
  const scriptsDecoded = withoutStyle.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi,
    (_w, _open: string, body: string) => ` ${decodeJsEscapes(body)} `,
  );
  // Attribute values (alt, title, aria-label, content, island props) are kept, but appended after
  // the text so an inline tag like <a href="#s3"> never splits a run in the paragraph around it.
  const attrs: string[] = [];
  const tagsOut = scriptsDecoded.replace(/<[a-zA-Z][^>]*>/g, (tag) => {
    for (const m of tag.matchAll(/=\s*("([^"]*)"|'([^']*)')/g)) attrs.push(m[2] ?? m[3] ?? "");
    return " ";
  });
  const text = `${tagsOut.replace(/<\/?[^>]*>/g, " ")}\n${attrs.join("\n")}`;
  // Entity-encoded attribute JSON (island props) may itself carry JS unicode escapes.
  return decodeJsEscapes(decodeHtmlEntities(text));
}

/** Short inline markers (source letters, footnote numbers) that could sit inside a run and split it. */
const SHORT_INLINE = /<(sup|sub|a|span|small)\b[^>]*>[^<]{0,4}<\/\1\s*>/gi;

/**
 * Text for the verbatim scan of an HTML page: `htmlToText`, plus (when it differs) a second
 * copy with short inline markers removed, so `… words <sup>3</sup> words …` is still one run.
 */
export function htmlProse(html: string): string {
  const text = htmlToText(html);
  const stripped = html.replace(SHORT_INLINE, " ");
  return stripped === html ? text : `${text}\n${htmlToText(stripped)}`;
}
