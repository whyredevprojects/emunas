import { describe, expect, it } from "vitest";
import {
  OCCASIONS,
  PARSHIYOS,
  PEOPLE,
  WORKS,
  WORK_GROUPS,
  conceptKey,
  createKeyer,
  isKey,
  lookupConcept,
  lookupParsha,
  lookupPerson,
  lookupWork,
  lookupZman,
  parshaKey,
  personKey,
  slugify,
  workKey,
  zmanKey,
} from "../src/index.ts";
import { aliasConflicts } from "../src/alias-index.ts";
import { warmOccasionIndexes } from "../src/occasion.ts";
import { warmConceptIndex, warmPeopleIndex } from "../src/person.ts";
import { warmWorkIndex } from "../src/work.ts";

describe("slugify", () => {
  it("makes ASCII keys from Latin names", () => {
    expect(slugify("the Ba'al Shem Tov")).toBe("the-baal-shem-tov");
    expect(slugify("Rabbeinu Bachya")).toBe("rabbeinu-bachya");
  });

  it("transliterates Hebrew and adds a disambiguating hash", () => {
    const k = slugify("עקבתא דמשיחא");
    expect(k).toMatch(/^ekbsa-dmshycha-[0-9a-f]{6}$/);
    expect(slugify("עֲקְבְתָא דמשיחא")).toBe(k); // nikud does not change the key
    expect(slugify("שבת")).not.toBe(slugify("סבת"));
  });

  it("is total and deterministic", () => {
    expect(slugify("")).toBe("unknown");
    expect(slugify("!!!")).toBe("unknown");
    expect(slugify("Δελτα")).toMatch(/^x-[0-9a-f]{6}$/);
    expect(slugify("x".repeat(200)).length).toBeLessThanOrEqual(60 + 7);
    for (const s of ["a", "Foo Bar", "חנוכה", "ḥesed"]) expect(isKey(slugify(s))).toBe(true);
  });
});

