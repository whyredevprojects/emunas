/**
 * Prints a deterministic sample of built HTML files for html-validate (W5.1): from each site, the
 * first page of every route type in both languages plus every `step`-th remaining page.
 *
 *   npx --yes html-validate@11.17.0 --config tests/cross-site/htmlvalidate.json \
 *     $(npx tsx tests/cross-site/html-sample.ts [--step 200])
 *
 * `role="list"` on styled lists is kept on purpose (VoiceOver drops list semantics when
 * `list-style: none`), so the config excludes that keyword from `no-redundant-role`; `long-title`
 * is off because Quiet titles are catalog titles, quoted as written.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { REPO, sitePaths } from "./sites.ts";

const { values } = parseArgs({ options: { step: { type: "string", default: "200" } } });
const step = Math.max(1, Number(values.step));
const p = sitePaths();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const f = join(dir, name);
    if (statSync(f).isDirectory()) {
      if (name !== "data" && name !== "_astro" && name !== "assets") walk(f, out);
    } else if (name.endsWith(".html")) out.push(f);
  }
  return out;
}

/** Route type of a file: its path with every per-item segment replaced. */
function routeType(root: string, file: string): string {
  const parts = relative(root, file).split("/");
  return parts.slice(0, 3).map((x, i) => (i >= 2 ? "*" : x.replace(/\.html$/u, ""))).join("/");
}

export function sample(root: string): string[] {
  const files = walk(root);
  const firsts = new Map<string, string>();
  for (const f of files) {
    const t = routeType(root, f);
    if (!firsts.has(t)) firsts.set(t, f);
  }
  const picked = new Set(firsts.values());
  files.forEach((f, i) => {
    if (i % step === 0) picked.add(f);
  });
  return [...picked].sort();
}

// Live's root `index.html` (and `__spa-fallback.html`) is the SPA shell React Router writes for
// routes that are not prerendered; it has no route meta, hence no <title> until hydration. That is
// a known gap reported to the Live shell owners, so the shell is left out of this sample; every
// prerendered page is in it.
const shells = new Set([join(p.liveClient, "index.html"), join(p.liveClient, "__spa-fallback.html")]);
const out = [...sample(p.quietDist), ...sample(p.liveClient).filter((f) => !shells.has(f))];
console.log(out.map((f) => relative(REPO, f)).join("\n"));
