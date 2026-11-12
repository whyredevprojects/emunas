// Check that a P3 cleaned transcript keeps the line structure of its input exactly.
//
//   npx tsx scripts/check-cleaned.ts out/pilot/<shiurId>/input.cleaned.txt [...]
//
// Compares against input.txt in the same directory: same line count, header / "## RECORDING" / blank
// lines identical, every "[recordingId:idx|mm:ss] " prefix identical and in order. Reports how many
// segment lines changed. Exit code 1 on any structural mismatch.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SEG = /^(\[[^\]|]+:\d+\|\d+:\d\d\] ?)(.*)$/;

function check(cleanedPath: string): boolean {
  const inputPath = join(dirname(cleanedPath), "input.txt");
  if (!existsSync(inputPath)) return console.log(`${cleanedPath}: FAIL no ${inputPath}`), false;
  const a = readFileSync(inputPath, "utf8").replace(/\n$/, "").split("\n");
  const b = readFileSync(cleanedPath, "utf8").replace(/\n$/, "").split("\n");
  const errs: string[] = [];
  if (a.length !== b.length) errs.push(`${b.length} lines, input has ${a.length}`);
  let segs = 0;
  let changed = 0;
  for (let i = 0; i < Math.min(a.length, b.length) && errs.length < 10; i++) {
    const ma = SEG.exec(a[i]!);
    if (!ma) {
      if (a[i] !== b[i]) errs.push(`line ${i + 1}: non-segment line changed: ${JSON.stringify(b[i]!.slice(0, 80))}`);
      continue;
    }
    segs++;
    const mb = SEG.exec(b[i]!);
    if (!mb || mb[1]!.trim() !== ma[1]!.trim()) {
      errs.push(`line ${i + 1}: expected prefix ${ma[1]!.trim()}, got ${JSON.stringify(b[i]!.slice(0, 60))}`);
      continue;
    }
    if (mb[2]!.trim() !== ma[2]!.trim()) changed++;
  }
  const status = errs.length ? "FAIL" : "OK";
  console.log(`${cleanedPath}: ${status} (${segs} segment lines, ${changed} changed${segs ? `, ${((100 * changed) / segs).toFixed(0)}%` : ""})`);
  for (const e of errs) console.log(`  ERROR ${e}`);
  return !errs.length;
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: npx tsx scripts/check-cleaned.ts <input.cleaned.txt...>");
  process.exit(2);
}
const ok = files.map(check).every(Boolean);
process.exit(ok ? 0 : 1);
