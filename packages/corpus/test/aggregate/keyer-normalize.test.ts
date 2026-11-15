import { createKeyer } from "@emunas/normalize";
import { describe, expect, it } from "vitest";
import { projectCorpus } from "../../src/build/build.ts";
import type { KeyKind } from "../../src/build/keyer.ts";
import { createNormalizeKeyer, normalizeKey, normalizeSourceHash } from "../../src/keyer-normalize.ts";
import { MINI_DATA, MINI_POLICY } from "../helpers.ts";

describe("normalize Keyer adapter", () => {
  it("agrees with normalize's own createKeyer() on keys and on what is unmapped", () => {
    const samples: [KeyKind, string][] = [
      ["parsha", "נח"],
      ["parsha", "פרשת לך לך"],
      ["parsha", "nonsense"],
      ["zman", 'ל"ג בעומר'],
      ["zman", "ל”ג בעומר"],
      ["zman", "סעודת זאת חנוכה"],
      ["zman", "יום המיוחס"],
      ["zman", "nonsense"],
      ["work", "Rashi on Bereishis"],
      ["work", "The Ramban"],
      ["work", "Some Unknown Sefer"],
      ["person", "Dovid HaMelech"],
      ["person", "David HaMelech"],
      ["person", "Reb Nobody Special"],
      ["concept", "מסירות נפש"],
    ];
    const ref = createKeyer();
    for (const [kind, raw] of samples) {
      const r = normalizeKey(kind, raw);
      expect(r.key, `${kind}:${raw}`).toBe(ref[kind](raw));
    }
    const unmapped = new Set(ref.unmapped().map((u) => `${u.kind}:${u.raw}`));
    for (const [kind, raw] of samples) {
      expect(normalizeKey(kind, raw).mapped, `${kind}:${raw}`).toBe(!unmapped.has(`${kind}:${raw}`));
    }
    expect(unmapped).toEqual(
      new Set(["parsha:nonsense", "zman:nonsense", "work:Some Unknown Sefer", "person:Reb Nobody Special"]),
    );
  });

  it("folds variants to one key and keeps parsha and zman apart", () => {
    expect(normalizeKey("zman", 'ל"ג בעומר').key).toBe(normalizeKey("zman", "ל”ג בעומר").key);
    expect(normalizeKey("person", "Dovid HaMelech").key).toBe(normalizeKey("person", "David HaMelech").key);
    expect(normalizeKey("zman", "סעודת זאת חנוכה").key).toBe("zos-chanukah");
    expect(normalizeKey("zman", "יום המיוחס")).toEqual({ key: "other", mapped: true });
  });

  it("has a stable id and a version that tracks normalize's source", () => {
    const k = createNormalizeKeyer();
    expect(k.id).toBe("emunas-normalize");
    expect(k.version).toBe(normalizeSourceHash());
    expect(createNormalizeKeyer()).toBe(k);
  });

  it("changes shiur revs relative to the identity keyer (keys feed fingerprints)", () => {
    const a = projectCorpus({ dataDir: MINI_DATA, policyDir: MINI_POLICY });
    const b = projectCorpus({ dataDir: MINI_DATA, policyDir: MINI_POLICY, keyer: createNormalizeKeyer() });
    expect(a.shiurim[0]!.rev).not.toBe(b.shiurim[0]!.rev);
    const noachA = a.shiurim.find((s) => s.id === "en-parsha-en-nch-01")!;
    const noachB = b.shiurim.find((s) => s.id === "en-parsha-en-nch-01")!;
    expect(noachA.parsha!.key).not.toBe("noach");
    expect(noachB.parsha!.key).toBe("noach");
  });
});
