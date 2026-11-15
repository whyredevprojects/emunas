/**
 * Dev-only: print how today's seed values map, for reviewers.
 *   npm run inspect -w @emunas/normalize -- [zman|parsha|works|people|concepts|refs|conflicts]
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aliasConflicts } from "../src/alias-index.ts";
import { lookupConcept, lookupParsha, lookupPerson, lookupWork, lookupZman, parseSefariaRef } from "../src/index.ts";
import { warmOccasionIndexes } from "../src/occasion.ts";
import { warmConceptIndex, warmPeopleIndex } from "../src/person.ts";
import { warmWorkIndex } from "../src/work.ts";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
interface SeedFile {
  values: { value: string; shiurim: number; count: number }[];
}
const load = (n: string): SeedFile["values"] => (JSON.parse(readFileSync(join(pkgDir, "seed", n), "utf8")) as SeedFile).values;

const what = process.argv[2] ?? "zman";
switch (what) {
  case "zman":
    for (const v of load("zman.json")) {
      const m = lookupZman(v.value);
      console.log(`${m.status.padEnd(8)} ${m.key.padEnd(24)} ${m.sub ?? ""} ${m.audience ?? ""}\t${v.value}`);
    }
    break;
  case "parsha":
    for (const v of load("parsha.json")) {
      const m = lookupParsha(v.value);
      console.log(`${m.status.padEnd(8)} ${m.key.padEnd(24)} ${m.audience ?? ""}\t${v.value}`);
    }
    break;
  case "works": {
    const min = Number(process.argv[3] ?? "2");
    for (const v of load("works.json").filter((x) => x.shiurim >= min)) {
      const m = lookupWork(v.value);
      console.log(`${m.status.padEnd(8)} ${(m.work?.group ?? "-").padEnd(10)} ${String(m.work?.order ?? "").padEnd(7)} ${m.key.padEnd(30)}\t${v.value}`);
    }
    break;
  }
  case "people": {
    const groups = new Map<string, string[]>();
    for (const v of load("people.json")) {
      const k = lookupPerson(v.value).key;
      groups.set(k, [...(groups.get(k) ?? []), `${v.value}:${v.shiurim}`]);
    }
    for (const [k, names] of [...groups.entries()].filter(([, n]) => n.length > 1).sort()) console.log(`${k}\t${names.join(" | ")}`);
    console.log(`distinct strings ${load("people.json").length}, keys ${groups.size}`);
    break;
  }
  case "concepts": {
    for (const v of load("concepts.json").filter((x) => x.shiurim >= 10)) {
      const m = lookupConcept(v.value);
      console.log(`${m.stop ? "STOP" : "    "} ${m.merged ? "M" : " "} ${m.key.padEnd(30)}\t${v.value}`);
    }
    break;
  }
  case "refs": {
    for (const v of load("sefaria-refs.json")) {
      const p = parseSefariaRef(v.value);
      console.log(p.ok ? `${p.corpus.padEnd(14)} ${p.workKey.padEnd(26)} [${p.sortKey.join(",")}]\t${v.value}` : `FAIL ${p.reason}\t${v.value}`);
    }
    break;
  }
  case "conflicts":
    warmOccasionIndexes();
    warmWorkIndex();
    warmPeopleIndex();
    warmConceptIndex();
    console.log(JSON.stringify(aliasConflicts(), null, 1));
    break;
  default:
    console.error(`unknown: ${what}`);
    process.exitCode = 1;
}
