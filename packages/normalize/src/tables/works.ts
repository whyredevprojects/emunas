/**
 * Works table: alias → workKey, shelf group, order within the group, he/yi/en names, Sefaria
 * index title(s), ordering scheme for refs, and the `genre` flag for generic labels ("Midrash",
 * "Gemara") that are not shelved as one sefer.
 *
 * Tanach books, Mishnah, Bavli and Yerushalmi tractates are generated from `tanach.ts` and
 * `tractates.ts` (with the usual "Gemara X" / "Mishnah X" / "Yerushalmi X" aliases). Everything
 * else is the curated list below.
 *
 * Order within the Rishonim and Acharonim groups is approximately chronological (the number is
 * roughly the author's year of death or the year of first printing); within Midrash, the classic
 * order (Rabbah on the Torah, the Megillos, then the others). Aliases are matched on `foldBasic`
 * after stripping a leading "the" and a trailing parenthetical, so case, apostrophes, quote marks
 * and hyphens never need their own alias.
 *
 * reviewStatus "unreviewed": the first table a human reviewer is expected to correct.
 */
import { TANACH } from "./tanach.ts";
import { TRACTATES } from "./tractates.ts";

export const worksReviewStatus = "unreviewed" as const;

export const WORK_GROUPS = [
  "torah",
  "neviim",
  "kesuvim",
  "targum",
  "mishnah",
  "bavli",
  "yerushalmi",
  "midrash",
  "zohar",
  "rishonim",
  "acharonim",
  "tefillah",
  "other",
] as const;
export type WorkGroup = (typeof WORK_GROUPS)[number];

export const WORK_GROUP_LABELS: Readonly<Record<WorkGroup, { en: string; yi: string; he: string }>> = {
  torah: { en: "Torah", yi: "תורה", he: "תורה" },
  neviim: { en: "Nevi'im", yi: "נביאים", he: "נביאים" },
  kesuvim: { en: "Kesuvim", yi: "כתובים", he: "כתובים" },
  targum: { en: "Targum", yi: "תרגום", he: "תרגום" },
  mishnah: { en: "Mishnah", yi: "משנה", he: "משנה" },
  bavli: { en: "Talmud Bavli", yi: "תלמוד בבלי", he: "תלמוד בבלי" },
  yerushalmi: { en: "Talmud Yerushalmi", yi: "תלמוד ירושלמי", he: "תלמוד ירושלמי" },
  midrash: { en: "Midrash", yi: "מדרש", he: "מדרש" },
  zohar: { en: "Zohar and Kabbalah", yi: "זוהר און קבלה", he: "זוהר וקבלה" },
  rishonim: { en: "Rishonim", yi: "ראשונים", he: "ראשונים" },
  acharonim: { en: "Acharonim and Chassidus", yi: "אחרונים און חסידות", he: "אחרונים וחסידות" },
  tefillah: { en: "Tefillah and Piyut", yi: "תפילה און פיוט", he: "תפילה ופיוט" },
  other: { en: "Other", yi: "אנדערע", he: "שונות" },
};

/** How refs inside a work are ordered: chapter:verse, daf+amud, chapter/siman, or not at all. */
export type OrderingScheme = "tanach" | "shas" | "chapter" | "none";

export interface Work {
  key: string;
  group: WorkGroup;
  /** order within the group */
  order: number;
  he: string;
  yi: string;
  en: string;
  /** Sefaria index title(s); empty when there is none or it is not known */
  sefaria: readonly string[];
  scheme: OrderingScheme;
  /** a generic label ("Midrash", "Gemara"), not one sefer: not shelved */
  genre: boolean;
  aliases: readonly string[];
  note?: string;
}

interface Opts {
  sefaria?: string[];
  scheme?: OrderingScheme;
  genre?: boolean;
  yi?: string;
  note?: string;
}

type Row = [key: string, group: WorkGroup, order: number, en: string, he: string, aliases?: string[], opts?: Opts];

