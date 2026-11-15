/**
 * People alias table: canonical person → aliases. Only people whose names need merging beyond
 * what the generic person form already does (see `personForm` in `person.ts`: case, "the",
 * apostrophes, parentheticals, honorific suffixes such as HaMelech/HaNavi/Avinu, and a final
 * "-ah"/"-a" spelling difference are folded automatically). So "Ramban"/"the Ramban" and
 * "Yitzchak"/"Yitzchak Avinu" merge without a row here; "Dovid"/"David" need one.
 *
 * reviewStatus "unreviewed". Generated first from the corpus (see scripts/seed.ts for the input
 * snapshot), then hand-edited.
 */
export const peopleReviewStatus = "unreviewed" as const;

export interface Person {
  key: string;
  en: string;
  he: string;
  yi: string;
  aliases: readonly string[];
  /**
   * Match only through the exact form (no honorific/parenthetical stripping), for people whose
   * loose form would collide with someone else ("Shimon HaTzaddik" vs Shimon ben Yaakov).
   */
  exactOnly?: boolean;
}

type Row = [key: string, en: string, he: string, aliases: string[], exactOnly?: boolean];

// prettier-ignore
const ROWS: Row[] = [
  // Avos, Imahos, Tanach
  ["adam-harishon", "Adam HaRishon", "אדם הראשון", ["Adam"]],
  ["chavah", "Chavah", "חוה", ["Chava", "Eve"]],
  ["avraham-avinu", "Avraham Avinu", "אברהם אבינו", ["Avraham", "Avrohom Avinu", "Abraham"]],
  ["sarah-imeinu", "Sarah Imeinu", "שרה אמנו", ["Sarah", "Sara"]],
  ["yitzchak-avinu", "Yitzchak Avinu", "יצחק אבינו", ["Yitzchak", "Isaac"]],
  ["rivkah-imeinu", "Rivkah Imeinu", "רבקה אמנו", ["Rivka", "Rivkah"]],
  ["yaakov-avinu", "Yaakov Avinu", "יעקב אבינו", ["Yaakov", "Jacob"]],
  ["rachel-imeinu", "Rachel Imeinu", "רחל אמנו", ["Rachel"]],
  ["leah-imeinu", "Leah Imeinu", "לאה אמנו", ["Leah"]],
  ["yosef-hatzaddik", "Yosef HaTzaddik", "יוסף הצדיק", ["Yosef", "Joseph"]],
  ["esav", "Esav", "עשו", ["Eisav", "Esau"]],
  ["osnas", "Osnas", "אסנת", ["Asnas", "Asenath"]],
  ["dinah", "Dinah", "דינה", ["Dina"]],
  ["yehudah", "Yehudah", "יהודה", ["Yehuda"]],
  ["moshe-rabbeinu", "Moshe Rabbeinu", "משה רבינו", ["Moshe", "Moses"]],
  ["aharon-hakohen", "Aharon HaKohen", "אהרן הכהן", ["Aharon", "Aaron"]],
  ["miriam-haneviah", "Miriam", "מרים הנביאה", ["Miriam HaNeviah"]],
  ["pharaoh", "Pharaoh", "פרעה", ["Paroh", "Par'oh"]],
  ["bilaam", "Bilaam", "בלעם", ["Bilam", "Balaam"]],
  ["yehoshua-bin-nun", "Yehoshua bin Nun", "יהושע בן נון", ["Yehoshua"]],
  ["kalev", "Kalev", "כלב", ["Calev", "Kalev ben Yefuneh"]],
  ["shmuel-hanavi", "Shmuel HaNavi", "שמואל הנביא", ["Shmuel"]],
  ["shaul-hamelech", "Shaul HaMelech", "שאול המלך", ["Shaul", "King Saul"]],
  ["dovid-hamelech", "Dovid HaMelech", "דוד המלך", ["Dovid", "David", "David HaMelech", "King David"]],
  ["shlomo-hamelech", "Shlomo HaMelech", "שלמה המלך", ["Shlomo", "King Solomon"]],
  ["eliyahu-hanavi", "Eliyahu HaNavi", "אליהו הנביא", ["Eliyahu", "Elijah"]],
  ["yeshayahu-hanavi", "Yeshayahu HaNavi", "ישעיהו הנביא", ["Yeshayahu", "Yeshaya"]],
  ["yirmiyahu-hanavi", "Yirmiyahu HaNavi", "ירמיהו הנביא", ["Yirmiyahu", "Yirmeyahu"]],
  ["yechezkel-hanavi", "Yechezkel HaNavi", "יחזקאל הנביא", ["Yechezkel"]],
  ["yonah-hanavi", "Yonah HaNavi", "יונה הנביא", ["Yonah"]],
  ["nechemiah", "Nechemiah", "נחמיה", ["Nechemia"]],
  ["ezra-hasofer", "Ezra HaSofer", "עזרא הסופר", ["Ezra"]],
  ["chizkiyahu-hamelech", "Chizkiyahu HaMelech", "חזקיהו המלך", ["Chizkiyahu"]],
  ["tzidkiyahu-hamelech", "Tzidkiyahu HaMelech", "צדקיהו המלך", ["Tzidkiyahu"]],
  ["rus", "Rus", "רות", ["Ruth"]],
  ["achashverosh", "Achashverosh", "אחשורוש", ["Achashveirosh", "Ahasuerus"]],
  ["nevuchadnetzar", "Nevuchadnetzar", "נבוכדנצר", ["Nebuchadnezzar", "Nevuchadnezzar"]],
  ["belshatzar", "Belshatzar", "בלשאצר", ["Belshazzar"]],
  ["sancheriv", "Sancheriv", "סנחריב", ["Sancheiriv", "Sanheriv", "Sennacherib"]],
  ["shechem-ben-chamor", "Shechem ben Chamor", "שכם בן חמור", ["Shechem"]],
  ["doeg-haadomi", "Doeg HaAdomi", "דואג האדומי", ["Doeg"]],
  ["yeravam-ben-nevat", "Yeravam ben Nevat", "ירבעם בן נבט", ["Yeravam"]],
  ["zimri-ben-salu", "Zimri ben Salu", "זמרי בן סלוא", ["Zimri"]],
  ["malki-tzedek", "Malki-Tzedek", "מלכי צדק", ["Malkitzedek"]],
  ["kamtza-bar-kamtza", "Kamtza and Bar Kamtza", "קמצא ובר קמצא", ["Kamtza bar Kamtza", "Kamtza and Bar Kamtza"]],
  ["bar-koziva", "Bar Koziva", "בר כוזיבא", ["Ben Koziva", "Bar Kochba"]],
  ["the-chashmonaim", "the Chashmonaim", "החשמונאים", ["Chashmonaim", "Chashmona'im", "Hasmoneans"]],
  ["gavriel", "the angel Gavriel", "גבריאל", ["Gavriel", "the angel Gavriel"]],
  ["michael", "the angel Michael", "מיכאל", ["Michael", "the angel Michael", "Michael the angel"]],
  ["moshiach", "Moshiach", "משיח", ["Mashiach", "Messiah"]],
  ["shimon-hatzaddik", "Shimon HaTzaddik", "שמעון הצדיק", [], true],
  ["shmuel-amora", "Shmuel (Amora)", "שמואל (אמורא)", ["Shmuel the Amora"], true],
  ["rashash-sharabi", "the Rashash (Rabbi Shalom Sharabi)", "הרש\"ש (ר' שלום שרעבי)", ["Rabbi Shalom Sharabi"], true],
  ["rashash-strashun", "the Rashash (Rabbi Shmuel Strashun)", "הרש\"ש (ר' שמואל שטראשון)", ["Rabbi Shmuel Strashun"], true],
  ["rabbi-shimshon-of-ostropoli", "Rabbi Shimshon of Ostropoli", "רבי שמשון מאוסטרופולי", ["Rabbi Shimshon of Ostropol"]],
  // Tannaim / Amoraim
  ["rebbi", "Rebbi (Rabbi Yehudah HaNasi)", "רבי יהודה הנשיא", ["Rebbi", "Rabbi Yehudah HaNasi", "Rabbeinu HaKadosh"]],
  ["rabbi-shimon-bar-yochai", "Rabbi Shimon bar Yochai", "רבי שמעון בר יוחאי", ["Rashbi", "R' Shimon bar Yochai"]],
  ["rabbi-akiva", "Rabbi Akiva", "רבי עקיבא", ["R' Akiva"]],
  ["rabban-yochanan-ben-zakkai", "Rabban Yochanan ben Zakkai", "רבן יוחנן בן זכאי", ["Rabban Yochanan ben Zakai", "Rabbi Yochanan ben Zakkai", "Rabbi Yochanan ben Zakai"]],
  ["rabbi-elazar-ben-azaryah", "Rabbi Elazar ben Azaryah", "רבי אלעזר בן עזריה", ["Rabbi Elazar ben Azarya"]],
  ["rabbi-yochanan", "Rabbi Yochanan", "רבי יוחנן", ["R' Yochanan"]],
  ["rabbi-yehudah", "Rabbi Yehudah", "רבי יהודה", ["Rabbi Yehuda"]],
  ["rabbi-pinchas-ben-yair", "Rabbi Pinchas ben Yair", "רבי פנחס בן יאיר", ["Rebbi Pinchas ben Yair"]],
  ["rabbi-yonasan-ben-uziel", "Rabbi Yonasan ben Uziel", "רבי יונתן בן עוזיאל", ["Yonasan ben Uziel"]],
  // Rishonim
  ["rashi", "Rashi", "רש\"י", []],
  ["rambam", "the Rambam", "הרמב\"ם", ["Rambam", "Maimonides"]],
  ["ramban", "the Ramban", "הרמב\"ן", ["Ramban", "Nachmanides"]],
  ["ibn-ezra", "the Ibn Ezra", "האבן עזרא", ["Ibn Ezra"]],
  ["rabbeinu-bachya", "Rabbeinu Bachya", "רבינו בחיי", ["Rabbeinu Bechaye"]],
  ["radbaz", "the Radbaz", "הרדב\"ז", ["Radvaz"]],
  ["tosafos", "Tosafos", "תוספות", ["Tosfos", "Baalei HaTosafos"]],
  ["baal-haturim", "the Ba'al HaTurim", "בעל הטורים", ["Baal HaTurim"]],
  // Acharonim
  ["arizal", "the Arizal", "האריז\"ל", ["Ari", "the Ari", "Arizal", "Ari HaKadosh"]],
  ["rabbi-chaim-vital", "Rabbi Chaim Vital", "רבי חיים ויטאל", ["Rav Chaim Vital", "R' Chaim Vital", "Maharchu"]],
  ["mechaber", "the Mechaber", "המחבר", ["Mechaber", "Rabbi Yosef Karo", "the Beis Yosef", "Beis Yosef"]],
  ["maharal", "the Maharal", "המהר\"ל", ["Maharal", "Maharal of Prague"]],
  ["shelah", "the Shelah", "השל\"ה הקדוש", ["Shelah", "Shelah HaKadosh"]],
  ["ohr-hachaim", "the Ohr HaChaim", "האור החיים הקדוש", ["Ohr HaChaim", "Or HaChaim", "Ohr HaChaim HaKadosh"]],
  ["ramchal", "the Ramchal", "הרמח\"ל", ["Ramchal", "Rabbi Moshe Chaim Luzzatto"]],
  ["rabbi-yaakov-emden", "Rabbi Yaakov Emden", "רבי יעקב עמדין", ["Rav Yaakov Emden", "R' Yaakov Emden", "the Yaavetz"]],
  ["rabbi-yonasan-eibeschutz", "Rabbi Yonasan Eibeschutz", "רבי יהונתן אייבשיץ", ["Rabbi Yonasan Eybeschutz", "the Yaaros Devash"]],
  ["vilna-gaon", "the Vilna Gaon", "הגר\"א", ["Vilna Gaon", "the Gra", "Gra"]],
  ["chasam-sofer", "the Chasam Sofer", "החתם סופר", ["Chasam Sofer"]],
  ["baal-shem-tov", "the Ba'al Shem Tov", "הבעל שם טוב", ["Baal Shem Tov", "the Besht", "Besht"]],
  ["maggid-of-mezritch", "the Maggid of Mezritch", "המגיד ממעזריטש", ["the Maggid", "Maggid of Mezeritch"]],
  ["toldos-yaakov-yosef", "the Toldos Yaakov Yosef", "התולדות יעקב יוסף", ["Rabbi Yaakov Yosef of Polonne"]],
  ["rabbi-pinchas-of-koretz", "Rabbi Pinchas of Koretz", "רבי פנחס מקוריץ", ["Rabbi Pinchas of Koritz", "Reb Pinchas of Koretz", "Rav Pinchas of Koretz"]],
  ["rebbe-reb-elimelech", "the Rebbe Reb Elimelech of Lizhensk", "הרבי ר' אלימלך מליזענסק", ["Rebbe Reb Elimelech", "Rebbe Elimelech", "Rebbe Elimelech of Lizhensk", "Reb Elimelech of Lizhensk", "Rabbi Elimelech", "R' Elimelech", "the Noam Elimelech", "Rebbe Reb Elimelech of Lizhensk"]],
  ["reb-zusha", "Reb Zusha of Anipoli", "ר' זושא מאניפולי", ["Reb Zusha"]],
  ["berditchever-rav", "Rabbi Levi Yitzchak of Berditchev", "רבי לוי יצחק מבארדיטשוב", ["the Berditchever Rav", "the Berditchever Rav (Kedushas Levi)", "the Kedushas Levi", "R' Levi Yitzchak of Berditchev", "Reb Levi Yitzchak of Berditchev"]],
  ["baal-hatanya", "the Ba'al HaTanya", "בעל התניא", ["Baal HaTanya", "the Alter Rebbe", "Alter Rebbe"]],
  ["tzemach-tzedek", "the Tzemach Tzedek", "הצמח צדק", []],
  ["chozeh-of-lublin", "the Chozeh of Lublin", "החוזה מלובלין", ["the Lubliner (the Chozeh of Lublin)", "the Rebbe of Lublin", "the Lubliner", "the Chozeh"]],
  ["kozhnitzer-maggid", "the Kozhnitzer Maggid", "המגיד מקאזניץ", ["the Koznitzer Maggid", "the Avodas Yisrael"]],
  ["apter-rav", "the Apter Rav", "האפטער רב", ["the Ohev Yisrael", "the Apter Rebbe"]],
  ["rabbi-nachum-of-chernobyl", "Rabbi Nachum of Chernobyl", "רבי נחום מטשערנאביל", ["Rav Nachum of Chernobyl", "Reb Nachum of Chernobyl", "R' Nachum of Chernobyl", "the Chernobyler Maggid", "the Me'or Einayim"]],
  ["rabbi-mendel-of-rimanov", "Rabbi Menachem Mendel of Rimanov", "רבי מנחם מענדל מרימנוב", ["Rabbi Mendel of Rimanov", "Reb Mendel of Rimanov", "the Rimanover"]],
  ["rabbi-mendel-of-vitebsk", "Rabbi Menachem Mendel of Vitebsk", "רבי מנחם מענדל מוויטבסק", ["Reb Mendel of Vitebsk"]],
  ["rabbi-naftali-of-ropshitz", "Rabbi Naftali of Ropshitz", "רבי נפתלי מראפשיץ", ["Reb Naftali of Ropshitz", "the Ropshitzer", "the Ropshitzer Rav", "the Zera Kodesh"]],
  ["rabbi-shlomo-of-karlin", "Rabbi Shlomo of Karlin", "רבי שלמה מקרלין", ["R' Shlomo of Karlin", "Reb Shlomo of Karlin"]],
  ["rabbi-aharon-of-karlin", "Rabbi Aharon of Karlin", "רבי אהרן מקרלין", ["R' Aharon of Karlin", "the Beis Aharon (Rabbi Aharon of Karlin)"]],
  ["rabbi-mordechai-of-lechovitch", "Rabbi Mordechai of Lechovitch", "רבי מרדכי מלעכוויטש", ["R' Mordechai of Lechovitch", "the Lechovitcher", "the Lechovitcher Rebbe"]],
  ["rebbe-reb-bunim", "Rebbe Reb Bunim of Peshischa", "הרבי ר' בונם מפשיסחא", ["Rebbe Reb Bunim"]],
  ["kotzker-rebbe", "the Kotzker Rebbe", "הקאצקער רבי", ["the Kotzker"]],
  ["rabbi-shalom-of-belz", "Rabbi Shalom of Belz", "רבי שלום מבעלז", ["Rabbi Sholom of Belz", "Rav Shalom of Belz", "Reb Shalom of Belz", "Rebbe Shalom of Belz", "the Sar Shalom"]],
  ["ruzhiner", "the Ruzhiner Rebbe", "הרוזינער רבי", ["the Ruzhiner", "the Rizhiner", "Rabbi Yisrael of Ruzhin"]],
  ["sanzer-rav", "the Sanzer Rav", "הצאנזער רב", ["the Sanzer Rav (Divrei Chaim)", "the Divrei Chaim", "the Divrei Chaim of Sanz"]],
  ["chiddushei-harim", "the Chiddushei HaRim", "החידושי הרי\"ם", ["Chiddushei HaRim", "the Chidushei HaRim"]],
  ["sfas-emes", "the Sfas Emes", "השפת אמת", ["Sfas Emes"]],
  ["imrei-emes", "the Imrei Emes", "האמרי אמת", ["the Imrei Emes (Gerrer Rebbe)", "the Imrei Emes of Ger"]],
  ["gerrer-rebbe", "the Gerrer Rebbe", "הגערער רבי", ["the Gerer Rebbe"]],
  ["bnei-yissaschar", "the Bnei Yissaschar", "הבני יששכר", ["Bnei Yissaschar"]],
  ["yismach-moshe", "the Yismach Moshe", "הישמח משה", ["Yismach Moshe"]],
  ["satmar-rav", "the Satmar Rav", "הסאטמארער רב", ["the Satmar Rav (Divrei Yoel)", "the Satmar Rebbe", "the Divrei Yoel"]],
  ["bluzhever-rebbe", "the Bluzhever Rebbe", "הבלאזשובער רבי", ["the Bluzhever Rav"]],
  ["stoliner-rebbe", "the Stoliner Rebbe", "הסטאלינער רבי", ["the Stoliner Rebbe, Rabbi Yochanan"]],
  ["rav-tzadok-hakohen", "Rav Tzadok HaKohen of Lublin", "רבי צדוק הכהן מלובלין", ["Rabbi Tzadok HaKohen", "Rabbi Tzadok HaKohen of Lublin", "Reb Tzadok HaKohen", "Rav Tzadok HaKohen"]],
  ["chofetz-chaim", "the Chofetz Chaim", "החפץ חיים", ["the Chafetz Chaim", "Chofetz Chaim"]],
  ["magen-avraham", "the Magen Avraham", "המגן אברהם", ["Magen Avraham"]],
  ["rema", "the Rema", "הרמ\"א", ["Rema"]],
  ["yitav-lev", "the Yitav Lev", "הייטב לב", ["the Yetev Lev"]],
  ["rabbi-yechezkel-of-kuzmir", "Rabbi Yechezkel of Kuzmir", "רבי יחזקאל מקוזמיר", ["Reb Yechezkel of Kuzmir"]],
  ["rabbi-samson-raphael-hirsch", "Rabbi Samson Raphael Hirsch", "רבי שמשון רפאל הירש", ["Rav Samson Raphael Hirsch", "Rav Shimshon Raphael Hirsch"]],
  ["rabbi-yisrael-salanter", "Rabbi Yisrael Salanter", "רבי ישראל סלנטר", ["R' Yisrael Salanter"]],
  ["rabbi-yosef-chaim-sonnenfeld", "Rabbi Yosef Chaim Sonnenfeld", "רבי יוסף חיים זוננפלד", ["R' Yosef Chaim Sonnenfeld", "Rav Yosef Chaim Sonnenfeld"]],
  ["rabbi-elchonon-wasserman", "Rabbi Elchonon Wasserman", "רבי אלחנן וסרמן", ["R' Elchonon Wasserman", "Rav Elchonon Wasserman", "Reb Elchonon Wasserman"]],
  ["rabbi-nosson-adler", "Rabbi Nosson Adler", "רבי נתן אדלר", ["Rav Nosson Adler"]],
  ["rabbi-akiva-eiger", "Rabbi Akiva Eiger", "רבי עקיבא איגר", ["R' Akiva Eiger"]],
  ["rav-shraga-feivel-mendlowitz", "Rav Shraga Feivel Mendlowitz", "רבי שרגא פייוועל מענדלאוויטש", ["Reb Shraga Feivel Mendlowitz"]],
  ["rabbi-nachman-of-breslov", "Rabbi Nachman of Breslov", "רבי נחמן מברסלב", ["Rebbe Nachman of Breslov", "Rabbi Nachman of Breslov"]],
];

export const PEOPLE: readonly Person[] = ROWS.map(([key, en, he, aliases, exactOnly]) => ({
  key,
  en,
  he,
  yi: he,
  aliases: [en, ...aliases],
  ...(exactOnly === true ? { exactOnly: true } : {}),
}));
