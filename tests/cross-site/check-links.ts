/**
 * Cross-site link check (W5.1): every Quiet → Live link in Quiet's `dist/` must land on a Live route
 * with its data file, and every Live → Quiet link (canonical, "Printable page") in Live's prerendered
 * HTML must land on a built Quiet page (and anchor). Exit 1 on any finding.
 *
 *   npx tsx tests/cross-site/check-links.ts [--quiet <dist>] [--live <build/client>] [--corpus <dir>]
 *
 * Defaults and environment as in `sites.ts`. CI also runs it on a copy with a planted broken link
 * and requires it to fail.
 */
import { parseArgs } from "node:util";
import { missingOutputs, scanCrossLinks, sitePaths } from "./sites.ts";

const { values } = parseArgs({
  options: { quiet: { type: "string" }, live: { type: "string" }, corpus: { type: "string" } },
});
const p = sitePaths({
  ...process.env,
  ...(values.quiet ? { CROSS_SITE_QUIET_DIST: values.quiet } : {}),
  ...(values.live ? { CROSS_SITE_LIVE_CLIENT: values.live } : {}),
  ...(values.corpus ? { CROSS_SITE_CORPUS: values.corpus } : {}),
});
const missing = missingOutputs(p);
if (missing) {
  console.error(missing);
  process.exit(2);
}
const started = Date.now();
const { checked, findings } = scanCrossLinks(p);
for (const f of findings.slice(0, 50)) console.error(`${f.file}: ${f.url} — ${f.reason}`);
if (findings.length > 50) console.error(`… and ${findings.length - 50} more`);
console.log(`cross-site links: ${checked} checked, ${findings.length} broken (${Date.now() - started} ms)`);
process.exit(findings.length === 0 ? 0 : 1);
