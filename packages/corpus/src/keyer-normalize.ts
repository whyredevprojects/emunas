/**
 * The corpus `Keyer` backed by `@emunas/normalize` (integration-plan W2.1).
 *
 * normalize's own `createKeyer()` returns plain strings per kind ({parsha, zman, work, person,
 * concept}) and collects unmapped values itself. The corpus projector wants one `key(kind, raw)`
 * call that says whether the value was mapped, so it can report the shiurim that use each unmapped
 * value. This adapter calls normalize's lookups directly and translates their status:
 *
 * - parsha / zman: `mapped` unless normalize says "unmapped". Zman strings normalize deliberately
 *   files under the "other" bucket (one-off events) count as mapped: a person decided that.
 * - work / person: `mapped` when an alias table row matched; otherwise the key is normalize's
 *   deterministic slug and the value is reported.
 * - concept: always mapped. Every Hebrew term is its own concept unless an alias merges it, so
 *   there is nothing to report (normalize's `createKeyer` makes the same call).
 *
 * `version` is a hash of normalize's source (tables and lookup code), so any table edit changes
 * every shiur fingerprint and the affected shiurim are re-emitted with their new keys.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { lookupConcept, lookupParsha, lookupPerson, lookupWork, lookupZman } from "@emunas/normalize";
import type { KeyKind, KeyResult, Keyer } from "./build/keyer.ts";

function listTs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listTs(p, out);
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

/** Hash of @emunas/normalize's src/ (paths relative to the package, plus contents). */
export function normalizeSourceHash(): string {
  const pkgJson = createRequire(import.meta.url).resolve("@emunas/normalize/package.json");
  const root = dirname(pkgJson);
  const h = createHash("sha256");
  for (const f of listTs(join(root, "src"))) {
    h.update(`${f.slice(root.length)}\u0000${readFileSync(f, "utf8")}\u0000`);
  }
  return h.digest("hex").slice(0, 16);
}

/** Pure mapping of one value (exported for tests). */
export function normalizeKey(kind: KeyKind, raw: string): KeyResult {
  switch (kind) {
    case "parsha": {
      const m = lookupParsha(raw);
      return { key: m.key, mapped: m.status !== "unmapped" };
    }
    case "zman": {
      const m = lookupZman(raw);
      return { key: m.key, mapped: m.status !== "unmapped" };
    }
    case "work": {
      const m = lookupWork(raw);
      return { key: m.key, mapped: m.status === "mapped" };
    }
    case "person": {
      const m = lookupPerson(raw);
      return { key: m.key, mapped: m.status === "mapped" };
    }
    case "concept":
      return { key: lookupConcept(raw).key, mapped: true };
  }
}

let cached: Keyer | null = null;

/** The normalize-backed Keyer. Created once per process (the version hash reads files). */
export function createNormalizeKeyer(): Keyer {
  cached ??= { id: "emunas-normalize", version: normalizeSourceHash(), key: normalizeKey };
  return cached;
}
