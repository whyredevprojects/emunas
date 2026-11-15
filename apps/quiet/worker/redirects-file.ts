/**
 * The Workers static-assets `_redirects` file: parser, writer and the platform limits.
 *
 * apps/quiet/scripts/redirects.ts writes `dist/_redirects` after `astro build` (corpus-wave-plan
 * §5, D12): 301 lines from the old site-derived entity addresses and retired corpus ids to where
 * they live now. Workers static assets honour the file before any asset lookup, within these
 * limits: 2,000 static rules, 100 dynamic rules (splats `*` or placeholders `:name`), 1,000
 * characters per rule. The parser throws on anything beyond them, so a deploy never uploads a file
 * the platform would reject or silently truncate.
 *
 * Kept self-contained (no workspace imports) like render-headers.ts.
 */

export const MAX_STATIC_REDIRECTS = 2000;
export const MAX_DYNAMIC_REDIRECTS = 100;
export const MAX_REDIRECT_LINE = 1000;
export const REDIRECT_STATUSES: readonly number[] = [200, 301, 302, 303, 307, 308];

export interface RedirectRule {
  /** Root-relative source path, as requests arrive (percent-encoded). */
  from: string;
  /** Root-relative path (optionally with a fragment) or absolute URL. */
  to: string;
  status: number;
}

/** A rule with a splat or a `:placeholder` counts against the dynamic limit. */
export function isDynamic(from: string): boolean {
  return from.includes("*") || /(?:^|\/):[A-Za-z]/.test(from);
}

/** One `_redirects` line for a rule (validated). */
export function formatRule(rule: RedirectRule): string {
  const line = `${rule.from} ${rule.to} ${rule.status}`;
  checkRule(rule, line, "rule");
  return line;
}

function checkRule(rule: RedirectRule, line: string, where: string): void {
  if (line.length > MAX_REDIRECT_LINE) throw new Error(`_redirects ${where} is longer than ${MAX_REDIRECT_LINE} characters`);
  if (!rule.from.startsWith("/")) throw new Error(`_redirects ${where}: source must start with /`);
  if (/\s/.test(rule.from) || /\s/.test(rule.to)) throw new Error(`_redirects ${where}: whitespace inside a path`);
  if (rule.from.includes("#") || rule.from.includes("?")) throw new Error(`_redirects ${where}: source must be a bare path`);
  if (!rule.to.startsWith("/") && !/^https:\/\//.test(rule.to)) throw new Error(`_redirects ${where}: target must start with / or https://`);
  if (!REDIRECT_STATUSES.includes(rule.status)) throw new Error(`_redirects ${where}: status ${rule.status} not allowed`);
}

/** Parses a `_redirects` file; throws on malformed lines, duplicate sources and the platform limits. */
export function parseRedirects(text: string): RedirectRule[] {
  const rules: RedirectRule[] = [];
  const seen = new Set<string>();
  let dynamic = 0;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const parts = line.split(/\s+/);
    if (parts.length < 2 || parts.length > 3) throw new Error(`_redirects line ${i + 1}: expected "<from> <to> [status]"`);
    const rule: RedirectRule = { from: parts[0]!, to: parts[1]!, status: parts[2] === undefined ? 302 : Number(parts[2]) };
    checkRule(rule, raw, `line ${i + 1}`);
    if (seen.has(rule.from)) throw new Error(`_redirects line ${i + 1}: duplicate source ${rule.from}`);
    seen.add(rule.from);
    if (isDynamic(rule.from)) dynamic++;
    rules.push(rule);
  });
  const staticCount = rules.length - dynamic;
  if (staticCount > MAX_STATIC_REDIRECTS) throw new Error(`_redirects has ${staticCount} static rules (max ${MAX_STATIC_REDIRECTS})`);
  if (dynamic > MAX_DYNAMIC_REDIRECTS) throw new Error(`_redirects has ${dynamic} dynamic rules (max ${MAX_DYNAMIC_REDIRECTS})`);
  return rules;
}

/** The file text for `rules` (one header comment, then one line per rule), validated by `parseRedirects`. */
export function formatRedirects(rules: readonly RedirectRule[], header: readonly string[] = []): string {
  const text = [...header.map((h) => `# ${h}`), ...rules.map(formatRule)].join("\n") + "\n";
  parseRedirects(text);
  return text;
}