// prettier-ignore
const CURATED: Row[] = [
  // ---- Torah / Tanach generic ----
  ["chumash", "torah", 0, "Chumash", "חומש", ["Torah", "Chamisha Chumshei Torah"], { genre: true, scheme: "tanach" }],
  ["tanach", "kesuvim", 99, "Tanach", "תנ\"ך", ["Tanakh", "Nach"], { genre: true, scheme: "tanach" }],
  ["masorah", "other", 10, "Masorah", "מסורה", ["Masores", "Mesorah"]],
  // ---- Targum ----
  ["targum", "targum", 0, "Targum", "תרגום", [], { genre: true }],
  ["targum-onkelos", "targum", 1, "Targum Onkelos", "תרגום אונקלוס", ["Onkelos", "Targum Onkelos on Torah"], { sefaria: ["Onkelos Genesis", "Onkelos Exodus", "Onkelos Leviticus", "Onkelos Numbers", "Onkelos Deuteronomy"], scheme: "tanach" }],
  ["targum-yonasan", "targum", 2, "Targum Yonasan", "תרגום יונתן", ["Targum Yonasan ben Uziel", "Targum Yonatan", "Targum Jonathan", "Yonasan ben Uziel"], { scheme: "tanach" }],
  ["targum-sheni", "targum", 3, "Targum Sheni", "תרגום שני", ["Targum Sheni on Esther", "Targum on Megillas Esther", "Targum Sheni al Megillas Esther"], { scheme: "tanach" }],
  // ---- Mishnah / Talmud generic ----
  ["mishnah", "mishnah", 0, "Mishnah", "משנה", ["Mishna", "Mishnayos"], { genre: true }],
  ["gemara", "bavli", 0, "Gemara", "גמרא", ["Talmud", "Talmud Bavli", "Bavli", "Shas", "Gemora"], { genre: true }],
  ["yerushalmi", "yerushalmi", 0, "Yerushalmi", "ירושלמי", ["Talmud Yerushalmi", "Jerusalem Talmud"], { genre: true }],
  // ---- Midrash ----
  ["midrash", "midrash", 0, "Midrash", "מדרש", ["Medrash", "Chazal", "Midrashim"], { genre: true }],
  ["midrash-rabbah", "midrash", 1, "Midrash Rabbah", "מדרש רבה", [], { genre: true }],
  ["bereishis-rabbah", "midrash", 2, "Bereishis Rabbah", "בראשית רבה", ["Bereshit Rabbah", "Midrash Bereishis Rabbah", "Breishis Rabbah"], { sefaria: ["Bereshit Rabbah"], scheme: "chapter" }],
  ["shemos-rabbah", "midrash", 3, "Shemos Rabbah", "שמות רבה", ["Shemot Rabbah", "Midrash Shemos Rabbah"], { sefaria: ["Shemot Rabbah"], scheme: "chapter" }],
  ["vayikra-rabbah", "midrash", 4, "Vayikra Rabbah", "ויקרא רבה", ["Midrash Vayikra Rabbah"], { sefaria: ["Vayikra Rabbah"], scheme: "chapter" }],
  ["bamidbar-rabbah", "midrash", 5, "Bamidbar Rabbah", "במדבר רבה", ["Midrash Bamidbar Rabbah"], { sefaria: ["Bamidbar Rabbah"], scheme: "chapter" }],
  ["devarim-rabbah", "midrash", 6, "Devarim Rabbah", "דברים רבה", ["Midrash Devarim Rabbah"], { sefaria: ["Devarim Rabbah"], scheme: "chapter" }],
  ["shir-hashirim-rabbah", "midrash", 7, "Shir HaShirim Rabbah", "שיר השירים רבה", ["Midrash Shir HaShirim"], { sefaria: ["Shir HaShirim Rabbah"], scheme: "chapter" }],
  ["rus-rabbah", "midrash", 8, "Rus Rabbah", "רות רבה", ["Midrash Rus", "Ruth Rabbah", "Midrash Ruth"], { sefaria: ["Ruth Rabbah"], scheme: "chapter" }],
  ["eichah-rabbah", "midrash", 9, "Eichah Rabbah", "איכה רבה", ["Eicha Rabbah", "Midrash Eichah", "Midrash Eicha", "Eichah Rabbasi"], { sefaria: ["Eichah Rabbah"], scheme: "chapter" }],
  ["koheles-rabbah", "midrash", 10, "Koheles Rabbah", "קהלת רבה", ["Midrash Koheles"], { sefaria: ["Kohelet Rabbah"], scheme: "chapter" }],
  ["esther-rabbah", "midrash", 11, "Esther Rabbah", "אסתר רבה", ["Midrash Esther"], { sefaria: ["Esther Rabbah"], scheme: "chapter" }],
  ["midrash-tanchuma", "midrash", 20, "Midrash Tanchuma", "מדרש תנחומא", ["Tanchuma"], { sefaria: ["Midrash Tanchuma"] }],
  ["mechilta", "midrash", 21, "Mechilta", "מכילתא", ["Mekhilta", "Mechilta deRabbi Yishmael"]],
  ["sifra", "midrash", 22, "Sifra", "ספרא", ["Toras Kohanim"]],
  ["sifrei", "midrash", 23, "Sifrei", "ספרי", ["Sifrei Devarim", "Sifrei Bamidbar", "Sifre"]],
  ["pesikta", "midrash", 24, "Pesikta deRav Kahana", "פסיקתא דרב כהנא", ["Pesikta", "Pesikta d'Rav Kahana"]],
  ["pesikta-rabbasi", "midrash", 25, "Pesikta Rabbasi", "פסיקתא רבתי", ["Pesikta Rabbati"]],
  ["midrash-tehillim", "midrash", 26, "Midrash Tehillim", "מדרש תהלים", ["Shocher Tov", "Midrash Shocher Tov"]],
  ["pirkei-derabbi-eliezer", "midrash", 27, "Pirkei DeRabbi Eliezer", "פרקי דרבי אליעזר", ["Pirkei d'Rabbi Eliezer", "Pirkei Rabbi Eliezer", "Pirkei deRebbi Eliezer"]],
  ["tanna-devei-eliyahu", "midrash", 28, "Tanna Devei Eliyahu", "תנא דבי אליהו", ["Tanna d'Vei Eliyahu", "Tana Dvei Eliyahu", "Seder Eliyahu Rabbah"]],
  ["megillas-taanis", "midrash", 29, "Megillas Taanis", "מגילת תענית", ["Megillat Taanit"]],
  ["perek-shirah", "midrash", 30, "Perek Shirah", "פרק שירה", ["Perek Shira"]],
  ["yalkut-shimoni", "midrash", 40, "Yalkut Shimoni", "ילקוט שמעוני", ["Yalkut"]],
  // ---- Zohar and Kabbalah ----
  ["sefer-yetzirah", "zohar", 1, "Sefer Yetzirah", "ספר יצירה", []],
  ["zohar", "zohar", 2, "Zohar", "זוהר", ["Zohar HaKadosh", "Sefer HaZohar"]],
  ["tikkunei-zohar", "zohar", 3, "Tikkunei Zohar", "תיקוני זוהר", ["Tikunei Zohar", "Tikkunim"]],
  ["zohar-chadash", "zohar", 4, "Zohar Chadash", "זוהר חדש", []],
  // ---- Rishonim (≈ year) ----
  ["chovos-halevavos", "rishonim", 1080, "Chovos HaLevavos", "חובות הלבבות", ["Chovot HaLevavot"]],
  ["rashi", "rishonim", 1105, "Rashi", "רש\"י", ["Rashi on Torah", "Rashi on Chumash", "Rashi al HaTorah"], { scheme: "tanach" }],
  ["kuzari", "rishonim", 1141, "Kuzari", "כוזרי", ["Sefer HaKuzari", "The Kuzari"]],
  ["rashbam", "rishonim", 1158, "Rashbam", "רשב\"ם", [], { scheme: "tanach" }],
  ["ibn-ezra", "rishonim", 1164, "Ibn Ezra", "אבן עזרא", ["Even Ezra"], { scheme: "tanach" }],
  ["raavad", "rishonim", 1198, "Raavad", "ראב\"ד", []],
  ["rambam", "rishonim", 1204, "Rambam", "רמב\"ם", ["Maimonides"]],
  ["mishneh-torah", "rishonim", 1204.1, "Mishneh Torah", "משנה תורה", ["Rambam, Mishneh Torah", "Rambam Mishneh Torah", "Yad HaChazakah", "Yad Hachazaka"], { sefaria: ["Mishneh Torah"], scheme: "chapter" }],
  ["rambam-peirush-hamishnayos", "rishonim", 1204.2, "Rambam, Peirush HaMishnayos", "פירוש המשניות להרמב\"ם", ["Rambam, Commentary on the Mishnah", "Rambam on the Mishnah", "Peirush HaMishnayos"]],
  ["sefer-hamitzvos", "rishonim", 1204.3, "Sefer HaMitzvos", "ספר המצוות", ["Rambam, Sefer HaMitzvos", "Sefer HaMitzvot"], { sefaria: ["Sefer HaMitzvot"] }],
  ["moreh-nevuchim", "rishonim", 1204.4, "Moreh Nevuchim", "מורה נבוכים", ["Guide for the Perplexed", "Moreh"]],
  ["iggeres-teiman", "rishonim", 1204.5, "Iggeres Teiman", "אגרת תימן", ["Igeres Teiman", "Igeret Teiman"]],
  ["thirteen-ikkarim", "rishonim", 1204.6, "Thirteen Principles of Faith", "י\"ג עיקרים", ["Rambam's Thirteen Principles of Faith", "Thirteen Principles", "Thirteen Ikkarim", "Yud-Gimmel Ikkarim"]],
  ["sefer-chassidim", "rishonim", 1217, "Sefer Chassidim", "ספר חסידים", ["Sefer Chasidim"]],
  ["rokeach", "rishonim", 1230, "Rokeach", "רוקח", ["Sefer HaRokeach"]],
  ["tosafos", "rishonim", 1250, "Tosafos", "תוספות", ["Tosfos", "Tosafot", "Tosafos on Shas"], { scheme: "shas" }],
  ["shaarei-teshuvah", "rishonim", 1263, "Shaarei Teshuvah", "שערי תשובה", ["Sha'arei Teshuvah"], { note: "assumed Rabbeinu Yonah's (not the commentary on Shulchan Aruch)" }],
  ["yesod-hateshuvah", "rishonim", 1263.1, "Yesod HaTeshuvah", "יסוד התשובה", []],
  ["ramban", "rishonim", 1270, "Ramban", "רמב\"ן", ["Ramban on Torah", "Ramban on the Torah", "Ramban al HaTorah", "Nachmanides", "Ramban on Sefer HaMitzvos"], { scheme: "tanach" }],
  ["sefer-hachinuch", "rishonim", 1290, "Sefer HaChinuch", "ספר החינוך", ["Chinuch"]],
  ["shaarei-orah", "rishonim", 1290.1, "Sha'arei Orah", "שערי אורה", ["Shaarei Orah"]],
  ["daas-zekeinim", "rishonim", 1300, "Da'as Zekeinim", "דעת זקנים מבעלי התוספות", ["Da'as Zekeinim mi-Ba'alei haTosafos", "Daas Zekeinim miBaalei HaTosafos"], { scheme: "tanach" }],
  ["rosh", "rishonim", 1327, "Rosh", "רא\"ש", ["Rabbeinu Asher"]],
  ["baal-haturim", "rishonim", 1340, "Ba'al HaTurim", "בעל הטורים", [], { scheme: "tanach" }],
  ["tur", "rishonim", 1340.1, "Tur", "טור", ["Arba'ah Turim", "Arbaah Turim"]],
  ["rabbeinu-bachya", "rishonim", 1340.2, "Rabbeinu Bachya", "רבינו בחיי", ["Rabbeinu Bechaye", "Rabbeinu Bachaye", "Rabbeinu Bachye"], { scheme: "tanach" }],
  ["abudraham", "rishonim", 1340.3, "Abudraham", "אבודרהם", ["Avudraham", "Sefer Abudraham"]],
  ["ran", "rishonim", 1376, "Ran", "ר\"ן", []],
  ["derashos-haran", "rishonim", 1376.1, "Derashos HaRan", "דרשות הר\"ן", ["Drashos HaRan"]],
  ["sefer-hakanah", "rishonim", 1400, "Sefer HaKanah", "ספר הקנה", []],
  ["mizrachi", "rishonim", 1526, "Mizrachi", "מזרחי", ["Re'em"], { scheme: "tanach" }],
  // ---- Acharonim and Chassidus (≈ year) ----
  ["shulchan-aruch", "acharonim", 1565, "Shulchan Aruch", "שולחן ערוך", ["Shulchan Arukh", "Shulchan Aruch Orach Chaim", "Shulchan Aruch Orach Chayim", "Shulchan Aruch Yoreh De'ah", "Shulchan Aruch Yoreh Deah", "Shulchan Aruch Even HaEzer", "Shulchan Aruch Choshen Mishpat", "Tur and Shulchan Aruch", "Orach Chaim", "Mechaber"], { sefaria: ["Shulchan Arukh, Orach Chayim", "Shulchan Arukh, Yoreh De'ah", "Shulchan Arukh, Even HaEzer", "Shulchan Arukh, Choshen Mishpat"], scheme: "chapter" }],
  ["tomer-devorah", "acharonim", 1570, "Tomer Devorah", "תומר דבורה", []],
  ["rema", "acharonim", 1572, "Rema", "רמ\"א", ["Shulchan Aruch (Rema)", "Darchei Moshe", "Mappah"]],
  ["yam-shel-shlomo", "acharonim", 1573, "Yam Shel Shlomo", "ים של שלמה", []],
  ["radbaz", "acharonim", 1573.1, "Shu\"t Radbaz", "שו\"ת רדב\"ז", ["Responsa of the Radbaz", "Teshuvos Radbaz", "Radbaz", "Shut HaRadbaz"]],
  ["beis-yosef", "acharonim", 1575, "Beis Yosef", "בית יוסף", ["Beit Yosef"]],
  ["reishis-chochmah", "acharonim", 1575.1, "Reishis Chochmah", "ראשית חכמה", ["Reishit Chochmah"]],
  ["manos-halevi", "acharonim", 1585, "Manos HaLevi", "מנות הלוי", []],
  ["sefer-chareidim", "acharonim", 1588, "Sefer Chareidim", "ספר חרדים", ["Sefer Charedim"]],
  ["alshich", "acharonim", 1593, "Alshich", "אלשיך", ["Alshich HaKadosh", "Toras Moshe (Alshich)"], { scheme: "tanach" }],
  ["yefeh-toar", "acharonim", 1597, "Yefeh To'ar", "יפה תואר", ["Yefeh Toar"]],
  ["maharal", "acharonim", 1609, "Maharal", "מהר\"ל", ["Maharal of Prague"]],
  ["gevuros-hashem", "acharonim", 1609.1, "Gevuros Hashem", "גבורות ה'", ["Gevuras Hashem", "Gevurot Hashem", "Maharal, Gevuros Hashem"]],
  ["nesivos-olam", "acharonim", 1609.2, "Nesivos Olam", "נתיבות עולם", ["Netivot Olam"]],
  ["netzach-yisrael", "acharonim", 1609.3, "Netzach Yisrael", "נצח ישראל", ["Netzach Yisroel"]],
  ["ohr-chadash", "acharonim", 1609.4, "Ohr Chadash", "אור חדש", ["Or Chadash"], { note: "the Maharal on Megillas Esther" }],
  ["ner-mitzvah", "acharonim", 1609.5, "Ner Mitzvah", "נר מצוה", []],
  ["maharal-chiddushei-aggados", "acharonim", 1609.6, "Maharal, Chiddushei Aggados", "חידושי אגדות מהר\"ל", ["Chiddushei Aggados (Maharal)"]],
  ["pri-etz-chaim", "acharonim", 1620, "Pri Etz Chaim", "פרי עץ חיים", []],
  ["shaarei-kedushah", "acharonim", 1620.1, "Shaarei Kedushah", "שערי קדושה", ["Sha'arei Kedushah"]],
  ["gilgulei-neshamos", "acharonim", 1620.2, "Gilgulei Neshamos", "גלגולי נשמות", []],
  ["shelah", "acharonim", 1630, "Shelah", "של\"ה", ["Shnei Luchos HaBris", "Shelah HaKadosh", "Shnei Luchot HaBrit"]],
  ["maharsha", "acharonim", 1631, "Maharsha", "מהרש\"א", []],
  ["megaleh-amukos", "acharonim", 1637, "Megaleh Amukos", "מגלה עמוקות", ["Megale Amukos"]],
  ["bach", "acharonim", 1640, "Bach", "ב\"ח", ["Bayis Chadash"]],
  ["chesed-leavraham", "acharonim", 1643, "Chesed L'Avraham", "חסד לאברהם", []],
  ["tur-bareket", "acharonim", 1654, "Tur Bareket", "טור ברקת", []],
  ["shach", "acharonim", 1663, "Shach", "ש\"ך", ["Sifsei Kohen"]],
  ["yesod-yosef", "acharonim", 1679, "Yesod Yosef", "יסוד יוסף", []],
  ["yalkut-reuveni", "acharonim", 1681, "Yalkut Reuveni", "ילקוט ראובני", []],
  ["magen-avraham", "acharonim", 1683, "Magen Avraham", "מגן אברהם", []],
  ["baer-heitev", "acharonim", 1708, "Ba'er Heitev", "באר היטב", ["Baer Heitev"]],
  ["mishneh-lamelech", "acharonim", 1727, "Mishneh LaMelech", "משנה למלך", []],
  ["parashas-derachim", "acharonim", 1727.1, "Parashas Derachim", "פרשת דרכים", []],
  ["chok-yaakov", "acharonim", 1733, "Chok Yaakov", "חק יעקב", []],
  ["chok-leyisrael", "acharonim", 1740, "Chok LeYisrael", "חק לישראל", ["Chok L'Yisrael"]],
  ["mesilas-yesharim", "acharonim", 1740.1, "Mesilas Yesharim", "מסילת ישרים", ["Mesillas Yesharim", "Mesillat Yesharim", "Mesilat Yesharim"], { sefaria: ["Mesillat Yesharim"], scheme: "chapter" }],
  ["derech-hashem", "acharonim", 1740.2, "Derech Hashem", "דרך ה'", []],
  ["sidduro-shel-shabbos", "acharonim", 1740.3, "Sidduro shel Shabbos", "סידורו של שבת", []],
  ["ohr-hachaim", "acharonim", 1743, "Ohr HaChaim", "אור החיים", ["Or HaChaim", "Ohr HaChaim HaKadosh"], { sefaria: ["Or HaChaim on Torah"], scheme: "tanach" }],
  ["yaaros-devash", "acharonim", 1764, "Ya'aros Devash", "יערות דבש", ["Yaaros Devash"]],
  ["siddur-yaavetz", "acharonim", 1776, "Siddur Ya'avetz", "סידור יעב\"ץ", ["Siddur Yaavetz", "Siddur Beis Yaakov"]],
  ["toldos-yaakov-yosef", "acharonim", 1780, "Toldos Yaakov Yosef", "תולדות יעקב יוסף", []],
  ["simchas-haregel", "acharonim", 1782, "Simchas HaRegel", "שמחת הרגל", []],
  ["noam-elimelech", "acharonim", 1788, "Noam Elimelech", "נועם אלימלך", []],
  ["yesod-veshoresh-haavodah", "acharonim", 1794, "Yesod V'Shoresh HaAvodah", "יסוד ושורש העבודה", ["Yesod VeShoresh HaAvodah"]],
  ["tanya", "acharonim", 1796, "Tanya", "תניא", ["Likkutei Amarim", "Sefer HaTanya"], { sefaria: ["Tanya"], scheme: "chapter" }],
  ["meor-einayim", "acharonim", 1798, "Me'or Einayim", "מאור עינים", ["Meor Einayim"]],
  ["haflaah", "acharonim", 1805, "Hafla'ah", "הפלאה", []],
  ["midrash-pinchas", "acharonim", 1791, "Midrash Pinchas", "מדרש פנחס", []],
  ["likutei-moharan", "acharonim", 1808, "Likutei Moharan", "ליקוטי מוהר\"ן", ["Likkutei Moharan"]],
  ["degel-machaneh-ephraim", "acharonim", 1810, "Degel Machaneh Ephraim", "דגל מחנה אפרים", []],
  ["kedushas-levi", "acharonim", 1811, "Kedushas Levi", "קדושת לוי", []],
  ["arvei-nachal", "acharonim", 1813, "Arvei Nachal", "ערבי נחל", []],
  ["avodas-yisrael", "acharonim", 1814, "Avodas Yisrael", "עבודת ישראל", ["Avodas Yisroel"]],
  ["shulchan-aruch-harav", "acharonim", 1816, "Shulchan Aruch HaRav", "שולחן ערוך הרב", []],
  ["siddur-baal-hatanya", "acharonim", 1816.1, "Siddur Ba'al HaTanya", "סידור בעל התניא", ["Siddur of the Alter Rebbe", "Siddur of the Ba'al HaTanya", "Siddur HaRav", "Siddur Tehillas Hashem"]],
  ["beer-mayim-chaim", "acharonim", 1817, "Be'er Mayim Chaim", "באר מים חיים", []],
  ["nefesh-hachaim", "acharonim", 1824, "Nefesh HaChaim", "נפש החיים", []],
  ["ohev-yisrael", "acharonim", 1825, "Ohev Yisrael", "אוהב ישראל", ["Ohev Yisroel"]],
  ["peas-hashulchan", "acharonim", 1836, "Pe'as HaShulchan", "פאת השולחן", []],
  ["likkutei-torah-chernobyl", "acharonim", 1837, "Likkutei Torah (Chernobyl)", "ליקוטי תורה (טשערנאביל)", []],
  ["torah-ohr", "acharonim", 1837.1, "Torah Ohr", "תורה אור", ["Torah Or"]],
  ["chasam-sofer", "acharonim", 1839, "Chasam Sofer", "חתם סופר", ["Chasam Sofer al HaTorah", "Toras Moshe (Chasam Sofer)"]],
  ["chasam-sofer-derashos", "acharonim", 1839.1, "Derashos Chasam Sofer", "דרשות חתם סופר", ["Drashos Chasam Sofer"]],
  ["chasam-sofer-teshuvos", "acharonim", 1839.2, "Shu\"t Chasam Sofer", "שו\"ת חתם סופר", ["Responsa Chasam Sofer", "Teshuvos Chasam Sofer"]],
  ["chasam-sofer-chiddushim", "acharonim", 1839.3, "Chiddushei Chasam Sofer", "חידושי חתם סופר", []],
  ["sefer-hazikaron-chasam-sofer", "acharonim", 1839.4, "Sefer HaZikaron (Chasam Sofer)", "ספר הזכרון (חתם סופר)", []],
  ["toras-moshe", "acharonim", 1839.5, "Toras Moshe", "תורת משה", [], { note: "ambiguous: the Chasam Sofer's or the Alshich's; check the mention" }],
  ["bas-ayin", "acharonim", 1840, "Bas Ayin", "בת עין", []],
  ["yismach-moshe", "acharonim", 1841, "Yismach Moshe", "ישמח משה", []],
  ["maor-vashemesh", "acharonim", 1842, "Maor VaShemesh", "מאור ושמש", ["Me'or VaShemesh", "Meor Vashemesh"]],
  ["bnei-yissaschar", "acharonim", 1846, "Bnei Yissaschar", "בני יששכר", ["Bnei Yisaschar", "Bnei Yissachar"]],
  ["likkutei-torah", "acharonim", 1848, "Likkutei Torah", "ליקוטי תורה", ["Likutei Torah"], { note: "the Alter Rebbe's" }],
  ["derech-pikudecha", "acharonim", 1851, "Derech Pikudecha", "דרך פקודיך", []],
  ["sefer-hazechus", "acharonim", 1860, "Sefer HaZechus", "ספר הזכות", []],
  ["derech-mitzvosecha", "acharonim", 1866, "Derech Mitzvosecha", "דרך מצותיך", []],
  ["chiddushei-harim", "acharonim", 1866.1, "Chiddushei HaRim", "חידושי הרי\"ם", ["Chidushei HaRim"]],
  ["tiferes-shlomo", "acharonim", 1867, "Tiferes Shlomo", "תפארת שלמה", []],
  ["agra-dekallah", "acharonim", 1868, "Agra deKallah", "אגרא דכלה", ["Igra d'Kallah", "Igra deKallah", "Agra d'Kallah"]],
  ["zera-kodesh", "acharonim", 1868.1, "Zera Kodesh", "זרע קודש", []],
  ["heichal-haberachah", "acharonim", 1869, "Heichal HaBerachah", "היכל הברכה", ["Heichal HaBrachah"]],
  ["ksav-sofer", "acharonim", 1871, "Ksav Sofer", "כתב סופר", []],
  ["chofetz-chaim", "acharonim", 1873, "Chofetz Chaim", "חפץ חיים", ["Chafetz Chaim", "Sefer Chofetz Chaim"]],
  ["beis-aharon", "acharonim", 1875, "Beis Aharon", "בית אהרן", []],
  ["yitav-lev", "acharonim", 1875.1, "Yitav Lev", "ייטב לב", ["Yetev Lev"]],
  ["divrei-chaim", "acharonim", 1876, "Divrei Chaim", "דברי חיים", ["Shu\"t Divrei Chaim"]],
  ["imrei-noam", "acharonim", 1877, "Imrei Noam", "אמרי נועם", []],
  ["yesod-haavodah", "acharonim", 1883, "Yesod HaAvodah", "יסוד העבודה", []],
  ["tzvi-latzaddik", "acharonim", 1900, "Tzvi LaTzaddik", "צבי לצדיק", []],
  ["toras-avos", "acharonim", 1900.1, "Toras Avos", "תורת אבות", []],
  ["tzidkas-hatzaddik", "acharonim", 1902, "Tzidkas HaTzaddik", "צדקת הצדיק", []],
  ["mishnah-berurah", "acharonim", 1904, "Mishnah Berurah", "משנה ברורה", ["Mishna Berura"]],
  ["sfas-emes", "acharonim", 1905, "Sfas Emes", "שפת אמת", ["Sefas Emes"]],
  ["eglei-tal", "acharonim", 1905.1, "Eglei Tal", "אגלי טל", []],
  ["avnei-nezer", "acharonim", 1910, "Avnei Nezer", "אבני נזר", []],
  ["divrei-shmuel", "acharonim", 1916, "Divrei Shmuel", "דברי שמואל", []],
  ["divrei-yisrael", "acharonim", 1920, "Divrei Yisrael", "דברי ישראל", []],
  ["shem-mishmuel", "acharonim", 1926, "Shem MiShmuel", "שם משמואל", []],
  ["meshech-chochmah", "acharonim", 1926.1, "Meshech Chochmah", "משך חכמה", []],
  ["pri-tzaddik", "acharonim", 1934, "Pri Tzaddik", "פרי צדיק", []],
  ["minchas-elazar", "acharonim", 1937, "Minchas Elazar", "מנחת אלעזר", []],
  ["shomer-emunim", "acharonim", 1942, "Shomer Emunim", "שומר אמונים", [], { note: "assumed R' Aharon Roth's" }],
  ["imrei-emes", "acharonim", 1948, "Imrei Emes", "אמרי אמת", []],
  ["chayei-olam", "acharonim", 1957, "Chayei Olam", "חיי עולם", []],
  ["divrei-yoel", "acharonim", 1979, "Divrei Yoel", "דברי יואל", []],
  ["seder-hadoros", "acharonim", 1769, "Seder HaDoros", "סדר הדורות", []],
  // ---- Tefillah and Piyut (order: day, Shabbos, year) ----
  ["siddur", "tefillah", 1, "Siddur", "סידור", ["Tefillah", "Siddur (Hashkiveinu)", "Nusach HaTefillah"], { genre: true }],
  ["birchos-hashachar", "tefillah", 2, "Birchos HaShachar", "ברכות השחר", []],
  ["ana-bekoach", "tefillah", 3, "Ana Bekoach", "אנא בכח", []],
  ["shemoneh-esrei", "tefillah", 4, "Shemoneh Esrei", "שמונה עשרה", ["Amidah"]],
  ["aleinu", "tefillah", 5, "Aleinu", "עלינו", []],
  ["ani-maamin", "tefillah", 6, "Ani Maamin", "אני מאמין", []],
  ["tikkun-chatzos", "tefillah", 7, "Tikkun Chatzos", "תיקון חצות", []],
  ["kiddush-levanah", "tefillah", 8, "Kiddush Levanah", "קידוש לבנה", ["Kiddush Levana"]],
  ["lecha-dodi", "tefillah", 10, "Lecha Dodi", "לכה דודי", []],
  ["shabbos-zemiros", "tefillah", 11, "Shabbos Zemiros", "זמירות שבת", ["Zemiros", "Zemiros Shabbos"]],
  ["azamer-bishvachin", "tefillah", 12, "Azamer Bishvachin", "אזמר בשבחין", []],
  ["shir-hayichud", "tefillah", 13, "Shir HaYichud", "שיר היחוד", []],
  ["bar-yochai", "tefillah", 14, "Bar Yochai", "בר יוחאי", ["Bar Yochai (piyut)"]],
  ["shabbos-mussaf", "tefillah", 15, "Shabbos Mussaf", "מוסף שבת", ["Shabbos Mussaf prayer", "Shabbos Musaf"]],
  ["selichos", "tefillah", 20, "Selichos", "סליחות", ["Selichot"]],
  ["machzor-rosh-hashanah", "tefillah", 21, "Machzor Rosh Hashanah", "מחזור ראש השנה", ["Rosh Hashanah Musaf", "Rosh Hashanah liturgy", "Rosh Hashanah prayers", "Rosh Hashanah Mussaf"]],
  ["unesaneh-tokef", "tefillah", 22, "Unesaneh Tokef", "ונתנה תוקף", []],
  ["yom-kippur-liturgy", "tefillah", 23, "Machzor Yom Kippur", "מחזור יום הכיפורים", ["Yom Kippur liturgy", "Yom Kippur prayers"]],
  ["yehi-ratzon-sukkah", "tefillah", 24, "Yehi Ratzon before entering the sukkah", "יהי רצון לפני הכניסה לסוכה", []],
  ["al-hanissim", "tefillah", 25, "Al HaNissim", "על הנסים", ["Al Hanisim"]],
  ["haneiros-halalu", "tefillah", 26, "Haneiros Halalu", "הנרות הללו", []],
  ["maoz-tzur", "tefillah", 27, "Ma'oz Tzur", "מעוז צור", []],
  ["shoshanas-yaakov", "tefillah", 28, "Shoshanas Yaakov", "שושנת יעקב", []],
  ["haggadah", "tefillah", 29, "Haggadah shel Pesach", "הגדה של פסח", ["Haggadah", "Pesach Haggadah", "Hagaddah"]],
  ["akdamus", "tefillah", 30, "Akdamus", "אקדמות", []],
  ["sheva-brachos", "tefillah", 31, "Sheva Brachos", "שבע ברכות", []],
  // ---- other ----
  ["josephus", "other", 20, "Josephus", "יוסיפון", ["Yosippon", "Sefer Yosippon"]],
];

