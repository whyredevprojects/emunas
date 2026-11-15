/**
 * Stable key functions and a reporting Keyer for the corpus build.
 *
 * Every function here is total: it never throws, and an unmapped value still gets a key
 * (occasions → the "other" bucket; works, people, concepts → a deterministic slug of the value).
 * `createKeyer()` additionally records each unmapped value once, with a count, so the build can
 * write them to build-report.json (integration-plan C10) without failing.
 */
import { lookupParsha, lookupZman } from "./occasion.ts";
import { lookupConcept, lookupPerson } from "./person.ts";
import { lookupWork } from "./work.ts";

export function parshaKey(raw: string | null | undefined): string {
  return lookupParsha(raw).key;
}

export function zmanKey(raw: string | null | undefined): string {
  return lookupZman(raw).key;
}

export function workKey(raw: string | null | undefined): string {
  return lookupWork(raw).key;
}

export function personKey(raw: string | null | undefined): string {
  return lookupPerson(raw).key;
}

export function conceptKey(raw: string | null | undefined): string {
  return lookupConcept(raw).key;
}

export type KeyKind = "parsha" | "zman" | "work" | "person" | "concept";

export interface UnmappedEntry {
  kind: KeyKind;
  raw: string;
  key: string;
  count: number;
}

/** The interface @emunas/corpus injects (W1.2 `Keyer`; wired by W2.1). */
export interface NormalizeKeyer {
  parsha(raw: string): string;
  zman(raw: string): string;
  work(raw: string): string;
  person(raw: string): string;
  concept(raw: string): string;
}

export interface ReportingKeyer extends NormalizeKeyer {
  /** unmapped values seen so far, sorted by kind then raw string */
  unmapped(): UnmappedEntry[];
}

/**
 * A Keyer that records unmapped values. Concepts are never "unmapped" (every Hebrew term is its
 * own concept unless an alias merges it), so they are not reported.
 */
export function createKeyer(): ReportingKeyer {
  const seen = new Map<string, UnmappedEntry>();
  const note = (kind: KeyKind, raw: string, key: string): void => {
    const id = `${kind}\u0000${raw}`;
    const e = seen.get(id);
    if (e) e.count += 1;
    else seen.set(id, { kind, raw, key, count: 1 });
  };
  return {
    parsha(raw) {
      const m = lookupParsha(raw);
      if (m.status === "unmapped") note("parsha", raw, m.key);
      return m.key;
    },
    zman(raw) {
      const m = lookupZman(raw);
      if (m.status === "unmapped") note("zman", raw, m.key);
      return m.key;
    },
    work(raw) {
      const m = lookupWork(raw);
      if (m.status === "unmapped") note("work", raw, m.key);
      return m.key;
    },
    person(raw) {
      const m = lookupPerson(raw);
      if (m.status === "unmapped") note("person", raw, m.key);
      return m.key;
    },
    concept(raw) {
      return lookupConcept(raw).key;
    },
    unmapped() {
      return [...seen.values()].sort((a, b) =>
        a.kind !== b.kind ? (a.kind < b.kind ? -1 : 1) : a.raw < b.raw ? -1 : a.raw > b.raw ? 1 : 0,
      );
    },
  };
}
