/**
 * Renders the `_headers` template that the app build copied from public/ into the
 * asset directory, filling in the media origin (Amendment A1: audio is served from
 * `media.<domain>`, so CSP `media-src`/`connect-src` must name it).
 *
 *   tsx apps/quiet/worker/render-headers.ts apps/quiet/dist/_headers [--allow-missing]
 *
 * Reads EMUNAS_MEDIA_ORIGIN from the environment. Without it the command fails, unless
 * `--allow-missing` is given (PR previews, local checks): then the placeholder is removed
 * and the CSP allows only 'self' for media. The file is rewritten in place and checked
 * against the Workers `_headers` limits (100 rules, 2,000 characters per line).
 *
 * Kept self-contained (no workspace imports) so it runs before or without the app build.
 * apps/live/worker/render-headers.ts is the same tool for the Live site (kept identical; a test checks).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MEDIA_ORIGIN_PLACEHOLDER = "{{EMUNAS_MEDIA_ORIGIN}}";
export const MAX_RULES = 100;
export const MAX_LINE = 2000;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Validates a media origin and returns it normalised (`https://host[:port]`, no slash). */
export function parseMediaOrigin(raw: string): string {
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`EMUNAS_MEDIA_ORIGIN is not a URL`);
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error("EMUNAS_MEDIA_ORIGIN must use https (http only for localhost)");
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("EMUNAS_MEDIA_ORIGIN must be an origin only (no path, query, fragment or credentials)");
  }
  if (/[\s;,'"]/.test(value)) throw new Error("EMUNAS_MEDIA_ORIGIN contains characters not allowed in a CSP source");
  return url.origin;
}

export interface HeaderRule {
  pattern: string;
  headers: [name: string, value: string][];
}

/** Parses a `_headers` file; throws on malformed lines and on the platform limits. */
export function parseHeaders(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const n = i + 1;
    if (line.length > MAX_LINE) throw new Error(`_headers line ${n} is longer than ${MAX_LINE} characters`);
    if (line.trim() === "" || line.trimStart().startsWith("#")) return;
    if (/^\s/.test(line)) {
      const rule = rules.at(-1);
      if (!rule) throw new Error(`_headers line ${n}: header before any URL pattern`);
      const detach = /^\s+!\s*([A-Za-z0-9-]+)\s*$/.exec(line);
      if (detach) {
        rule.headers.push([`!${detach[1]!}`, ""]);
        return;
      }
      const m = /^\s+([A-Za-z0-9-]+):\s*(.*)$/.exec(line);
      if (!m) throw new Error(`_headers line ${n}: expected "Name: value" or "! Name"`);
      rule.headers.push([m[1]!, m[2]!.trim()]);
      return;
    }
    const pattern = line.trim();
    if (!pattern.startsWith("/") && !pattern.startsWith("https://")) {
      throw new Error(`_headers line ${n}: URL pattern must start with / or https://`);
    }
    rules.push({ pattern, headers: [] });
  });
  if (rules.length > MAX_RULES) throw new Error(`_headers has ${rules.length} rules (max ${MAX_RULES})`);
  for (const r of rules) if (r.headers.length === 0) throw new Error(`_headers rule ${r.pattern} has no headers`);
  return rules;
}

export interface RenderOptions {
  mediaOrigin: string | undefined;
  allowMissing?: boolean;
}

export function renderHeaders(template: string, opts: RenderOptions): string {
  const raw = opts.mediaOrigin?.trim() ?? "";
  let out: string;
  if (raw === "") {
    if (!opts.allowMissing) throw new Error("EMUNAS_MEDIA_ORIGIN is not set");
    // Drop the placeholder and the space before it: `media-src 'self' {{…}};` → `media-src 'self';`
    out = template.split(` ${MEDIA_ORIGIN_PLACEHOLDER}`).join("").split(MEDIA_ORIGIN_PLACEHOLDER).join("");
  } else {
    out = template.split(MEDIA_ORIGIN_PLACEHOLDER).join(parseMediaOrigin(raw));
  }
  const left = /\{\{[A-Z0-9_]+\}\}/.exec(out);
  if (left) throw new Error(`_headers still contains the placeholder ${left[0]}`);
  parseHeaders(out);
  return out;
}

function main(argv: string[]): number {
  const allowMissing = argv.includes("--allow-missing");
  const files = argv.filter((a) => !a.startsWith("--"));
  if (files.length !== 1) {
    console.error("usage: render-headers <asset-dir>/_headers [--allow-missing]");
    return 2;
  }
  const file = files[0]!;
  try {
    const rendered = renderHeaders(readFileSync(file, "utf8"), {
      mediaOrigin: process.env["EMUNAS_MEDIA_ORIGIN"],
      allowMissing,
    });
    writeFileSync(file, rendered);
    console.log(`rendered ${file} (${parseHeaders(rendered).length} rules)`);
    return 0;
  } catch (e) {
    console.error(`render-headers: ${(e as Error).message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