function tanachWorks(): Row[] {
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const b of TANACH) {
    if (seen.has(b.work)) continue;
    seen.add(b.work);
    const parts = TANACH.filter((x) => x.work === b.work);
    const merged = parts.length > 1;
    const en = merged ? b.en.replace(/ I$/, "") : b.en;
    const he = merged ? b.he.replace(/ א$/, "") : b.he;
    const aliases = parts.flatMap((p) => [p.en, p.sefaria, ...p.aliases]);
    rows.push([b.work, b.section, b.order, en, he, aliases, { sefaria: parts.map((p) => p.sefaria), scheme: "tanach" }]);
  }
  return rows;
}

function tractateWorks(): Row[] {
  const rows: Row[] = [];
  for (const t of TRACTATES) {
    const names = [t.en, t.sefaria, ...t.aliases];
    const isAvos = t.id === "avos";
    rows.push([
      isAvos ? "pirkei-avos" : `mishnah-${t.id}`,
      "mishnah",
      t.order,
      isAvos ? "Pirkei Avos" : `Mishnah ${t.en}`,
      isAvos ? "פרקי אבות" : `משנה ${t.he}`,
      names.flatMap((n) => [`Mishnah ${n}`, `Mishna ${n}`, `Mishnayos ${n}`, ...(isAvos ? [n] : [])]),
      { sefaria: [isAvos ? "Pirkei Avot" : `Mishnah ${t.sefaria}`], scheme: "chapter" },
    ]);
    if (t.bavli) {
      rows.push([
        `bavli-${t.id}`,
        "bavli",
        t.order,
        `Gemara ${t.en}`,
        `גמרא ${t.he}`,
        names.flatMap((n) => [`Gemara ${n}`, `Bavli ${n}`, `Talmud Bavli ${n}`, `Talmud ${n}`, `Maseches ${n}`, `Masechet ${n}`, `Tractate ${n}`]),
        { sefaria: [t.sefaria], scheme: "shas" },
      ]);
    }
    if (t.yerushalmi) {
      rows.push([
        `yerushalmi-${t.id}`,
        "yerushalmi",
        t.order,
        `Yerushalmi ${t.en}`,
        `ירושלמי ${t.he}`,
        names.flatMap((n) => [`Yerushalmi ${n}`, `Talmud Yerushalmi ${n}`, `Jerusalem Talmud ${n}`]),
        { sefaria: [`Jerusalem Talmud ${t.sefaria}`], scheme: "chapter" },
      ]);
    }
  }
  return rows;
}

function toWork([key, group, order, en, he, aliases, opts]: Row): Work {
  const o = opts ?? {};
  const w: Work = {
    key,
    group,
    order,
    he,
    yi: o.yi ?? he,
    en,
    sefaria: o.sefaria ?? [],
    scheme: o.scheme ?? "none",
    genre: o.genre ?? false,
    aliases: [en, he, ...(aliases ?? [])],
  };
  if (o.note !== undefined) w.note = o.note;
  return w;
}

export const WORKS: readonly Work[] = [...tanachWorks(), ...tractateWorks(), ...CURATED].map(toWork);
