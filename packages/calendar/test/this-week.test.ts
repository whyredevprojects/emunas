/**
 * thisWeek() / nearestOccasion() on fixed dates. Expectations are worked out by hand from the
 * calendar rules (noted per case), not read back from the table.
 */
import { describe, expect, it } from "vitest";
import { calendar, hebrewDate, nearestOccasion, occasionWindows, thisWeek, toIsoDay, type ThisWeek } from "../src/index.ts";

function week(date: string, israel = false): ThisWeek {
  const w = thisWeek(date, { israel });
  if (!w) throw new Error(`no week for ${date}`);
  return w;
}

const keys = (w: ThisWeek) => w.upcomingOccasions.map((o) => o.key);
const active = (w: ThisWeek) => w.upcomingOccasions.filter((o) => o.active).map((o) => o.key);

describe("thisWeek on 10 fixed dates", () => {
  it("1. Rosh Hashanah 5787 (Shabbos 2026-09-12): no parsha that Shabbos; the week is Haazinu's", () => {
    // 1 Tishrei 5787 is Shabbos 12 Sept 2026; Haazinu is read on Shabbos Shuvah, 8 Tishrei.
    const w = week("2026-09-12");
    expect(w.hebrewDate).toMatchObject({ year: 5787, month: 7, monthName: "Tishrei", day: 1, leapYear: true });
    expect(w.shabbos).toMatchObject({ date: "2026-09-12", parshaKey: null });
    expect(w.parshaKey).toBe("haazinu");
    expect(w.parshaDate).toBe("2026-09-19");
    expect(active(w)).toEqual(expect.arrayContaining(["rosh-hashanah", "aseres-yemei-teshuvah"]));
    expect(keys(w)).toEqual(expect.arrayContaining(["shabbos-shuvah", "yom-kippur", "sukkos"]));
    expect(nearestOccasion("2026-09-12")?.key).toBe("rosh-hashanah");
  });

  it("2. an ordinary week in Kislev 5787 (Sunday 2026-11-15): Vayeitzei", () => {
    // 5787 is a full leap year (385 days): Cheshvan has 30 days, so 1 Kislev = 11 Nov, 15 Nov = 5 Kislev.
    // Shabbosos after Shemini Atzeres (3 Oct): Bereishis 10 Oct, Noach, Lech Lecha, Vayeira,
    // Chayei Sarah, Toldos 14 Nov, Vayeitzei 21 Nov.
    const w = week("2026-11-15");
    expect(w.hebrewDate).toMatchObject({ year: 5787, month: 9, day: 5, monthNameHe: "כסלו" });
    expect(w.shabbos.date).toBe("2026-11-21");
    expect(w.parshaKey).toBe("vayeitzei");
    expect(w.parshaKeys).toEqual(["vayeitzei"]);
    expect(active(w)).toEqual(["kislev"]);
    expect(nearestOccasion("2026-11-15")?.key).toBe("kislev");
    // within the default 14 days nothing else starts (19 Kislev is 29 Nov = day 14: included)
    expect(keys(w)).toEqual(["kislev", "yud-tes-kislev"]);
  });

  it("3. Chanukah 5787 (Tuesday 2026-12-08): Chanukah active, Zos Chanukah and Shabbos Chanukah ahead", () => {
    // 25 Kislev = 11 Nov + 24 = 5 Dec (Shabbos); full Kislev, so the 8th day is 2 Teves = 12 Dec.
    const w = week("2026-12-08");
    expect(w.hebrewDate).toMatchObject({ month: 9, day: 28 });
    expect(w.shabbos.date).toBe("2026-12-12");
    expect(w.parshaKey).toBe("mikeitz");
    const chanukah = w.upcomingOccasions.find((o) => o.key === "chanukah");
    expect(chanukah).toMatchObject({ start: "2026-12-05", end: "2026-12-12", active: true, daysUntil: 0, length: 8 });
    expect(w.upcomingOccasions.find((o) => o.key === "zos-chanukah")).toMatchObject({ start: "2026-12-12", daysUntil: 4 });
    // two Shabbosos fall in this Chanukah (5 and 12 Dec); only the second is still ahead
    expect(w.upcomingOccasions.filter((o) => o.key === "shabbos-chanukah").map((o) => o.start)).toEqual(["2026-12-12"]);
    expect(occasionWindows("shabbos-chanukah").slice(0, 2)).toEqual([
      { start: "2026-12-05", end: "2026-12-05" },
      { start: "2026-12-12", end: "2026-12-12" },
    ]);
    expect(nearestOccasion("2026-12-08")?.key).toBe("chanukah");
  });

  it("4. leap year 5787, Adar I (Monday 2027-03-01): Vayakhel alone, Shekalim, Purim Katan past", () => {
    // Teves has 29 days in 5787: 1 Shevat = 9 Jan, 1 Adar I = 8 Feb, so 1 Mar = 22 Adar I.
    // Rosh Chodesh Adar II is Tue–Wed 9–10 Mar, so Shabbos Shekalim is 6 Mar. In a leap year
    // Vayakhel and Pekudei are read separately.
    const w = week("2027-03-01");
    expect(w.hebrewDate).toMatchObject({ year: 5787, month: 12, monthName: "Adar I", monthNameHe: "אדר א׳", day: 22, leapYear: true });
    expect(w.parshaKey).toBe("vayakhel");
    expect(w.parshaKeys).toEqual(["vayakhel"]);
    expect(keys(w)).toEqual(expect.arrayContaining(["parshas-shekalim", "adar"]));
    expect(keys(w)).not.toContain("purim-katan");
    expect(occasionWindows("purim-katan")[0]).toEqual({ start: "2027-02-21", end: "2027-02-21" });
    expect(week("2027-03-08").parshaKey).toBe("pekudei");
    expect(hebrewDate("2027-03-10")).toMatchObject({ month: 13, monthName: "Adar II", day: 1 });
  });

  it("5. combined parsha in a common year (Monday 2028-03-20): Vayakhel-Pekudei, Shabbos HaChodesh", () => {
    // 5788 is a common year: Vayakhel-Pekudei is combined. 15 Nisan 5788 = Tue 11 Apr 2028, so
    // 1 Nisan = Tue 28 Mar and the Shabbos before it (25 Mar) is Shabbos HaChodesh.
    const w = week("2028-03-20");
    expect(w.hebrewDate).toMatchObject({ year: 5788, month: 12, monthName: "Adar", leapYear: false });
    expect(w.shabbos).toMatchObject({ date: "2028-03-25", parshaKey: "vayakhel-pekudei" });
    expect(w.parshaKeys).toEqual(["vayakhel-pekudei", "vayakhel", "pekudei"]);
    expect(w.upcomingOccasions.find((o) => o.key === "parshas-hachodesh")).toMatchObject({ start: "2028-03-25" });
  });

  it("6. Purim in a common year (Sunday 2028-03-12): Purim, then Parah / Ki Sisa", () => {
    // 1 Nisan 5788 = 28 Mar, Adar has 29 days: 1 Adar = 28 Feb, 14 Adar = Sun 12 Mar.
    const w = week("2028-03-12");
    expect(w.hebrewDate).toMatchObject({ month: 12, monthName: "Adar", day: 14 });
    expect(active(w)).toEqual(expect.arrayContaining(["purim", "adar"]));
    expect(nearestOccasion("2028-03-12")?.key).toBe("purim");
    expect(w.parshaKey).toBe("ki-sisa");
    expect(w.upcomingOccasions.find((o) => o.key === "shushan-purim")).toMatchObject({ start: "2028-03-13", daysUntil: 1 });
    expect(w.upcomingOccasions.find((o) => o.key === "parshas-parah")).toMatchObject({ start: "2028-03-18" });
  });

  it("7. Lag BaOmer 5787 (Tuesday 2027-05-25)", () => {
    // 15 Nisan 5787 = Thu 22 Apr 2027; the 33rd day of the Omer is 23 Apr + 32 = 25 May = 18 Iyar.
    const w = week("2027-05-25");
    expect(w.hebrewDate).toMatchObject({ month: 2, monthName: "Iyyar", day: 18 });
    expect(active(w)).toEqual(expect.arrayContaining(["lag-baomer", "sefirah", "iyar"]));
    expect(nearestOccasion("2027-05-25")?.key).toBe("lag-baomer");
    // four days before, Iyar itself is in progress; skipping month-long windows finds Lag BaOmer
    expect(nearestOccasion("2027-05-21")?.key).toBe("iyar");
    expect(nearestOccasion("2027-05-21", { maxLength: 8 })).toMatchObject({ key: "lag-baomer", active: false, daysUntil: 4 });
    expect(w.parshaKey).toBe("bechukosai"); // leap year: Behar and Bechukosai separate
  });

  it("8. Israel and diaspora diverge after Shavuos on Friday (Thursday 2027-06-10)", () => {
    // 1 Sivan 5787 = 6 Jun, so Shavuos is Fri–Shabbos 11–12 Jun in the diaspora and Fri 11 Jun in
    // Israel, where Nasso is read on 12 Jun. The diaspora reads Nasso a week later.
    const diaspora = week("2027-06-10");
    const israel = week("2027-06-10", true);
    expect(diaspora.shabbos).toMatchObject({ date: "2027-06-12", parshaKey: null });
    expect(diaspora.parshaKey).toBe("nasso");
    expect(diaspora.parshaDate).toBe("2027-06-19");
    expect(israel.shabbos).toMatchObject({ date: "2027-06-12", parshaKey: "nasso" });
    expect(israel.parshaDate).toBe("2027-06-12");
    expect(diaspora.upcomingOccasions.find((o) => o.key === "shavuos")).toMatchObject({ start: "2027-06-11", end: "2027-06-12" });
    expect(israel.upcomingOccasions.find((o) => o.key === "shavuos")).toMatchObject({ start: "2027-06-11", end: "2027-06-11" });
    expect(week("2027-06-14").parshaKey).toBe("nasso");
    expect(week("2027-06-14", true).parshaKey).toBe("behaaloscha");
  });

  it("9. the diaspora catches up with Chukas-Balak (Wednesday 2027-07-14)", () => {
    const diaspora = week("2027-07-14");
    const israel = week("2027-07-14", true);
    expect(diaspora.parshaKeys).toEqual(["chukas-balak", "chukas", "balak"]);
    expect(israel.parshaKeys).toEqual(["balak"]);
    expect(diaspora.shabbos.date).toBe("2027-07-17");
    // and the following week they agree again
    expect(week("2027-07-21").parshaKey).toBe(week("2027-07-21", true).parshaKey);
  });

  it("10. Acharon shel Pesach on Shabbos (Shabbos 2029-04-07): Israel reads Shemini a week early", () => {
    // 15 Nisan 5789 = Shabbos 31 Mar 2029, so 22 Nisan (diaspora 8th day) is Shabbos 7 Apr.
    const diaspora = week("2029-04-07");
    const israel = week("2029-04-07", true);
    expect(diaspora.hebrewDate).toMatchObject({ year: 5789, month: 1, monthName: "Nisan", day: 22 });
    expect(diaspora.shabbos).toMatchObject({ date: "2029-04-07", parshaKey: null });
    expect(diaspora.parshaKey).toBe("shemini");
    expect(diaspora.parshaDate).toBe("2029-04-14");
    expect(israel.parshaKey).toBe("shemini");
    expect(israel.parshaDate).toBe("2029-04-07");
    expect(active(diaspora)).toEqual(expect.arrayContaining(["pesach", "shevii-shel-pesach"]));
    expect(active(israel)).not.toContain("pesach");
    expect(nearestOccasion("2029-04-07")?.key).toBe("shevii-shel-pesach");
  });
});

