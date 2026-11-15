/**
 * Coverage of today's corpus values (snapshot in seed/, refreshed with `npm run seed`).
 * integration-plan C10: this test, not the data build, is where a new spelling fails.
 */
import { describe, expect, it } from "vitest";
import {
  OCCASIONS,
  PARSHIYOS,
  isKey,
  lookupParsha,
  lookupPerson,
  lookupWork,
  lookupZman,
  parseSefariaRef,
} from "../src/index.ts";
import { seed } from "./seed.ts";

describe("parsha and zman coverage", () => {
  it("snapshot has today's distinct values (56 parsha, 62 zman)", () => {
    expect(seed.parsha.length).toBe(56);
    expect(seed.zman.length).toBe(62);
  });

  it("every catalog parsha string maps to a parsha key", () => {
    const unmapped = seed.parsha.filter((v) => lookupParsha(v.value).status !== "mapped").map((v) => v.value);
    expect(unmapped).toEqual([]);
  });

  it("every catalog zman string maps to an occasion or is explicitly 'other'", () => {
    const unmapped = seed.zman.filter((v) => lookupZman(v.value).status === "unmapped").map((v) => v.value);
    expect(unmapped).toEqual([]);
    const other = seed.zman.filter((v) => lookupZman(v.value).status === "other").map((v) => v.value);
    expect(other.length).toBe(3);
  });

  it("parsha keys and zman keys are disjoint and well-formed", () => {
    const p = new Set(PARSHIYOS.map((x) => x.key));
    const z = new Set(OCCASIONS.map((x) => x.key));
    expect([...p].filter((k) => z.has(k))).toEqual([]);
    expect(p.has("other")).toBe(false);
    expect(z.has("other")).toBe(false);
    for (const k of [...p, ...z]) expect(isKey(k), k).toBe(true);
    expect(p.size).toBe(PARSHIYOS.length);
    expect(z.size).toBe(OCCASIONS.length);
  });

  it("parsha and zman keys from today's data never collide across tables", () => {
    const pk = new Set(seed.parsha.map((v) => lookupParsha(v.value).key));
    const zk = new Set(seed.zman.map((v) => lookupZman(v.value).key));
    expect([...pk].filter((k) => zk.has(k))).toEqual([]);
  });
});

describe("works coverage", () => {
  const multi = seed.works.filter((v) => v.shiurim >= 2);

  it("snapshot has the works cited in ≥ 2 shiurim (398 today)", () => {
    expect(multi.length).toBeGreaterThanOrEqual(398);
  });

  it("every work in ≥ 2 shiurim maps to a table row with group and order", () => {
    const bad: string[] = [];
    for (const v of multi) {
      const m = lookupWork(v.value);
      if (m.status !== "mapped" || !m.work || !Number.isFinite(m.work.order)) bad.push(v.value);
    }
    expect(bad).toEqual([]);
  });

  it("every work string (any count) gets a well-formed key", () => {
    for (const v of seed.works) expect(isKey(lookupWork(v.value).key), v.value).toBe(true);
  });

  it("merges spelling variants of the same sefer", () => {
    const k = (s: string): string => lookupWork(s).key;
    expect(k("Ba'al HaTurim")).toBe(k("Baal HaTurim"));
    expect(k("Rabbeinu Bechaye")).toBe(k("Rabbeinu Bachya"));
    expect(k("Gemara Rosh Hashana")).toBe(k("Gemara Rosh Hashanah"));
    expect(k("Gemara Ta'anis")).toBe("bavli-taanis");
    expect(k("Rashi on Bereishis")).toBe("rashi");
    expect(k("Ramban on Shemos")).toBe("ramban");
    expect(k("Rambam, Hilchos Teshuvah")).toBe("mishneh-torah");
    expect(k("Shmuel II")).toBe(k("Shmuel I"));
    expect(k("Divrei Hayamim II")).toBe("divrei-hayamim");
    expect(k("Siddur of the Baal HaTanya")).toBe("siddur-baal-hatanya");
    expect(k("Mishnah Avos")).toBe("pirkei-avos");
    expect(k("Mishnah Berurah")).toBe("mishnah-berurah");
    expect(k("Shulchan Aruch Orach Chaim")).toBe("shulchan-aruch");
    expect(k("Siddur (Hashkiveinu)")).toBe("siddur");
    expect(k("Yerushalmi Megillah")).toBe("yerushalmi-megillah");
  });
});

describe("sefariaRef coverage", () => {
  it("every current sefariaRef parses (none needs classifying today)", () => {
    const failed = seed.refs.map((v) => parseSefariaRef(v.value)).filter((p) => !p.ok);
    expect(failed).toEqual([]);
  });

  it("every parsed ref has a well-formed work key and a sort key", () => {
    for (const v of seed.refs) {
      const p = parseSefariaRef(v.value);
      if (!p.ok) continue;
      expect(isKey(p.workKey), v.value).toBe(true);
      expect(p.sortKey.every((n) => Number.isFinite(n)), v.value).toBe(true);
    }
  });

  it("covers the 8,000+ mentions in the snapshot", () => {
    const total = seed.refs.reduce((a, v) => a + v.count, 0);
    expect(total).toBeGreaterThanOrEqual(8009);
  });
});

describe("people coverage", () => {
  it("every name gets a well-formed key", () => {
    for (const v of seed.people) expect(isKey(lookupPerson(v.value).key), v.value).toBe(true);
  });

  it("merging reduces the distinct people count noticeably", () => {
    const keys = new Set(seed.people.map((v) => lookupPerson(v.value).key));
    expect(keys.size).toBeLessThan(seed.people.length * 0.9);
  });
});
