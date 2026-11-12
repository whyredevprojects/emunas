// Make a blinded X/Y pair for the judge: copies two outputs with identifying fields stripped,
// randomizes order, and records the key in out/pilot/<id>/judge-<tag>.key.json.
// Usage: npx tsx scripts/blind-pair.ts <shiurId> <fileA> <fileB> <tag>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomInt } from "node:crypto";

const [id, a, b, tag] = process.argv.slice(2);
if (!id || !a || !b || !tag) throw new Error("usage: blind-pair <shiurId> <fileA> <fileB> <tag>");
const dir = join("out/pilot", id);
const strip = (f: string): string => {
  const o = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>;
  for (const k of ["model", "variant", "extractionVariant"]) delete o[k];
  return JSON.stringify(o, null, 2);
};
const swap = randomInt(2) === 1;
const [x, y] = swap ? [b, a] : [a, b];
writeFileSync(join(dir, `judge-${tag}-X.json`), strip(x));
writeFileSync(join(dir, `judge-${tag}-Y.json`), strip(y));
writeFileSync(join(dir, `judge-${tag}.key.json`), JSON.stringify({ X: x, Y: y }, null, 2));
console.log(`${id} ${tag}: X/Y written`);