describe("other rules", () => {
  it("Tishah B'Av on Shabbos moves to Sunday, and the Nine Days end with it", () => {
    // 9 Av 5789 falls on Shabbos 21 Jul 2029 (15 Nisan was Shabbos; 9 Av is always the weekday of 15 Nisan).
    expect(hebrewDate("2029-07-21")).toMatchObject({ month: 5, day: 9 });
    const w = week("2029-07-19");
    expect(w.upcomingOccasions.find((o) => o.key === "tishah-beav")).toMatchObject({ start: "2029-07-22", end: "2029-07-22" });
    expect(w.upcomingOccasions.find((o) => o.key === "nine-days")).toMatchObject({ end: "2029-07-22" });
    expect(w.upcomingOccasions.find((o) => o.key === "shabbos-chazon")).toMatchObject({ start: "2029-07-21" });
  });

  it("accepts Date objects as the local calendar day", () => {
    expect(toIsoDay(new Date(2026, 10, 15, 23, 59))).toBe("2026-11-15");
    expect(thisWeek(new Date(2026, 10, 15, 8, 0))?.parshaKey).toBe("vayeitzei");
  });

  it("rejects malformed strings and returns null outside 5787–5800", () => {
    expect(() => thisWeek("2026-02-30")).toThrow(RangeError);
    expect(() => thisWeek("15/11/2026")).toThrow(RangeError);
    expect(thisWeek("2026-09-11")).toBeNull();
    expect(thisWeek("2040-09-08")).toBeNull();
    expect(nearestOccasion("2000-01-01")).toBeNull();
    expect(calendar.range).toEqual({ start: "2026-09-12", end: "2040-09-07" });
    expect(thisWeek("2040-09-07")).not.toBeNull();
  });

  it("nearestOccasion can skip long seasons", () => {
    // 2 May 2027 = 25 Nisan: Nisan (30 days) and Sefirah (49) are in progress; the shortest wins.
    expect(nearestOccasion("2027-05-02")?.key).toBe("nisan");
    expect(nearestOccasion("2027-05-02", { maxLength: 31 })?.key).toBe("nisan");
    expect(nearestOccasion("2027-05-02", { maxLength: 8 })?.key).toBe("lag-baomer");
  });

  it("lookaheadDays widens or narrows the window", () => {
    expect(keys(week("2026-11-15", false))).not.toContain("chanukah");
    expect(thisWeek("2026-11-15", { lookaheadDays: 30 })?.upcomingOccasions.map((o) => o.key)).toContain("chanukah");
    expect(thisWeek("2026-11-15", { lookaheadDays: 0 })?.upcomingOccasions.map((o) => o.key)).toEqual(["kislev"]);
  });
});