describe("tables", () => {
  it("have no alias conflicts", () => {
    warmOccasionIndexes();
    warmWorkIndex();
    warmPeopleIndex();
    warmConceptIndex();
    expect(aliasConflicts()).toEqual([]);
  });

  it("have unique, well-formed keys", () => {
    const tables: readonly (readonly { key: string }[])[] = [PARSHIYOS, OCCASIONS, WORKS, PEOPLE];
    for (const rows of tables) {
      const keys = rows.map((r) => r.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const k of keys) expect(isKey(k), k).toBe(true);
    }
  });

  it("parsha table has 54 sedros plus 7 combined, in order", () => {
    expect(PARSHIYOS.filter((p) => !p.parts).length).toBe(54);
    expect(PARSHIYOS.filter((p) => p.parts).length).toBe(7);
    const orders = PARSHIYOS.map((p) => p.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    for (const p of PARSHIYOS) {
      expect(p.he.length).toBeGreaterThan(0);
      expect(p.hebcal.length).toBeGreaterThan(0);
      for (const part of p.parts ?? []) expect(PARSHIYOS.some((x) => x.key === part)).toBe(true);
    }
  });

  it("occasion table starts at Elul and every occasion has a window", () => {
    expect(OCCASIONS[0]?.key).toBe("elul");
    for (const o of OCCASIONS) expect(o.window).toBeDefined();
  });

  it("every work has a valid group and a finite order; genre works are flagged", () => {
    for (const w of WORKS) {
      expect(WORK_GROUPS).toContain(w.group);
      expect(Number.isFinite(w.order)).toBe(true);
      expect(w.he.length, w.key).toBeGreaterThan(0);
      expect(w.yi.length, w.key).toBeGreaterThan(0);
    }
    expect(lookupWork("Midrash").work?.genre).toBe(true);
    expect(lookupWork("Gemara").work?.genre).toBe(true);
    expect(lookupWork("Bnei Yissaschar").work?.genre).toBe(false);
  });
});

describe("occasion keys", () => {
  it("maps zman spellings and sub-headings", () => {
    expect(zmanKey('יו"כ')).toBe("yom-kippur");
    expect(zmanKey("יו”כ")).toBe("yom-kippur");
    expect(zmanKey("יום הכיפורים")).toBe("yom-kippur");
    expect(zmanKey('שובבי"ם')).toBe(zmanKey("שובבים"));
    expect(lookupZman("סעודת ל\"ג בעומר")).toMatchObject({ key: "lag-baomer", sub: "seudah", status: "mapped" });
    expect(lookupZman("סעודת שושן פורים")).toMatchObject({ key: "shushan-purim", sub: "seudah" });
    expect(lookupZman("חודש טבת")).toMatchObject({ key: "teves" });
    expect(lookupZman("פורים For Children")).toMatchObject({ key: "purim", audience: "children" });
    expect(lookupZman('מהר"ל גבורת ה\'')).toMatchObject({ key: "other", status: "other" });
  });

  it("maps parsha spellings including combined parshiyos and audience suffixes", () => {
    expect(parshaKey("בהר-בחקתי")).toBe("behar-bechukosai");
    expect(parshaKey("בהר בחקותי")).toBe("behar-bechukosai");
    expect(parshaKey("כי תבא")).toBe("ki-savo");
    expect(parshaKey("פינחס")).toBe(parshaKey("פנחס"));
    expect(lookupParsha("שלח קינדער")).toMatchObject({ key: "shelach", audience: "children" });
    expect(lookupParsha("שמיני For Children")).toMatchObject({ key: "shemini", audience: "children" });
    expect(lookupParsha("פרשת נח").key).toBe("noach");
    expect(lookupParsha("Lech-Lecha").key).toBe("lech-lecha");
  });

  it("unmapped occasions go to the other bucket and never throw", () => {
    expect(lookupZman("something new")).toMatchObject({ key: "other", status: "unmapped" });
    expect(lookupParsha("not a parsha")).toMatchObject({ key: "other", status: "unmapped" });
    expect(lookupZman(null).key).toBe("other");
    expect(lookupParsha(undefined).key).toBe("other");
    expect(lookupZman("").key).toBe("other");
  });
});

describe("people keys", () => {
  it("merges the obvious duplicates", () => {
    expect(personKey("Dovid HaMelech")).toBe(personKey("David HaMelech"));
    expect(personKey("Dovid Hamelech")).toBe("dovid-hamelech");
    expect(personKey("King David")).toBe("dovid-hamelech");
    expect(personKey("Ramban")).toBe(personKey("the Ramban"));
    expect(personKey("the Rambam")).toBe(personKey("Rambam"));
    expect(personKey("Yitzchak")).toBe(personKey("Yitzchak Avinu"));
    expect(personKey("the Ba'al Shem Tov")).toBe(personKey("the Baal Shem Tov"));
    expect(personKey("Rivka")).toBe(personKey("Rivkah"));
    expect(personKey("Bilam")).toBe(personKey("Bilaam"));
    expect(personKey("R' Chaim Vital")).toBe(personKey("Rav Chaim Vital"));
    expect(personKey("the Ramchal (Rabbi Moshe Chaim Luzzatto)")).toBe(personKey("Ramchal"));
  });

  it("keeps different people apart", () => {
    expect(personKey("Shimon HaTzaddik")).not.toBe(personKey("Shimon"));
    expect(personKey("Shmuel (Amora)")).not.toBe(personKey("Shmuel HaNavi"));
    expect(personKey("the Rashash (Rabbi Shalom Sharabi)")).not.toBe(personKey("the Rashash (Rabbi Shmuel Strashun)"));
    expect(personKey("Rabbi Yehoshua")).not.toBe(personKey("Yehoshua"));
  });

  it("unmapped names get their own deterministic key", () => {
    const m = lookupPerson("the Zlotchover Maggid");
    expect(m).toMatchObject({ status: "unmapped", key: "zlotchover-maggid" });
    expect(lookupPerson("Zlotchover Maggid").key).toBe(m.key);
    expect(lookupPerson(null).key).toBe("unknown");
  });
});

describe("work keys", () => {
  it("unmapped works get a deterministic slug", () => {
    expect(lookupWork("Sefer Something Rare")).toMatchObject({ status: "unmapped", key: "sefer-something-rare" });
    expect(workKey("the Sefer Something Rare")).toBe("sefer-something-rare");
    expect(workKey(null)).toBe("unknown");
    expect(workKey("")).toBe("unknown");
  });
});

describe("concept keys", () => {
  it("merges spelling variants and flags the stop-list", () => {
    expect(conceptKey("מידת הדין")).toBe(conceptKey("מדת הדין"));
    expect(lookupConcept("מידת הדין")).toMatchObject({ he: "מדת הדין", merged: true });
    expect(conceptKey("מסירת נפש")).toBe(conceptKey("מסירות נפש"));
    expect(lookupConcept("רבונו של עולם").stop).toBe(true);
    expect(lookupConcept("אמונה").stop).toBe(false);
  });

  it("nikud and quote style do not change the key", () => {
    expect(conceptKey("אֱמוּנָה")).toBe(conceptKey("אמונה"));
    expect(conceptKey('שם הוי"ה')).toBe(conceptKey("שם הוי״ה"));
    expect(isKey(conceptKey("אמונה"))).toBe(true);
  });
});

describe("createKeyer", () => {
  it("records unmapped values with counts and never throws", () => {
    const k = createKeyer();
    expect(k.parsha("נח")).toBe("noach");
    expect(k.zman("brand new zman")).toBe("other");
    k.zman("brand new zman");
    expect(k.work("Gemara Shabbos")).toBe("bavli-shabbos");
    expect(k.work("Unknown Sefer")).toBe("unknown-sefer");
    expect(k.person("Rashi")).toBe("rashi");
    expect(k.person("Someone New")).toBe("someone-new");
    expect(isKey(k.concept("אמונה"))).toBe(true);
    expect(k.zman('מהר"ל גבורת ה\'')).toBe("other"); // explicit other: not reported
    expect(k.unmapped()).toEqual([
      { kind: "person", raw: "Someone New", key: "someone-new", count: 1 },
      { kind: "work", raw: "Unknown Sefer", key: "unknown-sefer", count: 1 },
      { kind: "zman", raw: "brand new zman", key: "other", count: 2 },
    ]);
  });
});
