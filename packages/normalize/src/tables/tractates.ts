/**
 * Mishnah / Talmud tractates in Shas order (six sedarim).
 *
 * `bavli` marks tractates with Babylonian Gemara (Sefaria's bare title addresses the Bavli:
 * "Shabbat 21b"). Every tractate has Mishnah ("Mishnah Shabbat 2:1"). `yerushalmi` marks
 * tractates with Jerusalem Talmud ("Jerusalem Talmud Shabbat 1:1").
 *
 * reviewStatus "unreviewed".
 */
export const tractatesReviewStatus = "unreviewed" as const;

export type Seder = "zeraim" | "moed" | "nashim" | "nezikin" | "kodashim" | "taharos";

export interface Tractate {
  id: string;
  /** Sefaria title without the "Mishnah " prefix */
  sefaria: string;
  seder: Seder;
  /** 1..63 in Shas order */
  order: number;
  he: string;
  en: string;
  bavli: boolean;
  yerushalmi: boolean;
  aliases: readonly string[];
}

type Row = [id: string, sefaria: string, seder: Seder, he: string, en: string, bavli: boolean, yerushalmi: boolean, aliases?: string[]];

const ROWS: Row[] = [
  ["berachos", "Berakhot", "zeraim", "ברכות", "Berachos", true, true, ["Brachos", "Berachot", "Berakhos"]],
  ["peah", "Peah", "zeraim", "פאה", "Pe'ah", false, true],
  ["demai", "Demai", "zeraim", "דמאי", "Demai", false, true],
  ["kilayim", "Kilayim", "zeraim", "כלאים", "Kilayim", false, true],
  ["sheviis", "Sheviit", "zeraim", "שביעית", "Shevi'is", false, true],
  ["terumos", "Terumot", "zeraim", "תרומות", "Terumos", false, true],
  ["maasros", "Maasrot", "zeraim", "מעשרות", "Ma'asros", false, true],
  ["maaser-sheni", "Maaser Sheni", "zeraim", "מעשר שני", "Ma'aser Sheni", false, true],
  ["challah", "Challah", "zeraim", "חלה", "Challah", false, true],
  ["orlah", "Orlah", "zeraim", "ערלה", "Orlah", false, true],
  ["bikkurim", "Bikkurim", "zeraim", "ביכורים", "Bikkurim", false, true],
  ["shabbos", "Shabbat", "moed", "שבת", "Shabbos", true, true, ["Shabbat"]],
  ["eruvin", "Eruvin", "moed", "עירובין", "Eruvin", true, true],
  ["pesachim", "Pesachim", "moed", "פסחים", "Pesachim", true, true],
  ["shekalim", "Shekalim", "moed", "שקלים", "Shekalim", false, true],
  ["yoma", "Yoma", "moed", "יומא", "Yoma", true, true],
  ["sukkah", "Sukkah", "moed", "סוכה", "Sukkah", true, true, ["Succah"]],
  ["beitzah", "Beitzah", "moed", "ביצה", "Beitzah", true, true, ["Beitza", "Betzah"]],
  ["rosh-hashanah", "Rosh Hashanah", "moed", "ראש השנה", "Rosh Hashanah", true, true, ["Rosh Hashana"]],
  ["taanis", "Taanit", "moed", "תענית", "Ta'anis", true, true, ["Taanit", "Taanis"]],
  ["megillah", "Megillah", "moed", "מגילה", "Megillah", true, true, ["Megila"]],
  ["moed-katan", "Moed Katan", "moed", "מועד קטן", "Moed Katan", true, true],
  ["chagigah", "Chagigah", "moed", "חגיגה", "Chagigah", true, true],
  ["yevamos", "Yevamot", "nashim", "יבמות", "Yevamos", true, true, ["Yevamot"]],
  ["kesubos", "Ketubot", "nashim", "כתובות", "Kesubos", true, true, ["Ketubot", "Kesuvos"]],
  ["nedarim", "Nedarim", "nashim", "נדרים", "Nedarim", true, true],
  ["nazir", "Nazir", "nashim", "נזיר", "Nazir", true, true],
  ["sotah", "Sotah", "nashim", "סוטה", "Sotah", true, true],
  ["gittin", "Gittin", "nashim", "גיטין", "Gittin", true, true],
  ["kiddushin", "Kiddushin", "nashim", "קידושין", "Kiddushin", true, true],
  ["bava-kamma", "Bava Kamma", "nezikin", "בבא קמא", "Bava Kamma", true, true, ["Bava Kama"]],
  ["bava-metzia", "Bava Metzia", "nezikin", "בבא מציעא", "Bava Metzia", true, true],
  ["bava-basra", "Bava Batra", "nezikin", "בבא בתרא", "Bava Basra", true, true, ["Bava Batra"]],
  ["sanhedrin", "Sanhedrin", "nezikin", "סנהדרין", "Sanhedrin", true, true],
  ["makkos", "Makkot", "nezikin", "מכות", "Makkos", true, true, ["Makkot", "Makos"]],
  ["shevuos", "Shevuot", "nezikin", "שבועות", "Shevuos", true, true, ["Shevuot"]],
  ["eduyos", "Eduyot", "nezikin", "עדיות", "Eduyos", false, false],
  ["avodah-zarah", "Avodah Zarah", "nezikin", "עבודה זרה", "Avodah Zarah", true, true, ["Avoda Zara"]],
  ["avos", "Pirkei Avot", "nezikin", "אבות", "Avos", false, false, ["Avot", "Pirkei Avos", "Pirkei Avot"]],
  ["horayos", "Horayot", "nezikin", "הוריות", "Horayos", true, true, ["Horayot"]],
  ["zevachim", "Zevachim", "kodashim", "זבחים", "Zevachim", true, false],
  ["menachos", "Menachot", "kodashim", "מנחות", "Menachos", true, false, ["Menachot"]],
  ["chullin", "Chullin", "kodashim", "חולין", "Chullin", true, false],
  ["bechoros", "Bekhorot", "kodashim", "בכורות", "Bechoros", true, false, ["Bechorot"]],
  ["arachin", "Arakhin", "kodashim", "ערכין", "Arachin", true, false, ["Arakhin"]],
  ["temurah", "Temurah", "kodashim", "תמורה", "Temurah", true, false],
  ["kereisos", "Keritot", "kodashim", "כריתות", "Kereisos", true, false, ["Kerisos", "Keritot"]],
  ["meilah", "Meilah", "kodashim", "מעילה", "Me'ilah", true, false],
  ["tamid", "Tamid", "kodashim", "תמיד", "Tamid", true, false],
  ["middos", "Middot", "kodashim", "מדות", "Middos", false, false, ["Midos", "Middot"]],
  ["kinnim", "Kinnim", "kodashim", "קנים", "Kinnim", false, false],
  ["keilim", "Kelim", "taharos", "כלים", "Keilim", false, false, ["Kelim"]],
  ["ohalos", "Oholot", "taharos", "אהלות", "Ohalos", false, false, ["Oholot", "Oholos"]],
  ["negaim", "Negaim", "taharos", "נגעים", "Nega'im", false, false],
  ["parah", "Parah", "taharos", "פרה", "Parah", false, false],
  ["taharos", "Tahorot", "taharos", "טהרות", "Taharos", false, false, ["Tohoros"]],
  ["mikvaos", "Mikvaot", "taharos", "מקואות", "Mikva'os", false, false],
  ["niddah", "Niddah", "taharos", "נדה", "Niddah", true, true],
  ["machshirin", "Makhshirin", "taharos", "מכשירין", "Machshirin", false, false],
  ["zavim", "Zavim", "taharos", "זבים", "Zavim", false, false],
  ["tevul-yom", "Tevul Yom", "taharos", "טבול יום", "Tevul Yom", false, false],
  ["yadayim", "Yadayim", "taharos", "ידים", "Yadayim", false, false],
  ["uktzin", "Oktzin", "taharos", "עוקצין", "Uktzin", false, false, ["Oktzin", "Uktzim"]],
];

export const TRACTATES: readonly Tractate[] = ROWS.map(([id, sefaria, seder, he, en, bavli, yerushalmi, aliases], i) => ({
  id,
  sefaria,
  seder,
  order: i + 1,
  he,
  en,
  bavli,
  yerushalmi,
  aliases: aliases ?? [],
}));
