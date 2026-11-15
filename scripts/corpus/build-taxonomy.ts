// Corpus stage P7: topic taxonomy. Pure code, no LLM at run time: the tree and the phrase rules
// below were written by hand (by an agent) after reading data/derived/corpus/raw/topics.json.
//
// Reads (read-only): data/derived/corpus/raw/topics.json
// Writes: data/derived/corpus/topics.json            (Topic[]; description null, shiurCount 0,
//                                                    hubShiurIds [] - filled by later steps)
//         data/derived/corpus/topic-alias-map.json   ({ "<raw phrase>": "<topic id>" })
//
// How it works: every raw candidate-topic phrase is matched against RULES in order (first match
// wins). A leaf whose mapped phrases reach fewer than MIN_SHIURIM distinct shiurim is folded into
// its parent (its phrases move up), repeatedly, so every published leaf stands on its own.
//
// Usage: npx tsx scripts/corpus/build-taxonomy.ts [--report]

import { readFileSync, writeFileSync } from "node:fs";
import type { Topic } from "../../src/corpus-types.js";

const RAW_PATH = "data/derived/corpus/raw/topics.json";
const OUT_TOPICS = "data/derived/corpus/topics.json";
const OUT_ALIASES = "data/derived/corpus/topic-alias-map.json";
const MIN_SHIURIM = 8;
const MAX_ALIASES = 40;
/** Leaves kept below MIN_SHIURIM: a whole catalog series covers them, so retagging will reach 8. */
const KEEP = new Set(["pidyon-haben"]);

interface RawTopic {
  phrase: string;
  count: number;
  shiurIds: string[];
  sampleTitles: string[];
}

/** [id, parentId, en, yi, he?, extra aliases?] */
type NodeDef = [string, string | null, string, string, (string | undefined)?, string[]?];

// ---------------------------------------------------------------------------------------------
// The tree. Order inside a parent does not matter (output is sorted by level, then label).
// ---------------------------------------------------------------------------------------------
const NODES: NodeDef[] = [
  // 1. Emunah
  ["emunah", null, "Emunah", "אמונה", "אמונה", ["faith", "belief in hashem"]],
  ["emunah-peshutah", "emunah", "Simple Emunah, Above Reason", "אמונה פשוטה, למעלה פון שכל", "אמונה פשוטה", ["simple faith", "emunah above daas"]],
  ["emunah-safek-amalek", "emunah", "Doubts in Emunah and Amalek", "ספיקות אין אמונה און עמלק", "ספק ועמלק", ["doubt", "amalek and doubt"]],
  ["hashgacha-pratis", "emunah", "Hashgacha Pratis", "השגחה פרטית", "השגחה פרטית", ["hashgachah pratis", "divine providence"]],
  ["nissim-veteva", "emunah", "Miracles and Nature", "ניסים און טבע", "נס וטבע", ["hidden miracles", "above nature"]],
  ["hester-panim", "emunah", "Hester Panim and Suffering", "הסתר פנים און יסורים", "הסתר פנים", ["hiding of the face"]],
  ["maaseh-bereishis", "emunah", "Creation and Its Wonders", "מעשה בראשית און די נפלאות הבריאה", "מעשה בראשית", ["creation", "ten utterances of creation"]],
  ["bitachon", "emunah", "Bitachon", "בטחון", "בטחון", ["bitochon", "trust in hashem"]],
  ["yesodei-haemunah", "emunah", "Foundations of Emunah", "יסודי האמונה", "יסודי האמונה", ["foundations of emunah"]],
  ["schar-veonesh", "emunah", "Reward, Olam HaBa and Techiyas HaMeisim", "שכר ועונש, עולם הבא און תחיית המתים", "שכר ועונש", ["olam haba", "techiyas hameisim"]],

  // 2. Tefilah
  ["tefilah", null, "Tefilah", "תפילה", "תפילה", ["tefillah", "davening", "prayer"]],
  ["kavanah-betefilah", "tefilah", "Kavanah in Davening", "כוונה אין דאווענען", "כוונת התפילה", ["kavanah in tefillah", "avodah shebalev"]],
  ["koach-hatefilah", "tefilah", "The Power of Tefilah", "דער כח פון תפילה", "כח התפילה", ["power of tefillah", "crying out to hashem"]],
  ["seder-hatefilah", "tefilah", "The Order of Davening", "סדר התפילה", "סדר התפילה", ["siddur"]],
  ["pesukei-dezimra", "seder-hatefilah", "Pesukei DeZimra", "פסוקי דזמרה", "פסוקי דזמרה", ["pesukei d'zimra", "pesukei dezimrah"]],
  ["krias-shema", "seder-hatefilah", "Krias Shema", "קריאת שמע", "קריאת שמע", ["shema"]],
  ["shemoneh-esrei", "seder-hatefilah", "Shemoneh Esrei", "שמונה עשרה", "שמונה עשרה", ["amidah"]],
  ["tefilah-betzibbur", "tefilah", "Davening with the Tzibbur and the Beis HaKnesses", "דאווענען מיט'ן ציבור און דער בית הכנסת", "תפילה בציבור", ["minyan", "talking in shul"]],
  ["tehillim", "tefilah", "Tehillim", "תהלים", "תהלים", ["psalms"]],
  ["hodaah", "tefilah", "Thanks and Praise to Hashem", "הודאה און שבח צום אייבערשטן", "הודאה", ["gratitude to hashem", "hakaras hatov"]],
  ["brachos", "tefilah", "Brachos", "ברכות", "ברכות", ["berachos", "blessings"]],

  // 3. Tanya and Chassidus
  ["chassidus", null, "Tanya and Chassidus", "תניא און חסידות", "תניא וחסידות", ["chassidus", "kabbalah"]],
  ["tanya", "chassidus", "Sefer HaTanya", "ספר התניא", "ספר התניא", ["tanya", "likutei amarim"]],
  ["tanya-shtei-nefashos", "tanya", "The Two Souls (Tanya ch. 1-8)", "די צוויי נפשות (תניא פרקים א-ח)", "שתי הנפשות", ["two souls", "nefesh habahamis", "nefesh elokis"]],
  ["tanya-tzaddik-beinoni-rasha", "tanya", "Tzaddik, Beinoni and Rasha (Tanya ch. 9-17)", "צדיק, בינוני און רשע (תניא פרקים ט-יז)", "צדיק בינוני ורשע", ["the beinoni", "mind ruling the heart"]],
  ["tanya-ahavah-mesuteres", "tanya", "Ahavah Mesuteres (Tanya ch. 18-25)", "אהבה מסותרת (תניא פרקים יח-כה)", "אהבה מסותרת", ["hidden love", "ahavah mesuteres"]],
  ["tanya-simcha", "tanya", "Simcha and Lowliness (Tanya ch. 26-34)", "שמחה און שפלות (תניא פרקים כו-לד)", "שמחה ושפלות", ["atzvus"]],
  ["kedushah-vekelipah", "chassidus", "Kedushah and Kelipah", "קדושה און קליפה", "קדושה וקליפה", ["kelipas nogah", "sitra achra"]],
  ["sefiros", "chassidus", "The Sefiros", "די ספירות", "עשר ספירות", ["ten sefiros", "middos elyonos"]],
  ["olamos-tzimtzum", "chassidus", "Tzimtzum, the Worlds and the Merkavah", "צמצום, עולמות און די מרכבה", "צמצום ועולמות", ["four worlds", "tzimtzum", "sheviras hakeilim"]],
  ["shemos-hakedoshim", "chassidus", "The Holy Names of Hashem", "די שמות הקדושים", "שמות הקדושים", ["names of hashem", "shem havayah"]],
  ["shechinah", "chassidus", "The Shechinah and Galus HaShechinah", "די שכינה און גלות השכינה", "שכינה וגלות השכינה", ["shechinah in exile"]],
  ["neshamos", "chassidus", "Neshamos and Gilgulim", "נשמות און גלגולים", "נשמות וגלגולים", ["souls"]],
  ["gilgulim", "neshamos", "Gilgulim and Tikkun HaNeshamos", "גלגולים און תיקון הנשמות", "גלגולים ותיקון הנשמות", ["gilgul", "reincarnation", "ibbur"]],
  ["madreigos-haneshamah", "neshamos", "Levels and Root of the Soul", "די מדריגות און דער שורש פון דער נשמה", "שורש הנשמה ומדרגותיה", ["root of the soul", "nefesh ruach neshamah"]],
  ["ohr-haganuz", "chassidus", "The Hidden Light", "אור הגנוז", "אור הגנוז", ["ohr haganuz", "or haganuz"]],
  ["sheva-ushmoneh", "chassidus", "Seven and Eight: Nature and Above", "שבע און אכט: טבע און למעלה פון טבע", "שבע ושמונה", ["number eight above nature"]],

  // 4. Avodas Hashem
  ["avodas-hashem", null, "Avodas Hashem", "עבודת השם", "עבודת השם", ["serving hashem"]],
  ["yiras-shamayim", "avodas-hashem", "Yiras Shamayim", "יראת שמים", "יראת שמים", ["fear of heaven", "yiras hashem"]],
  ["ahavas-hashem", "avodas-hashem", "Ahavas Hashem and Dveikus", "אהבת השם און דביקות", "אהבת השם ודביקות", ["love of hashem", "dveikus"]],
  ["simcha", "avodas-hashem", "Serving Hashem with Simcha", "עבודת השם בשמחה", "שמחה", ["joy", "serving hashem with joy"]],
  ["anavah-bittul", "avodas-hashem", "Anavah and Bittul", "ענוה און ביטול", "ענוה וביטול", ["humility", "bittul"]],
  ["mesiras-nefesh", "avodas-hashem", "Mesiras Nefesh", "מסירת נפש", "מסירת נפש", ["mesirus nefesh", "self-sacrifice"]],
  ["yetzer-hara", "avodas-hashem", "The Yetzer Hara and Nisyonos", "דער יצר הרע און נסיונות", "יצר הרע ונסיונות", ["yetzer hara", "nisyonos", "bechirah"]],
  ["teshuvah", "avodas-hashem", "Teshuvah", "תשובה", "תשובה", ["repentance", "baalei teshuvah"]],
  ["hischadshus", "avodas-hashem", "Renewal in Avodas Hashem", "התחדשות אין עבודת השם", "התחדשות", ["renewal", "freshness in avodas hashem"]],
  ["zerizus", "avodas-hashem", "Zerizus and the Value of Time", "זריזות און די ווערט פון צייט", "זריזות", ["value of time"]],
  ["avodah-begashmiyus", "avodas-hashem", "Serving Hashem in Physical Life", "עבודה בגשמיות", "עבודה בגשמיות", ["eating l'shem shamayim", "raising sparks", "birurim"]],
  ["middos", "avodas-hashem", "Middos Tovos", "מידות טובות", "תיקון המידות", ["good middos", "anger", "jealousy"]],
  ["shlichus-hanefesh", "avodas-hashem", "A Person's Mission in the World", "דער תפקיד פון א מענטש אויף דער וועלט", "שליחות", ["shlichus", "a person's mission"]],
  ["machshavah-dibur", "avodas-hashem", "Thought and the Power of Speech", "מחשבה און דער כח הדיבור", "מחשבה ודיבור", ["power of speech", "lashon hara", "shmiras halashon"]],
  ["niggun-shirah", "avodas-hashem", "Niggun and Shirah", "ניגון און שירה", "ניגון ושירה", ["niggunim", "song", "music"]],

  // 5. Torah
  ["torah", null, "Torah and Limud HaTorah", "תורה און לימוד התורה", "תלמוד תורה", ["torah study", "learning torah"]],
  ["torah-lishmah", "torah", "Torah Lishmah and Hasmadah", "תורה לשמה און התמדה", "תורה לשמה והתמדה", ["learning lishmah", "toil in torah", "bittul torah"]],
  ["maalas-hatorah", "torah", "The Power and Greatness of Torah", "דער כח און די מעלה פון תורה", "מעלת התורה", ["power of torah", "torah as protection", "torah and tefillah"]],
  ["torah-min-hashamayim", "torah", "Torah Min HaShamayim and the Mesorah", "תורה מן השמים און די מסורה", "תורה מן השמים", ["mesorah", "oral torah"]],
  ["pardes", "torah", "Pshat, Remez, Drush and Sod", "פשט, רמז, דרש און סוד", 'פרד"ס', ["pnimiyus hatorah", "secrets of the torah"]],
  ["otiyos-gematria", "torah", "Letters, Gematria and Lashon HaKodesh", "אותיות, גימטריא און לשון הקודש", "אותיות וגימטריאות", ["gematria", "lashon hakodesh"]],
  ["talmidei-chachamim", "torah", "Kavod HaTorah and Talmidei Chachamim", "כבוד התורה און תלמידי חכמים", "כבוד התורה", ["talmidei chachamim"]],
  ["pirkei-avos", "torah", "Pirkei Avos", "פרקי אבות", "פרקי אבות", ["avos"]],

  // 6. Shabbos
  ["shabbos", null, "Shabbos Kodesh", "שבת קודש", "שבת קודש", ["shabbos", "shabbat"]],
  ["hachanah-leshabbos", "shabbos", "Preparing for Shabbos", "הכנה צו שבת", "הכנה לשבת", ["preparing for shabbos", "erev shabbos"]],
  ["kabbalas-shabbos", "shabbos", "Kabbalas Shabbos and Shabbos Night", "קבלת שבת און שבת צו נאכטס", "קבלת שבת", ["mizmor shir l'yom hashabbos", "lecha dodi"]],
  ["oneg-shabbos", "shabbos", "Oneg Shabbos and Kavod Shabbos", "עונג שבת און כבוד שבת", "עונג שבת", ["oneg shabbos", "kavod shabbos"]],
  ["kedushas-shabbos", "shabbos", "Kedushas Shabbos", "קדושת שבת", "קדושת שבת", ["neshamah yeseirah", "kedushas hashabbos"]],
  ["shalosh-seudos", "shabbos", "Shalosh Seudos", "שלש סעודות", "שלש סעודות", ["seudah shelishis"]],
  ["melave-malka", "shabbos", "Melave Malka", "מלוה מלכה", "מלוה מלכה", ["melaveh malkah"]],
  ["shmiras-shabbos", "shabbos", "Shmiras Shabbos and Its Halachos", "שמירת שבת און אירע הלכות", "שמירת שבת", ["hilchos shabbos", "reshus harabim"]],

  // 7. Zmanim
  ["zmanim", null, "Yomim Tovim and Zmanim", "ימים טובים און זמנים", "מועדים וזמנים", ["yomim tovim", "moadim"]],
  ["yamim-noraim", "zmanim", "Elul and the Yomim Noraim", "אלול און ימים נוראים", "ימים נוראים", ["high holidays"]],
  ["elul", "yamim-noraim", "Chodesh Elul", "חודש אלול", "חודש אלול", ["elul"]],
  ["rosh-hashanah", "yamim-noraim", "Rosh Hashanah", "ראש השנה", "ראש השנה", ["rosh hashana", "shofar"]],
  ["aseres-yemei-teshuvah", "yamim-noraim", "Aseres Yemei Teshuvah", "עשרת ימי תשובה", "עשרת ימי תשובה", ["ten days of teshuvah", "shabbos shuvah"]],
  ["yom-kippur", "yamim-noraim", "Yom Kippur", "יום כיפור", "יום הכיפורים", ["yom hakippurim"]],
  ["sukkos-shemini-atzeres", "zmanim", "Sukkos and Shemini Atzeres", "סוכות און שמיני עצרת", "סוכות ושמיני עצרת", []],
  ["sukkos", "sukkos-shemini-atzeres", "Sukkos", "סוכות", "חג הסוכות", ["sukkah", "ushpizin", "arba minim"]],
  ["hoshana-rabbah", "sukkos-shemini-atzeres", "Hoshana Rabbah", "הושענא רבה", "הושענא רבה", ["hoshanah rabbah"]],
  ["shemini-atzeres", "sukkos-shemini-atzeres", "Shemini Atzeres and Simchas Torah", "שמיני עצרת און שמחת תורה", "שמיני עצרת ושמחת תורה", ["simchas torah"]],
  ["chanukah", "zmanim", "Chanukah", "חנוכה", "חנוכה", ["hanukkah"]],
  ["neros-chanukah", "chanukah", "The Chanukah Lights", "די חנוכה ליכט", "נר חנוכה", ["chanukah lights", "menorah"]],
  ["nes-chanukah", "chanukah", "The Miracle of Chanukah and the Greeks", "דער נס חנוכה און די יוונים", "נס חנוכה", ["chashmonaim", "greek wisdom", "yavan"]],
  ["zos-chanukah", "chanukah", "Zos Chanukah", "זאת חנוכה", "זאת חנוכה", []],
  ["chodesh-kislev", "chanukah", "Chodesh Kislev and Yud-Tes Kislev", "חודש כסלו און י\"ט כסלו", "חודש כסלו", ["kislev", "19 kislev"]],
  ["purim-adar", "zmanim", "Purim and Chodesh Adar", "פורים און חודש אדר", "פורים וחודש אדר", []],
  ["purim", "purim-adar", "Purim", "פורים", "פורים", ["drinking on purim", "matanos la'evyonim"]],
  ["megillas-esther", "purim-adar", "Megillas Esther", "מגילת אסתר", "מגילת אסתר", ["the megillah", "mordechai and esther"]],
  ["purim-katan", "purim-adar", "Purim Katan and the Leap Year", "פורים קטן און שנת העיבור", "פורים קטן", ["adar rishon", "leap year"]],
  ["shushan-purim", "purim-adar", "Shushan Purim", "שושן פורים", "שושן פורים", ["purim meshulash"]],
  ["chodesh-adar", "purim-adar", "Chodesh Adar", "חודש אדר", "חודש אדר", ["adar"]],
  ["arba-parshiyos", "purim-adar", "The Four Parshiyos", "די ארבע פרשיות", "ארבע פרשיות", ["parshas shekalim", "parshas zachor", "parshas parah", "parshas hachodesh"]],
  ["pesach", "zmanim", "Pesach and Chodesh Nissan", "פסח און חודש ניסן", "פסח וחודש ניסן", ["passover"]],
  ["chodesh-nissan", "pesach", "Chodesh Nissan", "חודש ניסן", "חודש ניסן", ["nisan", "rosh chodesh nissan"]],
  ["chametz", "pesach", "Chametz and Preparing for Pesach", "חמץ און די הכנה צו פסח", "ביעור חמץ", ["bedikas chametz", "chametz and the yetzer hara"]],
  ["matzah", "pesach", "Matzah, the Food of Emunah", "מצה, מיכלא דמהימנותא", "מצה", ["matzah as the food of emunah"]],
  ["leil-haseder", "pesach", "The Seder Night", "ליל הסדר", "ליל הסדר", ["seder", "four cups", "haggadah"]],
  ["pesach-sheni", "pesach", "Pesach Sheni", "פסח שני", "פסח שני", ["pesach sheini"]],
  ["sefirah-lag-baomer", "zmanim", "Sefiras HaOmer and Lag BaOmer", "ספירת העומר און ל\"ג בעומר", "ספירת העומר", []],
  ["sefiras-haomer", "sefirah-lag-baomer", "Sefiras HaOmer", "ספירת העומר", "ספירת העומר", ["sefirah", "omer"]],
  ["lag-baomer", "sefirah-lag-baomer", "Lag BaOmer and Rabbi Shimon bar Yochai", "ל\"ג בעומר און רבי שמעון בר יוחאי", 'ל"ג בעומר', ["rabbi shimon bar yochai", "rashbi", "meron"]],
  ["shavuos", "zmanim", "Shavuos and Matan Torah", "שבועות און מתן תורה", "שבועות", ["shavuot"]],
  ["hachanah-lekabbalas-hatorah", "shavuos", "Preparing for Kabbalas HaTorah", "הכנה צו קבלת התורה", "הכנה לקבלת התורה", ["preparation for shavuos"]],
  ["matan-torah", "shavuos", "Matan Torah at Har Sinai", "מתן תורה ביי הר סיני", "מתן תורה", ["kabbalas hatorah", "har sinai", "naaseh v'nishma"]],
  ["megillas-rus", "shavuos", "Megillas Rus", "מגילת רות", "מגילת רות", ["megillas ruth"]],
  ["bein-hametzarim", "zmanim", "The Three Weeks and Tisha B'Av", "בין המצרים און תשעה באב", "בין המצרים", ["the three weeks"]],
  ["tisha-bav", "bein-hametzarim", "Tisha B'Av", "תשעה באב", "תשעה באב", ["tisha b'av", "shabbos chazon"]],
  ["tammuz-av", "bein-hametzarim", "Chodashim Tammuz and Av", "די חדשים תמוז און אב", "תמוז ואב", ["shiva asar b'tammuz", "the nine days"]],
  ["tu-bav-nechamah", "bein-hametzarim", "Tu B'Av and the Weeks of Nechamah", "ט\"ו באב און די שבעה דנחמתא", 'ט"ו באב', ["shabbos nachamu", "fifteenth of av"]],
  ["choref", "zmanim", "Shovavim, Teves and Shevat", "שובבי\"ם, טבת און שבט", 'שובבי"ם', []],
  ["shovavim", "choref", "Shovavim", "שובבי\"ם", 'שובבי"ם', ["shovevim"]],
  ["chodesh-teves", "choref", "Chodesh Teves and Asarah B'Teves", "חודש טבת און עשרה בטבת", "חודש טבת", ["asarah b'teves", "tekufas teves", "nittel"]],
  ["tu-bishvat", "choref", "Tu B'Shvat", "ט\"ו בשבט", 'ט"ו בשבט', ["tu bishvat", "rosh hashanah for trees"]],
  ["rosh-chodesh", "zmanim", "Rosh Chodesh and the Months", "ראש חודש און די חדשים", "ראש חודש", ["kiddush hachodesh", "the moon", "the jewish calendar"]],

  // 8. Parsha
  ["parsha", null, "Parshas HaShavua", "פרשת השבוע", "פרשת השבוע", ["weekly parsha", "sedra"]],
  ["sefer-bereishis", "parsha", "Sefer Bereishis", "ספר בראשית", "ספר בראשית", ["genesis"]],
  ["adam-harishon", "sefer-bereishis", "Adam HaRishon and Gan Eden", "אדם הראשון און גן עדן", "אדם הראשון", ["parshas bereishis", "eitz hadaas"]],
  ["noach-mabul", "sefer-bereishis", "Noach and the Mabul", "נח און דער מבול", "נח והמבול", ["parshas noach", "the flood"]],
  ["avraham-avinu", "sefer-bereishis", "Avraham Avinu", "אברהם אבינו", "אברהם אבינו", ["parshas lech lecha", "parshas vayera"]],
  ["akeidah", "sefer-bereishis", "Akeidas Yitzchak", "עקידת יצחק", "עקידת יצחק", ["the akeidah"]],
  ["chayei-sarah", "sefer-bereishis", "Chayei Sarah and Me'aras HaMachpelah", "חיי שרה און מערת המכפלה", "חיי שרה ומערת המכפלה", ["parshas chayei sarah"]],
  ["yaakov-veesav", "sefer-bereishis", "Yitzchak, Yaakov and Esav", "יצחק, יעקב און עשו", "יעקב ועשו", ["parshas toldos"]],
  ["yaakov-velavan", "sefer-bereishis", "Yaakov, Lavan and the Imahos", "יעקב, לבן און די אמהות", "יעקב ולבן", ["parshas vayetzei", "parshas vayishlach", "rachel and leah"]],
  ["yosef-veechav", "sefer-bereishis", "Yosef and His Brothers", "יוסף און זיינע ברידער", "יוסף ואחיו", ["parshas vayeshev", "parshas mikeitz", "parshas vayigash"]],
  ["yehuda-vetamar", "sefer-bereishis", "Yehuda and Tamar", "יהודה און תמר", "יהודה ותמר", []],
  ["vayechi-shevatim", "sefer-bereishis", "Vayechi and the Shevatim", "ויחי און די שבטים", "ויחי והשבטים", ["parshas vayechi", "the tribes"]],
  ["sefer-shemos", "parsha", "Sefer Shemos", "ספר שמות", "ספר שמות", ["exodus"]],
  ["galus-mitzrayim-makkos", "sefer-shemos", "Galus Mitzrayim and the Makkos", "גלות מצרים און די מכות", "גלות מצרים והמכות", ["parshas shemos", "parshas va'eira", "parshas bo", "ten plagues"]],
  ["krias-yam-suf", "sefer-shemos", "Krias Yam Suf and the Mann", "קריעת ים סוף און דער מן", "קריעת ים סוף", ["parshas beshalach", "splitting of the sea", "shiras hayam"]],
  ["mishpatim", "sefer-shemos", "Mishpatim", "משפטים", "משפטים", ["parshas mishpatim", "eved ivri"]],
  ["mishkan", "sefer-shemos", "The Mishkan and the Kohanim", "דער משכן און די כהנים", "המשכן", ["parshas terumah", "parshas tetzaveh", "bigdei kehunah"]],
  ["cheit-haegel", "sefer-shemos", "The Golden Calf and the Thirteen Middos", "חטא העגל און די י\"ג מידות", "חטא העגל", ["parshas ki sisa", "thirteen attributes of mercy"]],
  ["sefer-vayikra", "parsha", "Sefer Vayikra", "ספר ויקרא", "ספר ויקרא", ["leviticus"]],
  ["sefer-bamidbar", "parsha", "Sefer Bamidbar", "ספר במדבר", "ספר במדבר", ["numbers"]],
  ["meraglim", "sefer-bamidbar", "The Meraglim", "די מרגלים", "חטא המרגלים", ["parshas shelach", "the spies"]],
  ["korach", "sefer-bamidbar", "Korach and Machlokes", "קרח און מחלוקת", "קרח", ["parshas korach"]],
  ["balak-pinchas", "sefer-bamidbar", "Balak, Bilam and Pinchas", "בלק, בלעם און פנחס", "בלק ופנחס", ["parshas balak", "parshas pinchas", "zimri"]],
  ["sefer-devarim", "parsha", "Sefer Devarim", "ספר דברים", "ספר דברים", ["deuteronomy", "mishneh torah"]],
  ["moshe-rabbeinu", "parsha", "Moshe Rabbeinu", "משה רבינו", "משה רבינו", ["moshe"]],

  // 9. Galus and Geulah
  ["geulah", null, "Galus and Geulah", "גלות און גאולה", "גלות וגאולה", ["redemption", "exile"]],
  ["ikvesa-dimeshicha", "geulah", "Ikvesa DiMeshicha", "עקבתא דמשיחא", "עקבתא דמשיחא", ["ikvesa d'meshicha", "footsteps of moshiach", "chevlei moshiach"]],
  ["simanei-ikvesa", "ikvesa-dimeshicha", "Signs of the Generation Before Moshiach", "די סימנים פונעם דור פאר משיח", "סימני עקבתא דמשיחא", ["chevlei moshiach", "signs of moshiach", "birth pangs of moshiach"]],
  ["avodas-dor-haacharon", "ikvesa-dimeshicha", "Avodah of the Last Generation", "די עבודה פונעם לעצטן דור", "עבודת הדור האחרון", ["emunah in the generation before moshiach", "tefillah before moshiach"]],
  ["moshiach", "geulah", "Moshiach and the Days of Moshiach", "משיח און ימות המשיח", "ימות המשיח", ["mashiach", "days of moshiach", "light of moshiach"]],
  ["ketz-hageulah", "geulah", "The Time of the Geulah and the Ketz", "די צייט פון דער גאולה און דער קץ", "קץ הגאולה", ["calculating the ketz", "end of days"]],
  ["shoresh-moshiach", "geulah", "The Hidden Roots of Moshiach", "דער באהאלטענער שורש פון משיח", "שורש נשמת משיח", ["lineage of moshiach", "sparks of moshiach"]],
  ["tachlis-hagalus", "geulah", "Galus as Preparation for Geulah", "גלות אלס הכנה צו גאולה", "תכלית הגלות", ["purpose of galus", "galus rooted in geulah"]],
  ["moshiach-ben-yosef", "geulah", "Moshiach ben Yosef and Moshiach ben Dovid", "משיח בן יוסף און משיח בן דוד", "משיח בן יוסף ומשיח בן דוד", []],
  ["tzipisa-liyeshua", "geulah", "Awaiting Moshiach", "ווארטן אויף משיח", "ציפית לישועה", ["waiting for moshiach", "hope for moshiach"]],
  ["gog-umagog", "geulah", "The War of Gog UMagog", "די מלחמה פון גוג ומגוג", "מלחמת גוג ומגוג", ["gog and magog"]],
  ["galus-haumos", "geulah", "The Exiles and Their Kingdoms", "די גלותן און די מלכיות", "ארבע מלכיות", ["four exiles", "galus edom", "galus yishmael"]],
  ["beis-hamikdash-churban", "geulah", "The Beis HaMikdash and Its Churban", "דער בית המקדש און דער חורבן", "בית המקדש וחורבנו", ["churban", "beis hamikdash"]],
  ["churban-europa", "geulah", "The Churban of Europe and Persecutions", "חורבן אייראפע און גזירות", "חורבן אירופה", ["the holocaust", "persecutions"]],
  ["nisyonos-hador", "geulah", "Challenges of Our Generation", "די נסיונות פונעם דור", "נסיונות הדור", ["assimilation", "haskalah", "zionism"]],

  // 10. Eretz Yisroel
  ["eretz-yisroel", null, "Eretz Yisroel", "ארץ ישראל", "ארץ ישראל", ["eretz yisrael", "land of israel"]],
  ["kedushas-eretz-yisroel", "eretz-yisroel", "Kedushas Eretz Yisroel", "קדושת ארץ ישראל", "קדושת ארץ ישראל", ["holiness of eretz yisroel"]],
  ["yerushalayim", "eretz-yisroel", "Yerushalayim and the Kosel", "ירושלים און דער כותל", "ירושלים עיר הקודש", ["jerusalem", "kosel maaravi"]],
  ["mekomos-hakedoshim", "eretz-yisroel", "The Holy Places", "די מקומות הקדושים", "מקומות הקדושים", ["kever rachel", "meron", "chevron"]],
  ["shemitah-yovel", "eretz-yisroel", "Shemitah and Yovel", "שמיטה און יובל", "שמיטה ויובל", ["shemittah", "jubilee"]],
  ["nissim-beretz-yisroel", "eretz-yisroel", "Miracles and Wars in Eretz Yisroel", "ניסים און מלחמות אין ארץ ישראל", "ניסים בארץ ישראל", ["six day war"]],
  ["yishuv-eretz-yisroel", "eretz-yisroel", "Traveling to and Living in Eretz Yisroel", "פארן קיין ארץ ישראל און וואוינען דארט", "ישוב ארץ ישראל", ["aliyah", "love of eretz yisroel"]],

  // 11. Klal Yisroel
  ["klal-yisroel", null, "Klal Yisroel", "כלל ישראל", "כלל ישראל", ["the jewish people"]],
  ["ahavas-yisroel", "klal-yisroel", "Ahavas Yisroel and Achdus", "אהבת ישראל און אחדות", "אהבת ישראל ואחדות", ["ahavas yisrael", "unity of klal yisrael"]],
  ["maalas-yisroel", "klal-yisroel", "The Greatness of Every Jew", "די מעלה פון יעדן איד", "מעלת ישראל", ["pintele yid", "hashem's love for every jew"]],
  ["pintele-yid", "klal-yisroel", "The Pintele Yid: The Inner Point of Every Jew", "דער פינטעלע איד: די פנימיות'דיגע נקודה פון יעדן איד", "הנקודה הפנימית שבכל יהודי", ["pintele yid", "inner point", "the hidden point in every jew"]],
  ["ahavas-hashem-leyisroel", "klal-yisroel", "Hashem's Love for Klal Yisroel", "דעם אייבערשטנס אהבה צו כלל ישראל", "אהבת השם לישראל", ["hashem's love for the jewish people", "children of hashem"]],
  ["netzach-yisroel", "klal-yisroel", "Netzach Yisroel", "נצח ישראל", "נצח ישראל", ["eternity of the jewish people"]],
  ["bein-adam-lachaveiro", "klal-yisroel", "Bein Adam LaChaveiro", "בין אדם לחבירו", "בין אדם לחבירו", ["kavod habriyos", "machlokes"]],
  ["umos-haolam", "klal-yisroel", "Yisroel and the Nations", "אידן און די אומות העולם", "ישראל והעמים", ["the nations", "seventy nations"]],

  // 12. Bris Milah and Simchos
  ["simchos", null, "Bris Milah and Simchos", "ברית מילה און שמחות", "ברית מילה ושמחות", ["lifecycle"]],
  ["bris-milah", "simchos", "Bris Milah", "ברית מילה", "ברית מילה", ["milah", "bris"]],
  ["kisei-eliyahu", "simchos", "Eliyahu HaNavi at the Bris", "אליהו הנביא ביי דער ברית", "כסא של אליהו", ["eliyahu hanavi at the bris"]],
  ["kriyas-shem", "simchos", "Naming a Child", "קריאת שם פאר א קינד", "קריאת השם", ["a person's name", "naming"]],
  ["pidyon-haben", "simchos", "Pidyon HaBen", "פדיון הבן", "פדיון הבן", ["firstborn"]],
  ["bar-mitzvah", "simchos", "Bar Mitzvah", "בר מצוה", "בר מצוה", []],
  ["shidduchim-chasunah", "simchos", "Shidduchim and Chasunah", "שידוכים און חתונה", "שידוכים וחתונה", ["hachnasas kallah", "wedding"]],
  ["bayis-neeman", "simchos", "The Jewish Home and Shalom Bayis", "א אידישע שטוב און שלום בית", "בית נאמן בישראל", ["shalom bayis", "the jewish home"]],

  // 13. Kedushah and Taharah
  ["kedushah", null, "Kedushah and Taharah", "קדושה און טהרה", "קדושה וטהרה", ["holiness", "purity"]],
  ["shmiras-einayim", "kedushah", "Shmiras Einayim", "שמירת עינים", "שמירת עינים", ["guarding the eyes"]],
  ["shmiras-habris", "kedushah", "Shmiras HaBris", "שמירת הברית", "שמירת הברית", ["kedushas habris"]],
  ["tznius", "kedushah", "Tznius", "צניעות", "צניעות", ["modesty"]],
  ["tumah-taharah", "kedushah", "Tumah, Taharah and Mikveh", "טומאה, טהרה און מקוה", "טומאה וטהרה", ["mikveh", "mikvah"]],
  ["kashrus", "kedushah", "Kashrus and Kedushas HaAchilah", "כשרות און קדושת האכילה", "כשרות", ["forbidden foods"]],

  // 14. Mitzvos
  ["mitzvos", null, "Mitzvos", "מצוות", 'תרי"ג מצוות', ["613 mitzvos"]],
  ["tefillin", "mitzvos", "Tefillin", "תפילין", "תפילין", []],
  ["tzitzis", "mitzvos", "Tzitzis", "ציצית", "ציצית", []],
  ["tzedakah-chesed", "mitzvos", "Tzedakah, Chesed and Hachnasas Orchim", "צדקה, חסד און הכנסת אורחים", "צדקה וחסד", ["tzedakah", "hachnasas orchim"]],
  ["kibud-av-vaem", "mitzvos", "Kibud Av VaEm", "כיבוד אב ואם", "כיבוד אב ואם", ["honoring parents"]],
  ["korbanos", "mitzvos", "Korbanos and Avodas HaMikdash", "קרבנות און עבודת בית המקדש", "קרבנות", ["kohen gadol", "ketores"]],
  ["taamei-hamitzvos", "mitzvos", "The Reasons and Power of the Mitzvos", "טעמי המצוות און דער כח פון א מצוה", "טעמי המצוות", ["reasons for mitzvos"]],

  // 15. Tzaddikim
  ["tzaddikim", null, "Tzaddikim and Maasios", "צדיקים און מעשיות", "צדיקים", ["tzaddikim"]],
  ["maasios", "tzaddikim", "Stories of Tzaddikim", "מעשיות פון צדיקים", "מעשיות", ["stories of tzaddikim", "chassidic stories"]],
  ["baal-shem-tov-talmidim", "tzaddikim", "The Baal Shem Tov and His Talmidim", "דער בעל שם טוב און זיינע תלמידים", "הבעל שם טוב ותלמידיו", ["the baal shem tov", "the maggid of mezritch", "the alter rebbe"]],
  ["rebbes-hador", "tzaddikim", "The Rebbes of Later Generations", "די רביים פון שפעטערדיגע דורות", "צדיקי הדורות", ["the sanzer rav", "the satmar rav", "the ruzhiner rebbe"]],
  ["hiskashrus-tzaddikim", "tzaddikim", "Hiskashrus to Tzaddikim and Emunas Chachamim", "התקשרות צו צדיקים און אמונת חכמים", "התקשרות לצדיקים", ["emunas chachamim", "daas torah"]],
  ["histalkus-tzaddik", "tzaddikim", "The Passing of a Tzaddik", "די הסתלקות פון א צדיק", "הסתלקות הצדיק", ["yahrzeit", "hilula"]],
  ["gedolei-yisroel", "tzaddikim", "Chazal and Gedolei Yisroel", "חז\"ל און גדולי ישראל", "חז\"ל וגדולי ישראל", ["the chofetz chaim", "the chasam sofer", "rabbi akiva"]],

  // 16. Neviim and Kesuvim
  ["nach", null, "Neviim and Kesuvim", "נביאים און כתובים", 'נ"ך', ["nach", "tanach"]],
  ["dovid-hamelech", "nach", "Dovid HaMelech and Malchus Beis Dovid", "דוד המלך און מלכות בית דוד", "דוד המלך ומלכות בית דוד", ["david hamelech", "malchus"]],
  ["shlomo-hamelech", "nach", "Shlomo HaMelech", "שלמה המלך", "שלמה המלך", []],
  ["eliyahu-hanavi", "nach", "Eliyahu HaNavi", "אליהו הנביא", "אליהו הנביא", ["elijah"]],
  ["shir-hashirim", "nach", "Shir HaShirim", "שיר השירים", "שיר השירים", ["song of songs"]],
  ["neviim", "nach", "The Neviim and Their Times", "די נביאים און זייערע צייטן", "נביאים", ["yirmiyahu", "shmuel hanavi"]],

  // 17. Chinuch and Bachurim
  ["chinuch", null, "Chinuch and Bachurim", "חינוך און בחורים", "חינוך", ["education", "bachurim"]],
  ["chinuch-habanim", "chinuch", "Chinuch HaBanim", "חינוך הבנים", "חינוך הבנים", ["chinuch of children", "talks to children"]],
  ["bein-hazmanim", "chinuch", "Summer and Bein HaZmanim", "זומער און בין הזמנים", "בין הזמנים", ["summer vacation", "camp"]],
  ["chaveirim-sevivah", "chinuch", "Friends and Environment", "חברים און די סביבה", "השפעת הסביבה", ["influence of friends"]],
  ["technology", "chinuch", "Technology and the Internet", "טעכנאלאגיע און דער אינטערנעט", undefined, ["smartphones", "internet"]],
  ["yeshivah-bachurim", "chinuch", "Bachurim in Yeshivah", "בחורים אין ישיבה", "ישיבה", ["yeshiva", "chizuk for bachurim"]],
];

// ---------------------------------------------------------------------------------------------
// Rules: tested in order against the match form of each phrase (lowercase, apostrophes dropped,
// hyphens and punctuation as spaces). First match wins. Specific before general.
// ---------------------------------------------------------------------------------------------
const MOSHIACH = "(moshiach|mashiach|meshiach|messiah|meshicha|mashiah|moshiach s|mashiachs|moshiachs)";
const YISRAEL = "(yisrael|yisroel|israel)";
const TEFILAH = "(tefillah|tefilah|tefila|tefilla|tefillos|tefilos|davening|daven|prayer|prayers|praying)";
const SHABBOS = "(shabbos|shabbat|sabbath|shabbosos)";

function chapterLeaf(n: number): string {
  if (n <= 8) return "tanya-shtei-nefashos";
  if (n <= 17) return "tanya-tzaddik-beinoni-rasha";
  if (n <= 25) return "tanya-ahavah-mesuteres";
  if (n <= 34) return "tanya-simcha";
  return "tanya";
}

type Rule = [RegExp, string | ((m: RegExpMatchArray) => string)];
const r = (src: string): RegExp => new RegExp(src);

const RULES: Rule[] = [
  // --- Tanya chapters and Tanya-specific concepts ---
  [r("\\b(tanya|likutei amarim)\\b.*\\b(chapter|perek|ch)\\s*(\\d+)"), (m) => chapterLeaf(Number(m[3]))],
  [r("\\b(chapter|perek)\\s*(\\d+)\\b.*\\btanya\\b"), (m) => chapterLeaf(Number(m[2]))],
  [r("\\b(introduction to tanya|tanya introduction|hakdamah)\\b"), "tanya"],
  [r("\\b(iggeres hakodesh|shaar hayichud|igeres hakodesh|iggeres hateshuvah)\\b"), "tanya"],
  [r("\\b(beinoni|beinonim|benoni)\\b"), "tanya-tzaddik-beinoni-rasha"],
  [r("\\btzaddik\\b.*\\brasha\\b|\\brasha\\b.*\\btzaddik\\b|\\btzaddik gamur\\b|tzaddik v ?ra lo|rasha v ?tov lo"), "tanya-tzaddik-beinoni-rasha"],
  [r("\\b(mind|moach)\\b.*\\b(heart|lev)\\b|\\bmoach shalit\\b|\\bmoach\\b.*\\blev\\b"), "tanya-tzaddik-beinoni-rasha"],
  [r("\\b(ahavah mesuteres|ahava mesuteres|hidden love|ahavah hamesuteres)\\b"), "tanya-ahavah-mesuteres"],
  [r("\\b(every|each) sin (as|is) (idolatry|avodah zarah)|\\bavodah zarah\\b.*\\bsin\\b"), "tanya-ahavah-mesuteres"],
  [r("\\b(two souls|g ?dly soul|godly soul|animal soul|nefesh habahamis|nefesh elokis|nefesh haelokis|nefesh hachiyunis|divine soul|nefesh hasheni)\\b"), "tanya-shtei-nefashos"],
  [r("\\b(garments of the soul|levushim|thought,? speech and (deed|action)|machshavah,? dibur)\\b"), "tanya-shtei-nefashos"],
  [r("\\b(timtum halev|tumtum halev|atzvus|sadness|marirus|bitterness|lowliness|shiflus|merirus)\\b"), "tanya-simcha"],
  [r("\\b(dirah b ?tachtonim|dira btachtonim|dwelling (place )?(for hashem )?(in the )?(lower|below)|dirah)\\b"), "tanya"],

  // --- Kabbalah / chassidus concepts ---
  [r("\\b(kelipas nogah|kelipas noga|klipas nogah|klipas noga|kelipah|kelipos|klipos|klipah|klipa|kelipa|sitra achra|three impure|shalosh kelipos|kelipas)\\b"), "kedushah-vekelipah"],
  [r("\\b(ohr haganuz|or haganuz|hidden light|ohr ganuz)\\b"), "ohr-haganuz"],
  [r("\\b(gilgul\\w*|reincarnat\\w*|ibbur|dybbuk|dibbuk|yibum|tikkun (of )?(the )?(souls?|neshamos)|tikun (of )?(the )?souls?)\\b"), "gilgulim"],
  [r("\\b(gilgul|gilgulim|reincarnation|ibbur|dybbuk|dibbuk|tikkun (of )?(the )?souls?|souls? (rooted|root)|root of (the |his |a |each |one s )?souls?|shoresh haneshamah|levels of (the )?souls?|nefesh,? ruach|nefesh ruach|neshamah|neshama|souls of)\\b"), "madreigos-haneshamah"],
  [r("\\b(sefiros|sefirot|sefiras? (chesed|gevurah|tiferes|netzach|hod|yesod|malchus|chochmah|binah)|chesed and (gevurah|din)|chesed,? gevurah|chochmah,? (and )?binah|chochmah binah|netzach and hod|netzach,? hod|hod sheb\\w*|yesod sheb\\w*|malchus sheb\\w*|midas hadin|middas hadin|midas harachamim|middas harachamim|din v ?rachamim|tiferes|middah of hod|middah of yesod|keser|kesser|chabad,? chagas|mochin|chesed sheb\\w*|gevurah sheb\\w*|middos elyonos|the middah of)\\b"), "sefiros"],
  [r("\\b(shechinah|shechina|schechinah|galus hashechinah|kudsha brich hu)\\b"), "shechinah"],
  [r("\\b(shem havay\\w*|havay\\w*|names? of hashem|hashem s names?|hashem s name|shem hashem|shemos hakedoshim|holy names?|elokim|adnus|combinations of|permutations of|tziruf|milui|42 letter|72 names|ana b ?koach|ana bekoach|four letter name|name of g ?d|divrei elokim)\\b"), "shemos-hakedoshim"],
  [r("\\b(tzimtzum|four worlds|olamos|atzilus|beriah,? yetzirah|olam ha(atzilus|beriah|yetzirah|asiyah)|shem havay\\w*|havay\\w*|place,? time and soul|olam,? shanah,? nefesh|olam shanah nefesh|sefer yetzirah|names of hashem|hashem s names?|name of hashem|shem hashem|shemos hakedoshim|elokim|tetragrammaton|shechinah|shechina|makif|pnimi|kings of edom|shevirah|shevirat|sheviras hakeilim|breaking of the vessels|olam hatikkun|olam hatohu|tohu|ein sof|or ein sof|seder hishtalshelus|hishtalshelus|achorayim|merkavah|merkava|anochi)\\b"), "olamos-tzimtzum"],
  [r("\\b(bris milah|bris mila|brit milah|milah|mila|circumcision|bris)\\b.*\\b(eighth|8th)\\b|\\b(eighth|8th) day\\b.*\\b(milah|bris)\\b"), "bris-milah"],
  [r("\\b(seven and eight|eighth day above|number eight|eight (and|above) nature|eighth level|seven and (the )?eighth|shemonah|seven and seventy|the eighth|above (seven|nature and the eighth))\\b"), "sheva-ushmoneh"],

  // --- Zmanim (specific days first) ---
  [r("\\bshovavim|shovevim|shovovim\\b"), "shovavim"],
  [r("\\b(zos chanukah|zot chanukah|zos chanuka)\\b"), "zos-chanukah"],
  [r("\\b(19|yud ?tes|nineteenth( of)?) kislev|kislev\\b"), "chodesh-kislev"],
  [r("\\b(chanukah|chanuka|hanukkah|chanukkah)\\b.*\\b(lights?|candles?|menorah|neros?|lighting|oil|ten tefachim|tefachim|window|doorway|wick)|\\b(menorah|neros chanukah|ner chanukah|hadlakas)\\b.*\\bchanuk|below ten tefachim|chanukah lights|al hanisim|maoz tzur|haneros halalu"), "neros-chanukah"],
  [r("\\b(chashmonaim|chashmonayim|greeks?|yavan|yevanim|chanukah miracle|miracle of chanukah|matisyahu|antiochus|hellenism|hellenist)\\b"), "nes-chanukah"],
  [r("\\b(chanukah|chanuka|hanukkah|chanukkah|chanukas hamizbeach)\\b"), "chanukah"],
  [r("\\bshushan purim|purim meshulash|meshulash\\b"), "shushan-purim"],
  [r("\\bpurim katan|adar rishon|adar sheni|adar beis|adar alef|leap year|shanah meuberes|shana meuberes|ibur hashanah|two adars\\b"), "purim-katan"],
  [r("\\b(parshas|parashas)? ?(shekalim|zachor|parah)\\b|\\bparshas hachodesh|hachodesh hazeh|\\bfour parshiyos|arba parshiyos|machatzis hashekel|half shekel|parah adumah|red heifer"), "arba-parshiyos"],
  [r("\\b(megillas esther|megillah|megilla|megilas esther|esther|mordechai|haman|achashverosh|achashveirosh|vashti|shushan|ad dlo yada|ad dlo yoda|matanos l ?evyonim|matanos laevyonim|mishloach manos|shalach manos)\\b"), "megillas-esther"],
  [r("\\bpurim\\b"), "purim"],
  [r("\\badar\\b"), "chodesh-adar"],
  [r("\\bpesach sheni|pesach sheini|pesach katan\\b"), "pesach-sheni"],
  [r("\\b(shvii shel pesach|shevii shel pesach|shvi i shel pesach|acharon shel pesach|seventh day of pesach|last days of pesach|shviI shel pesach)\\b"), "pesach"],
  [r("\\b(leil haseder|seder night|the seder|pesach seder|seder plate|seders|four cups|arba kosos|haggadah|hagadah|ha lachma|mah nishtanah|ma nishtana|four sons|afikoman|maror|haseivah|leaning|charoses|dayeinu|korban pesach)\\b"), "leil-haseder"],
  [r("\\b(chametz|chometz|bedikas|biur|bittul chametz|leaven|erev pesach|preparing for pesach|preparation for pesach|thirty days before pesach|kashering)\\b"), "chametz"],
  [r("\\b(matzah|matzos|matza|matzo|lechem oni|michla dimheimnusa|mitzvah of matzah)\\b"), "matzah"],
  [r("\\b(nissan|nisan|nesiim|first twelve days|twelve days of nissan|birkas ha ?ilanos)\\b"), "chodesh-nissan"],
  [r("\\b(lag baomer|lag b ?omer|lag laomer|rabbi shimon bar yochai|rashbi|reb shimon bar yochai|rabbi shimon|bar yochai|meron|meiron|the zohar|zohar)\\b"), "lag-baomer"],
  [r("\\b(sefiras|sefiras haomer|sefirah|sefira|haomer|omer|counting the omer|forty nine days|49 days|students of rabbi akiva|talmidei rabbi akiva|iyar|iyyar)\\b"), "sefiras-haomer"],
  [r("\\b(megillas rus|megillas ruth|rus|ruth|naomi|boaz|orpah)\\b"), "megillas-rus"],
  [r("\\b(preparation for (shavuos|matan torah|kabbalas hatorah|receiving the torah)|preparing for (shavuos|matan torah|kabbalas hatorah|the torah)|before (shavuos|matan torah)|shloshes yemei hagbalah|three days of preparation|sheloshes yemei|rosh chodesh sivan|sivan)\\b"), "hachanah-lekabbalas-hatorah"],
  [r("\\b(matan torah|kabbalas hatorah|giving of the torah|receiving the torah|har sinai|mount sinai|mt sinai|maamad har sinai|naaseh v ?nishma|naase v ?nishma|aseres hadibros|ten commandments|anochi hashem|revelation at sinai|sinai)\\b"), "matan-torah"],
  [r("\\b(shavuos|shavuot|akdamus|tikkun leil|azharos|fiftieth day|shavuos night)\\b"), "shavuos"],
  [r("\\b(tisha b ?av|tisha bav|tisha baav|9 av|ninth of av|shabbos chazon|kinnos|kinos|eicha|eichah|lamentations)\\b"), "tisha-bav"],
  [r("\\b(tu b ?av|fifteenth of av|15 av|nachamu|shiva dnechemta|seven (weeks|haftaros) of (consolation|nechamah)|nechamah|consolation)\\b"), "tu-bav-nechamah"],
  [r("\\b(three weeks|bein hametzarim|bein hamitzarim|between the straits|nine days|tammuz|tamuz|tamuz and av|seventeenth of tammuz|shiva asar|month of av|menachem av|chodesh av)\\b"), "tammuz-av"],
  [r("\\b(tu b ?shvat|tu bishvat|tu bshevat|fifteenth of shevat|shevat|shvat|rosh hashanah (for|of) (the )?trees|seven species|shivas haminim)\\b"), "tu-bishvat"],
  [r("\\b(teves|tevet|asarah b ?teves|asara b ?teves|tekufas|tekufah|nittel|nitel|xmas|christmas)\\b"), "chodesh-teves"],
  [r("\\b(hoshana rabbah|hoshanah rabbah|hoshana raba|hoshanos|aravah|aravos|hoshana)\\b"), "hoshana-rabbah"],
  [r("\\b(shemini atzeres|shmini atzeres|simchas torah|simchat torah|hakafos|vezos habracha|v zos habracha)\\b"), "shemini-atzeres"],
  [r("\\b(sukkos|sukkot|succos|sukkah|succah|sukka|ushpizin|lulav|esrog|etrog|arba minim|four species|simchas beis hashoevah|simchas beis hashoeivah|clouds of glory|ananei hakavod|seventy bulls|water libation|nisuch hamayim|seven shepherds)\\b"), "sukkos"],
  [r("\\b(yom kippur|yom hakippurim|yom kipur|kol nidrei|neilah|ne ilah|erev yom kippur|kohen gadol|kodesh hakodashim|holy of holies|ketores|seir hamishtaleach|vidui|kaparos|kapparos)\\b"), "yom-kippur"],
  [r("\\b(aseres yemei teshuvah|aseres yemei|ten days of (teshuvah|repentance|awe)|shabbos shuvah|shabbos teshuvah|shuvah yisrael|tzom gedaliah|fast of gedaliah)\\b"), "aseres-yemei-teshuvah"],
  [r("\\b(rosh hashanah|rosh hashana|rosh hashono|shofar|shofros|shofaros|malchiyos|zichronos|tekias|tekiah|tashlich|yom hadin|yom teruah|day of judgment|haras olam|hayom haras|king in the field)\\b"), "rosh-hashanah"],
  [r("\\b(elul|ellul|ani l ?dodi|ledovid hashem ori|l ?dovid hashem ori|le ?dovid|selichos|slichos|25 elul|twenty fifth of elul|forty days|kesivah vachasimah)\\b"), "elul"],
  [r("\\b(rosh chodesh|kiddush hachodesh|kiddush levanah|kiddush lavanah|birkas hachamah|birchas hachamah|the moon|moon|levanah|lunar|molad|calendar|months|month of|chodesh)\\b"), "rosh-chodesh"],

  // --- Shabbos ---
  [r("\\b(shalosh seudos|shalosh seudot|sholosh seudos|seudah shelishis|seudah shlishis|third meal|raava draavin|raavah draavin)\\b"), "shalosh-seudos"],
  [r("\\b(melave malka|melaveh malkah|melave malkah|melava malka|motzei shabbos|motzaei shabbos|havdalah|havdala)\\b"), "melave-malka"],
  [r("\\b(mizmor shir l ?yom hashabbos|mizmor shir leyom hashabbos|mizmor shir|kabbalas shabbos|kabolas shabbos|lecha dodi|lechu neranenah|shabbos candles|neros shabbos|candle lighting|friday night|leil shabbos|shabbos night|bameh madlikin|eishes chayil|tehillim 92|tehillim 93|hashem malach)\\b"), "kabbalas-shabbos"],
  [r("\\b(preparing for " + SHABBOS + "|preparation for " + SHABBOS + "|erev " + SHABBOS + "|prepar\\w* (for |before )?" + SHABBOS + "|hachanah l ?shabbos|teshuvah before " + SHABBOS + "|mikvah? (on|before) erev)"), "hachanah-leshabbos"],
  [r("\\b(oneg|kavod " + SHABBOS + "|honoring " + SHABBOS + "|honor of " + SHABBOS + "|kavod shabbos|zemiros|zmiros|shabbos (food|meal|seudah|delicacies|clothes|clothing)|seudas " + SHABBOS + "|cholent|kugel|shabbos table)\\b"), "oneg-shabbos"],
  [r("\\b(hilchos " + SHABBOS + "|halachos of " + SHABBOS + "|shmiras " + SHABBOS + "|shemiras " + SHABBOS + "|keeping " + SHABBOS + "|chillul " + SHABBOS + "|melachos|melacha|39 melachos|reshus harabim|reshus hayachid|eruv|techum|carrying|muktzah|speech on " + SHABBOS + "|speaking on " + SHABBOS + "|guarding speech on " + SHABBOS + "|shabbos observance|observing " + SHABBOS + ")\\b"), "shmiras-shabbos"],

  // --- Eretz Yisroel (specific) ---
  [r("\\b(shemitah|shmitah|shemittah|shmittah|shemita|shmita|yovel|jubilee|fifty years|sabbatical)\\b"), "shemitah-yovel"],
  [r("\\b(kever rachel|kever rochel|kever rochel imeinu|rachel s tomb|meoras hamachpelah|meoras hamachpela|mearas hamachpelah|mearas hamachpela|machpelah|machpela|chevron|hebron|tzfas|safed|teveria|tiberias|holy places|kivrei tzaddikim|graves of tzaddikim|kever)\\b"), "mekomos-hakedoshim"],
  [r("\\b(yerushalayim|yerushalaim|jerusalem|kosel|kotel|western wall|har habayis|temple mount|even shesiyah|even hashesiyah|foundation stone|tzion|zion|ir hakodesh)\\b"), "yerushalayim"],
  [r("\\b(six day war|yom kippur war|wars? (in|of) (eretz )?" + YISRAEL + "|gulf war|scud|miracles? (in|of) (eretz )?" + YISRAEL + "|israeli|israel defense|idf|army|soldiers|missiles?|intifada|terror|terrorist|arabs?)\\b"), "nissim-beretz-yisroel"],
  [r("\\b(aliyah|olim|making aliyah|moving to (eretz )?" + YISRAEL + "|trip to (eretz )?" + YISRAEL + "|travel(ing)? to (eretz )?" + YISRAEL + "|living in (eretz )?" + YISRAEL + "|longing for (eretz )?" + YISRAEL + "|love (of|for) (eretz )?" + YISRAEL + "|chibas (eretz )?" + YISRAEL + "|yishuv (haaretz|eretz)|settling (the land|eretz)|burial in (eretz )?" + YISRAEL + "|going up to)\\b"), "yishuv-eretz-yisroel"],
  [r("\\b(eretz " + YISRAEL + "|eretz hakodesh|the land|holy land|eretz canaan|kedushas haaretz|mitzvos hateluyos|bikkurim|terumos|maaseros|land of israel|chutz laaretz|outside the land)\\b"), "kedushas-eretz-yisroel"],

  // --- Geulah ---
  [r("\\b(gog umagog|gog u ?magog|gog and magog|milchemes gog)\\b"), "gog-umagog"],
  [r("\\b(moshiach|mashiach|meshiach|messiah) ben (yosef|dovid|david|dovid)|ben yosef and|ben dovid and|ben david and"), "moshiach-ben-yosef"],
  [r("^(the )?(ikvesa|ikveta|ikvisa) ?d?(i|e)?meshicha( generation)?$|^footsteps of moshiach$"), "ikvesa-dimeshicha"],
  [r("\\b(emunah|emes|tefillah|tefilah|tefila|prayer|avodah|teshuvah|torah|mesiras nefesh|chizuk|tests?|trials?|nisyonos|small deeds|counsel|bachurim|yetzer hara)\\b.*\\b(before (the coming of )?" + MOSHIACH + "|(last|final|lowest) generations?|ikvesa|ikvos|footsteps of|days before|time before|generation before)"), "avodas-dor-haacharon"],
  [r("\\b(calculat\\w*|dates?|ketz|keitz|kitzin|end of days|sixth millennium|5748|5760|predictions?|any day|delay)\\b"), "ketz-hageulah"],
  [r("\\b(ikvesa|ikvisa|ikveta|ikvos|ikvesa d ?meshicha|chevlei|birth pangs|footsteps of " + MOSHIACH + "|heels of " + MOSHIACH + "|signs of (the coming of )?" + MOSHIACH + "|generations? (before|of the footsteps|preceding)|last generations?|final generations?|end of days|acharis hayamim|before (the coming of )?" + MOSHIACH + "|face of the generation|pnei hador|darkness before|ikvesa dimeshicha)\\b"), "simanei-ikvesa"],
  [r("\\b(waiting for|awaiting|longing for|hoping for|hope for|anticipating|tzipisa|tzipiyah|yearning for|achakeh lo|bringing|hastening|bring|delaying) (the )?(" + MOSHIACH + "|geulah|redemption|yeshuah)"), "tzipisa-liyeshua"],
  [r("\\b(tzipisa|tzipiyah|tzipisa liyeshua)\\b"), "tzipisa-liyeshua"],
  [r("\\b(holocaust|churban europa|churban eiropa|hitler|nazis?|auschwitz|ghetto|world war|expulsion from spain|spanish inquisition|inquisition|crusades|pogroms?|chmielnicki|tach v ?tat|cantonists|communis\\w*|soviet|russia|stalin|antisemitism|anti semitism|persecution|persecutions|gezeiros|gzeiros|decrees)\\b"), "churban-europa"],
  [r("\\b(technology|internet|smartphones?|phones?|computers?|media|newspapers?|television|tv|radio|photography|cameras?)\\b"), "technology"],
  [r("\\b(assimilation|intermarriage|haskalah|maskilim|reform|zionis\\w*|zionist|secular|secularism|modern(ity)?|enlightenment|kefirah|apikorsus|apikores|heresy|heretics?|atheis\\w*|evolution|darwin|philosophy|philosophers?|chakirah|chochmah chitzonis|science|scientists?|university|college|culture|materialism|current events|the state|state of israel|medinah|government|democracy|america|american|galus america)\\b"), "nisyonos-hador"],
  [r("\\b(beis hamikdash|bais hamikdash|beis hamikdosh|temple|mikdash|churban|destruction|third beis|binyan|building the beis|rebuilding)\\b"), "beis-hamikdash-churban"],
  [r("\\b(four (exiles|kingdoms|galuyos|malchuyos)|arba malchiyos|galus (edom|yishmael|bavel|madai|yavan|mitzrayim)|edom|rome|romans?|yishmael|ishmael|eisav s descendants|persia|bavel|babylon|nebuchadnezzar|nevuchadnetzar|the exiles|kibbutz galuyos|ingathering|scattering)\\b"), "galus-haumos"],
  [r("\\b(lineage|line of|descend\\w* from|root of " + MOSHIACH + "|roots? of " + MOSHIACH + "|born in concealment|birth of " + MOSHIACH + "|sparks? of " + MOSHIACH + "|spark of " + MOSHIACH + "|soul of " + MOSHIACH + ")"), "shoresh-moshiach"],
  [r("\\b(galus|golus|exile)\\b.*\\b(geulah|redemption|preparation|rooted|containing|purpose|shlichus|growth)\\b|\\b(geulah|redemption)\\b.*\\b(galus|golus|exile)\\b|purpose of (the )?(galus|exile)"), "tachlis-hagalus"],
  [r("\\b(techiyas|tchiyas|techiyas hameisim|resurrection|luz bone)\\b"), "schar-veonesh"],
  [r("\\b(" + MOSHIACH + "|yemos hamashiach|yemos hamoshiach|geulah|geula|redemption|redeemer|goel|ketz|keitz)"), "moshiach"],

  [r("\\b(passing of|histalkus|hilulah|petirah|death of tzaddikim|yahrzeit|yahrtzeit|yohrzeit|hilula|hillula|day of (a )?(tzaddik s )?(passing|death)|death of (a )?tzaddik|hesped|eulogy|mourning|aveilus|shiva)\\b"), "histalkus-tzaddik"],
  [r("\\b(attachment to|cleaving to|hiskashrus( to)?|hiskashrut( to)?|connecting to|bond with|bond between|receiving from|learning from|need for) (the |a )?(talmid and |tzaddik|tzaddikim|talmidei chachamim|rebbe|the rebbe|rebbi)|\\bemunas chachamim|emunas tzaddikim|daas torah|tzaddik of the generation|tzaddik hador|tzaddikim of the generation|rebbe and chassid|rebbe and chassidim|going to the rebbe|traveling to the rebbe|hidden tzaddik|lamed vav|thirty six hidden|world exists for the tzaddik|tzaddik yesod olam|power of (the )?tzaddik|tzaddik decrees|blessing of a tzaddik|brachah of a tzaddik"), "hiskashrus-tzaddikim"],
  [r("\\b(baal shem tov|ba al shem tov|baal shem|besht|maggid of mezritch|maggid of mezeritch|mezritch|mezeritch|maggid s (students|disciples|talmidim)|rebbe elimelech|reb elimelech|rebbe reb elimelech|noam elimelech|lizhensk|chozeh|lublin|lubliner|alter rebbe|baal hatanya|ba al hatanya|rebbe reb zusha|zusha|berditchev|levi yitzchak|kedushas levi|reb pinchas of koretz|koretz|polnoye|toldos yaakov yosef|chassidim and misnagdim|misnagdim|spread\\w* (the teachings of )?chassidus|chassidic movement|early chassidim|derech of the ba al shem tov)\\b"), "baal-shem-tov-talmidim"],
  [r("\\b(baal shem tov|ba al shem tov|baal shem|besht|maggid of mezritch|maggid of mezeritch|mezritch|mezeritch|rebbe elimelech|reb elimelech|noam elimelech|lizhensk|chozeh|lublin|alter rebbe|baal hatanya|rebbe reb zusha|zusha|berditchev|levi yitzchak|ruzhin|ruzhiner|sanz|sanzer|divrei chaim|satmar|satmarer|belz|belzer|bluzhev|bluzhever|kotzk|kotzker|vizhnitz|vizhnitzer|ropshitz|apta|apter|ohev yisrael|rimanov|lelov|karlin|karliner|chernobyl|lubavitch|lubavitcher|rebbe maharash|tzemach tzedek|sfas emes|chiddushei harim|imrei emes|gerrer|gur|bnei yissaschar|dinov|kedushas levichassidic rebbes?|rebbes|rebbe|sassov|sassover|shomer emunim|toldos aharon|chassidic dynast\\w*|chabad|slonim|breslov|reb nachman|rebbe nachman)\\b"), "rebbes-hador"],
  [r("\\b(stories|story|maaseh(?! bereishis)|maasios|maaseh with|tale|tales|parable of the)\\b"), "maasios"],
  // --- Simchos ---
  [r("\\b(eliyahu)\\b.*\\b(bris|milah|kisei|chair)\\b|\\bkisei eliyahu|kisei shel eliyahu|chair of eliyahu|eliyahu.*covenant"), "kisei-eliyahu"],
  [r("\\b(pidyon haben|pidyon habein|pidyon|redemption of the firstborn|redeeming the firstborn|petter chamor|peter chamor|firstborn son)\\b"), "pidyon-haben"],
  [r("\\b(bar mitzvah|bar mitzva|bar mitzvos|thirteen years|age of thirteen|thirteenth birthday|tefillin for the first time)\\b"), "bar-mitzvah"],
  [r("\\b(shidduch|shidduchim|shiduch|shadchan|chassan|chosson|chasan|kallah|kalah|wedding|chasunah|chupah|chuppah|marriage|marry|marrying|sheva brachos|engagement|hachnasas kallah|bride|groom|zivug|zivugim)\\b"), "shidduchim-chasunah"],
  [r("\\b(shalom bayis|husband|wife|wives|jewish home|the home|home as|bayis neeman|chanukas habayis|housewarming|family|mother|mothers|women|woman|akeres habayis|nashim)\\b"), "bayis-neeman"],
  [r("\\b(naming|names? (of|for) (a|the) (child|baby|newborn)|the name|a name|his name|person s name|names and|name and|power of a name|named after)\\b"), "kriyas-shem"],
  [r("\\b(bris milah|bris mila|brit milah|milah|mila|circumcision|circumcised|bris|orlah|periah|sandek|sandak|mohel|eighth day|chasan damim|uncircumcised|covenant of abraham)\\b"), "bris-milah"],

  // --- Kedushah ---
  [r("\\b(shmiras einayim|shemiras einayim|shmiras ainayim|guarding (the|one s|your) eyes|eyes|seeing forbidden|looking)\\b"), "shmiras-einayim"],
  [r("\\b(shmiras habris|shemiras habris|kedushas habris|kedushas yesod|pgam habris|pegam|tikkun habris|tikun habris|wasted seed|zera levatalah|yesod)\\b"), "shmiras-habris"],
  [r("\\b(tznius|tzeniyus|tzenius|tznius|modesty|immodesty|clothing|dress)\\b"), "tznius"],
  [r("\\b(mikveh|mikvah|mikva|tevilah|tevilas|immersion|tumah|tumas|tumeah|taharah|tahara|purity|impurity|tamei|tahor|metzora|tzaraas|niddah|tumas meis|seder taharos|forty nine gates|49 gates|fiftieth gate|gates of (impurity|tumah))\\b"), "tumah-taharah"],
  [r("\\b(kashrus|kosher|treif|treifah|neveilah|nevelah|forbidden foods?|maachalos asuros|chalav akum|cholov yisroel|chalav yisrael|hechsher|hechsherim|blood|basar bechalav|meat and milk|shechitah|shechita|kedushah in food)\\b"), "kashrus"],

  // --- Mitzvos ---
  [r("\\b(tefillin|tfillin|teffilin|rabbeinu tam)\\b"), "tefillin"],
  [r("\\b(tzitzis|tzitzit|techeiles|techeles|tallis|talis)\\b"), "tzitzis"],
  [r("\\b(tzedakah|tzedaka|charity|maaser|chesed|gemilus chasadim|hachnasas orchim|guests|hospitality|kindness|giving to others|poor|aniyim|hashavas aveidah|loans?|lending)\\b"), "tzedakah-chesed"],
  [r("\\b(kibud av|kibbud av|honoring (one s )?parents|honor(ing)? (your|his) father|parents|father and mother)\\b"), "kibud-av-vaem"],
  [r("\\b(korbanos|korban|korbonos|(?<!self )sacrifices?|offerings?|olah|shelamim|chatas|mizbeach|altar|lechem hapanim|showbread|menorah|ketores|incense|nesachim|kohanim|kohen|kehunah|avodah in the beis hamikdash|terumas hadeshen|todah)\\b"), "korbanos"],
  [r("\\b(613|taryag|reasons? (for|of) (the )?mitzvos|taamei hamitzvos|chukim|chok|chukah|mitzvos? as|power of (a )?mitzvah|mitzvah of|time bound mitzvos|mitzvos and|mitzvah and|the mitzvos|mitzvos|mitzvah|mitzvot|commandments)\\b"), "taamei-hamitzvos"],

  // --- Tzaddikim ---

  // --- Nach ---
  [r("\\b(shir hashirim|song of songs|shir hashirim s|canticles)\\b"), "shir-hashirim"],
  [r("\\b(eliyahu|elijah|eliyahu hanavi|eliyahu hanovi|elisha)\\b"), "eliyahu-hanavi"],
  [r("\\b(shlomo hamelech|shlomo|solomon|koheles|kohelles|mishlei|ecclesiastes)\\b"), "shlomo-hamelech"],
  [r("\\b(dovid hamelech|david hamelech|dovid|david|malchus beis (dovid|david)|beis dovid|house of david|king david|batsheva|bas sheva|avigail|naval|golyas|goliath|yehonasan|yonasan|shaul and dovid)\\b"), "dovid-hamelech"],
  [r("\\b(yirmiyahu|yirmiyah|jeremiah|yeshayahu|yeshaya|isaiah|yechezkel|ezekiel|yonah|jonah|shmuel|samuel|shaul|saul|shimshon|samson|chana|hannah|devorah|yehoshua|joshua|gideon|eli hakohen|chizkiyahu|menashe|achav|izevel|jezebel|navi|neviim|nevi im|prophet|prophets|prophecy|nevuah|hoshea|malachi|zechariah|chaggai|daniel|ezra|nechemiah|shoftim|judges|trei asar|yericho|jericho|agag|amos|micha|ovadiah|yoel)\\b"), "neviim"],

  // --- Parsha (specific narratives) ---
  [r("\\b(akeidah|akeidas|akeida|akedah|akedas|binding of yitzchak|binding of isaac|ram of the akeidah)\\b"), "akeidah"],
  [r("\\b(yehudah?|judah)\\b.*\\btamar\\b|\\btamar\\b"), "yehuda-vetamar"],
  [r("\\b(meraglim|spies|miraglim|sin of the spies|chet hameraglim|kalev|calev|yehoshua and kalev)\\b"), "meraglim"],
  [r("\\b(korach|korah|dasan|aviram|machlokes|machlokes l ?shem shamayim|dispute|controversy|strife)\\b"), "korach"],
  [r("\\b(balak|bilam|bilaam|bil am|pinchas|pinchos|pinhas|zimri|kozbi|zealotry|zealot|kanaus|kanoim|baal peor|bnos tzelafchad|daughters of tzelafchad|bilam s donkey|mah tovu)\\b"), "balak-pinchas"],
  [r("\\b(golden calf|egel|eigel|chet haegel|cheit haegel|sin of the calf|thirteen (attributes|middos)|13 (attributes|middos)|yud gimmel middos|shelosh esrei middos|luchos|tablets)\\b"), "cheit-haegel"],
  [r("\\b(mishkan|tabernacle|bigdei kehunah|priestly garments|aron|kapores|keruvim|cherubim|choshen|efod|bezalel|betzalel|vayakhel|pekudei|terumah|tetzaveh|tzaveh|shulchan)\\b"), "mishkan"],
  [r("\\b(splitting of the sea|krias yam suf|kriyas yam suf|yam suf|red sea|the sea|shiras hayam|az yashir|shirah|mann|manna|man from heaven|beshalach|amalek attacked|refidim|marah|be shalach)\\b"), "krias-yam-suf"],
  [r("\\b(mishpatim|eved ivri|amah ivriah|hebrew slave|damages|nezikin|four (primary )?categories of damage|shor|bor|ox|jewish servant|ear piercing)\\b"), "mishpatim"],
  [r("\\b(yosef|joseph|potiphar|potifar|sale of yosef|mechiras yosef|yosef s dreams|binyamin|benjamin|mikeitz|miketz|mikketz|vayigash|vayeshev|vayeishev|brothers|shevatim sold|reuven|dudaim|ben zekunim|sar hamashkim|sar haofim|butler|baker|pharaoh s dream)\\b"), "yosef-veechav"],
  [r("\\b(makkos|makos|makkas|makas|plagues?|frogs?|tzefardea|barad|hail|bechoros|firstborn of egypt|pharaoh|paroh|pharoah|par oh|moshe and aharon|burning bush|sneh|shibud|slavery in (egypt|mitzrayim)|bondage|enslavement|beis avadim|galus mitzrayim|egyptian exile|exile in egypt|egypt|mitzrayim|yetzias|exodus)\\b"), "galus-mitzrayim-makkos"],
  [r("\\b(adam harishon|adam and chava|chava|eve|gan eden|garden of eden|eitz hadaas|etz hadaas|tree of knowledge|tree of life|eitz hachaim|nachash|snake|serpent|kayin|cain|hevel|abel|sin of adam|cheit adam|first man|bereishis|bereshis|beraishis|six days of creation|seventh day)\\b"), "adam-harishon"],
  [r("\\b(noach|noah|mabul|flood|teivah|tevah|lateivah|ark|dor hamabul|generation of the flood|dor haflagah|tower of bavel|migdal bavel|rainbow|keshes|cham|shem and yefes|yefes)\\b"), "noach-mabul"],
  [r("\\b(chayei sarah|chaye sarah|sarah imeinu|sarah s|eliezer|rivkah|rivka|rebecca|besuel|ephron|efron)\\b"), "chayei-sarah"],
  [r("\\b(avraham|abraham|avram|lech lecha|lech l ?cha|vayera|vayeira|vayeirah|sedom|sodom|lot|hagar|malki ?tzedek|four kings|bris bein habesarim|nisyonos of avraham|ten tests|ur kasdim|terach|yishmael s)\\b"), "avraham-avinu"],
  [r("\\b(yaakov|jacob|lavan|laban|rachel|leah|imahos|matriarchs|vayetzei|vayeitzei|vayeitze|vayishlach|dina|dinah|shechem|wrestl\\w*|angel of esav|sar shel esav|beis el|ladder|charan|bilhah|zilpah)\\b"), "yaakov-velavan"],
  [r("\\b(yitzchak|isaac|esav|eisav|esau|toldos|toldot|bechorah|birthright|brachos of yitzchak|blessings of yitzchak|wells)\\b"), "yaakov-veesav"],
  [r("\\b(vayechi|shevatim|tribes?|shevet|twelve sons|brachos of yaakov|yaakov s blessings|blessings of yaakov|dan|naftali|zevulun|yissachar|gad|asher|menashe|ephraim|efraim|serach|shimon and levi|levi|shevet levi)\\b"), "vayechi-shevatim"],
  [r("\\b(moshe rabbeinu|moshe rabeinu|moshe s|moses|moshe|humility of moshe|aharon|aharon hakohen|aaron|miriam)\\b"), "moshe-rabbeinu"],

  // --- Parsha names (fallback per sefer) ---
  [r("\\b(parshas|parashas|parshat|parasha|sedra|sidra)? ?(bereishis|bereshis|noach|lech lecha|vayera|vayeira|chayei sarah|toldos|vayetzei|vayeitzei|vayetze|vayishlach|vayeshev|mikeitz|miketz|vayigash|vayechi)\\b|\\bsefer bereishis|genesis"), "sefer-bereishis"],
  [r("\\b(parshas|parashas|parshat) (shemos|shmos|vaera|va eira|vaeira|bo|beshalach|beshalach|yisro|yitro|mishpatim|terumah|tetzaveh|ki sisa|ki tisa|vayakhel|pekudei)\\b|\\bsefer shemos"), "sefer-shemos"],
  [r("\\b(parshas|parashas|parshat) (vayikra|tzav|shemini|shmini|tazria|metzora|acharei|acharei mos|kedoshim|emor|behar|bechukosai|bechukotai|behar bechukosai)\\b|\\bsefer vayikra|\\b(tazria|metzora|kedoshim|kedoshim tihyu|emor|behar|bechukosai|bechukosay|megadef|ben ish mitzri|blasphemer|shlomis)\\b"), "sefer-vayikra"],
  [r("\\b(parshas|parashas|parshat) (bamidbar|naso|nasso|behaaloscha|behaalotcha|beha aloscha|shelach|shlach|korach|chukas|chukat|balak|pinchas|matos|masei|matos masei)\\b|\\bsefer bamidbar|\\b(naso|nasso|nazir|nezirus|sotah|birkas kohanim|priestly blessing|degalim|banners|behaaloscha|misonenim|complainers|mei merivah|mei meriva|rock|chukas|cities of refuge|arei miklat|masei|journeys|matos|vows|nedarim|og|sichon)\\b"), "sefer-bamidbar"],
  [r("\\b(parshas|parashas|parshat) (devarim|vaeschanan|va eschanan|eikev|ekev|reeh|re eh|shoftim|ki seitzei|ki teitzei|ki savo|ki tavo|nitzavim|vayelech|haazinu|ha azinu|vezos habracha)\\b|\\bsefer devarim|\\b(vaeschanan|eikev|ekev|reeh|shoftim|ki seitzei|ki teitzei|ki savo|ki tavo|nitzavim|vayelech|haazinu|ki karov|eglah arufah|ben sorer|yefas toar|zaken mamrei|mishneh torah|tochachah|tochacha|curses)\\b"), "sefer-devarim"],

  // --- Torah ---
  [r("\\b(pirkei avos|pirkei avot|pirke avos|avos chapter|kinyan torah|48 ways)\\b"), "pirkei-avos"],
  [r("\\b(pshat|peshat|remez|drush|derush|sod|pardes|pnimiyus|penimiyus|secrets? of the torah|sisrei torah|razei torah|kabbalah|kabbala|hidden torah|mystical|esoteric|deeper meaning)\\b"), "pardes"],
  [r("\\b(gematria|gematrias|gematriya|letters?|osiyos|otiyos|alef|aleph|beis|lashon hakodesh|loshon hakodesh|holy tongue|hebrew language|words?|numbers?|number of|masorah count|count of pesukim|600,000|600000|crowns|tagin|kisvei|sefer torah|torah scroll|torah s letters)\\b"), "otiyos-gematria"],
  [r("\\b(talmid chacham|talmidei chachamim|talmidei chachomim|torah scholars?|kavod hatorah|honor(ing)? (of )?(the )?torah|honoring talmidei|lomdei torah|bnei torah|yeshiva leit|supporting torah|yissachar and zevulun|rosh yeshiva|rabbeim|rebbi|rav and talmid|teacher|talmid|students?|disciples)\\b"), "talmidei-chachamim"],
  [r("\\b(oral torah|torah shebaal peh|torah sheb ?al peh|torah sheba al peh|written torah|torah shebiksav|mesorah|mesores|masorah|tradition|transmission|torah min hashamayim|torah from heaven|divine origin|truth of the torah|eternity of the torah|chain of tradition|kabbalah from sinai|mishnah|gemara|talmud|halacha|halachah|halachos|psak|poskim|shulchan aruch)\\b"), "torah-min-hashamayim"],
  [r("\\b(torah (as|is) (a |the )?(protection|refuge|defense|weapon|g ?dliness|blueprint|order|living|food|bread|water|fire|light|song|life|always|small|vessel|inheritance|descent)|torah and tefillah|power of (the )?torah|torah learning as|torah study as|torah as protection|wonders of the torah|torah above|torah versus|everything is contained|torah (compared|likened) to|greatness of (the )?torah|sweetness of (the )?torah)\\b"), "maalas-hatorah"],
  [r("\\b(torah lishmah|lishmah|lishma|shelo lishmah|toil|ameilus|amal|hasmadah|bitul torah|bittul torah|learning|limud|limmud|torah study|studying torah|study of torah|talmud torah|chiddushei torah|chiddushim|siyum|shas|daf yomi|kollel|torah and tefillah|torah as)\\b"), "torah-lishmah"],

  // --- Avodas Hashem ---
  [r("\\b(mesiras nefesh|mesirus nefesh|mesirat nefesh|self ?sacrifice|kiddush hashem|martyrdom|giving one s life|al kiddush hashem|chillul hashem)\\b"), "mesiras-nefesh"],
  [r("\\b(teshuvah|teshuva|tshuvah|repentance|baal teshuvah|baalei teshuvah|returning to hashem|return to hashem|vidui|confession|cheshbon hanefesh|cheshbon hanefesh|forgiveness|mechilah|kapparah|atonement|sins? becoming merits|zedonos|aveiros|aveira|aveirah|sins?|chet|cheit)\\b"), "teshuvah"],
  [r("\\b(yetzer hara|yetzer hora|yetzer tov|evil inclination|good inclination|satan|sitra|nisyonos|nisayon|nisyon|test|tests|trials?|temptations?|bechirah|free (will|choice)|struggle|battle|war (against|with) the yetzer|rationaliz\\w*|denial|self ?deception|taavah|taavos|desires?|lust)\\b"), "yetzer-hara"],
  [r("\\b(simcha|simchah|joy|joyful|happiness|b ?simcha|besimcha|rejoic\\w*|laughter|serving hashem with (joy|simcha)|ivdu es hashem b ?simcha)\\b"), "simcha"],
  [r("\\b(anavah|anava|humility|humble|bittul|bitul|self ?nullification|gaavah|gaava|pride|arrogance|haughtiness|ego|yeshus|shiflus|lowliness)\\b"), "anavah-bittul"],
  [r("\\b(yiras shamayim|yiras hashem|yiras haromemus|yirah|yiras|fear of (heaven|hashem|g ?d|the king|sin)|awe of|yiras cheit|trembl\\w*)\\b"), "yiras-shamayim"],
  [r("\\b(ahavas hashem|ahavas hashem|love (of|for) hashem|loving hashem|ahavah|ahava|dveikus|deveikus|dveykus|devekus|cleaving to hashem|clinging to hashem|longing for hashem|kirvas elokim|closeness to hashem|ratzo vashov|ratzo v ?shov|bond (with|to) hashem|yearning|love and fear)\\b"), "ahavas-hashem"],
  [r("\\b(renewal|hischadshus|hitchadshut|freshness|new beginning|chiddush|every day (a )?new|new creation|mosif v ?holech|growth|growing|aliyah in avodah|spiritual growth|ascending|aliyos)\\b"), "hischadshus"],
  [r("\\b(zerizus|zrizus|zeal|zealous|alacrity|laziness|atzlus|value of time|wasting time|time management|every moment|haste)\\b"), "zerizus"],
  [r("\\b(eating|food|achilah|l ?shem shamayim|lshem shamayim|for the sake of heaven|physical|gashmiyus|gashmiyus|materials?|material world|worldly|possessions|property|money|wealth|parnassah|parnasa|business|work|livelihood|sparks|nitzotzos|netzotzos|birurim|birur|elevat\\w*|raising|kedushah in the mundane|sleep|sleeping|bread|wine|drinking|tikkun chatzos|chatzos)\\b"), "avodah-begashmiyus"],
  [r("\\b(speech|dibur|dibbur|lashon hara|loshon hora|lashon horah|rechilus|motzi shem ra|idle talk|sichas chullin|leitzanus|letzanus|mockery|scoffing|shmiras halashon|shemiras halashon|words|silence|speaking|talk|talking|falsehood|lies|lying|sheker|truth|emes|flattery|chanifah)\\b"), "machshavah-dibur"],
  [r("\\b(mission|shlichus|shelichus|tafkid|purpose|role|calling|messenger|shaliach|sent to|why (a person|we) (was|were|is|are) (created|born)|individual task|unique task)\\b"), "shlichus-hanefesh"],
  [r("\\b(middos|midos|middah|midah|character|anger|kaas|ka as|jealousy|kinah|envy|hatred|sinah|patience|savlanus|honor|kavod|cruelty|rachmanus|mercy|compassion|stinginess|generosity|good eye|ayin tovah|ayin hara|evil eye|desire for honor|refining)\\b"), "middos"],
  [r("\\b(avodas hashem|avodah|serving hashem|service of hashem|avoda|service)\\b"), "avodas-hashem"],

  // --- Klal Yisroel ---
  [r("\\b(ahavas " + YISRAEL + "|ahavas chaverim|love (of|for) (every|each|a|one s|fellow|another|all) (jews?|yid|fellow|other)|love of (fellow )?jews|love of one s fellow|achdus|unity|unite|united|one body|one heart|k ?ish echad|kish echad|ish echad|together|equality of all|kenishta chada|areivus|areivim|responsib\\w* for one another|chevrah|groups of jews|all jews|fellow jews|friendship)\\b"), "ahavas-yisroel"],
  [r("\\b(eternity|netzach " + YISRAEL + "|netzach|survival|endur\\w*|indestructib\\w*|never (be )?destroyed|forever|eternal)\\b"), "netzach-yisroel"],
  [r("\\b(nations|goyim|gentiles?|non ?jews?|umos haolam|umos|seventy (nations|souls|languages)|light (to|unto) the nations|separation from|chosen people|am hanivchar|hatred of the jews|esav sonei|antisemit\\w*|ger|gerim|convert|converts|geirus|conversion)\\b"), "umos-haolam"],
  [r("\\b(pintele|inner point|good point|hidden point|point of (holiness|g ?dliness|yiddishkeit|good|avraham)|nekudah|nekuda|pach shemen|inner will|hidden (secret|root|virtue|good)|inextinguishable|indestructible point|spark of emunah in|tip of the yud)\\b"), "pintele-yid"],
  [r("\\b(hashem s (love|closeness|conduct|ever)|love (between|of) hashem (and|for) (klal|the jewish|knesses)|hashem and (klal|knesses|the jewish)|knesses " + YISRAEL + "|children of hashem|hashem s children|banim lamakom|firstborn|bechor|chassan and kallah|bond (between|of) (klal " + YISRAEL + "|hashem)|beloved|dear to hashem|hashem marvel\\w*|kings? son|hashem s portion|chelek hashem)"), "ahavas-hashem-leyisroel"],
  [r("\\b(pintele yid|pintele|inner point|nekudah|nekuda|every jew|each jew|a jew s|jew s|jewish (soul|heart|identity)|jewishness|yiddishkeit|children of hashem|banim lamakom|hashem s (love|children|firstborn)|firstborn|bechor|chassan and kallah|hashem and (klal|knesses|the jewish)|knesses " + YISRAEL + "|segulah|am segulah|kedushas " + YISRAEL + "|greatness of|maalas|no jew|lost jew|forgotten jew|jews outside|maaminim bnei maaminim|letter in the (sefer )?torah|letters of the torah|klal " + YISRAEL + "|bnei " + YISRAEL + "|the jewish people|jewish people|jews)\\b"), "maalas-yisroel"],
  [r("\\b(bein adam lachaveiro|bein adam l ?chaveiro|bein adam lechavero|between man and (his )?fellow|kavod habriyos|kavod habrios|shaming|embarrass\\w*|halbanas panim|feelings of others|sensitivity|judging (others )?favorably|dan l ?kaf zechus|lkaf zechus|benefit of the doubt|peace|shalom|sinas chinam|baseless hatred|kamtza|bar kamtza|respect for|derech eretz|manners|consideration|onaas devarim|hurting|hurt|insult\\w*|forgiv\\w*|machlokes)\\b"), "bein-adam-lachaveiro"],

  // --- Chinuch ---
  [r("\\b(summer|vacation|bein hazmanim|bein hazemanim|camp|camps|travel|traveling|trip|trips|kayitz)\\b"), "bein-hazmanim"],
  [r("\\b(friends|friend|chaveirim|chaverim|bad company|environment|surroundings|sevivah|influence of|peer|peers|society)\\b"), "chaveirim-sevivah"],
  [r("\\b(chinuch|chinuch habanim|education|educating|raising children|children|child|kids|young|youth|boys|girls|parenting|cheder|melamed|teaching children|talks? (for|to) children|chanoch lanaar)\\b"), "chinuch-habanim"],
  [r("\\b(yeshiva|yeshivah|yeshivos|bachur|bachurim|bochurim|bochur|zman|new zman|elul zman|winter zman|beis medrash|beis hamedrash|dormitory|seder in yeshiva|yeshiva bochur|chizuk)\\b"), "yeshivah-bachurim"],

  // --- Tefilah ---
  [r("\\b(tehillim|tehilim|psalms?|psalm|mizmor|shir hamaalos|shir hamaalot|ashrei|hallel|hallelukah|halleluka|haleluka)\\b"), "tehillim"],
  [r("\\b(pesukei d ?zimrah?|pesukei dezimrah?|pesukei d zimrah|baruch she ?amar|baruch sheamar|yishtabach|vayevarech dovid|az yashir|hodu|zemiros)\\b"), "pesukei-dezimra"],
  [r("\\b(krias shema|kriyas shema|kerias shema|shema|shma|shema yisrael|baruch shem|ahavah rabbah|ahava rabba|ahavas olam|emes v ?yatziv|emes veyatziv|yotzer|birchos krias shema|kabbalas ol|kabolas ol|ol malchus|krias shema al hamitah|bedtime shema|hamapil)\\b"), "krias-shema"],
  [r("\\b(shemoneh esrei|shmoneh esrei|shemone esre|amidah|shmone esrei|modim|retzei|refaeinu|sim shalom|birkas|eighteen blessings|blessings of shemoneh|tefillas (shacharis|mincha|maariv|minchah|arvis)|mincha|minchah|maariv|shacharis|mussaf)\\b"), "shemoneh-esrei"],
  [r("\\b(modeh ani|negel vasser|netilas yadayim|korbanos in davening|aleinu|anim zemiros|kaddish|kedushah in davening|birchos hashachar|siddur|nusach|nusach sefard|nusach ari|order of (the )?(prayers?|davening|tefillah)|seder hatefillah|l ?shem yichud|leshem yichud|ana bekoach|ana b ?koach)\\b"), "seder-hatefilah"],
  [r("\\b(minyan|tzibbur|tzibur|congregation|shul|beis haknesses|beis hakneses|synagogue|talking (in|during)|amen|answering amen|davar shebikdushah|davar shebikdusha|mikdash me ?at|mikdash meat)\\b"), "tefilah-betzibbur"],
  [r("\\b(gratitude|thank\\w*|hodaah|hoda ah|hodayah|hakaras hatov|hakoras hatov|praise|shevach|shvach|mizmor l ?sodah|mizmor lesodah|korban todah|seudas hodaah|birkas hagomel|gomel|hallel)\\b"), "hodaah"],
  [r("\\b(brachos|brochos|berachos|brachah|bracha|beracha|berachah|blessings?|hamotzi|birkas hamazon|bentching|bentsching|hundred brachos|100 brachos|brachos on|before eating)\\b"), "brachos"],
  [r("\\b(kavanah|kavana|kavanos|kavonah|concentration|foreign thoughts|machshavos zaros|davening slowly|slowly|fervor|hislahavus|enthusiasm|avodah shebalev|avodah sheb ?lev|service of the heart|heart in " + TEFILAH + "|meaning of the words|words of " + TEFILAH + "|preparation for " + TEFILAH + "|before davening|settling the mind|hisbonenus|meditation|aloud|loud|out loud|shouting|crying in)\\b"), "kavanah-betefilah"],
  [r("\\b(power of " + TEFILAH + "|crying out|cry out|tzaakah|tze akah|outcry|answered|answer\\w* " + TEFILAH + "|" + TEFILAH + " as (a )?weapon|weapon|tears|weeping|beseech|supplication|tachanun|requests?|asking hashem|pleading|petition|chana s " + TEFILAH + "|moshe rabbeinu s " + TEFILAH + "|barren|barrenness|akaros|pekidas akaros|segulos?|segulah)\\b"), "koach-hatefilah"],
  [r("\\b" + TEFILAH + "\\b"), "tefilah"],

  // --- Emunah (specific) ---
  [r("\\b(hester panim|hester ponim|hester|hiding of (the )?face|hidden face|hashem hides|hiddenness|concealment|darkness|dark times|yissurim|yesurim|suffering|sufferings|pain|tzaros|tzarah|troubles|tragedy|tragedies|why do the righteous suffer|bad things|everything (is )?for (the )?good|gam zu l ?tovah|gam zu letova|kol d ?avid rachmana|kol david rachmana|all for the good)\\b"), "hester-panim"],
  [r("\\b(hashgacha|hashgachah|hashgocha|providence|divine (providence|supervision|plan)|nothing (is )?(by )?chance|chance|coincidence|mikreh|mikre|hashem s plan|guided|orchestrat\\w*|every detail|steps of man|mitzadei gever)\\b"), "hashgacha-pratis"],
  [r("\\b(amalek|amalekite|amaleki|safek|sofek|doubts?|doubting|questions on emunah|kushyos|questions of emunah|skeptic\\w*|cynicism|letzanus and emunah|cold(ness)?|kar|asher korcha|korcha)\\b"), "emunah-safek-amalek"],
  [r("\\b(miracles?|nissim|nes|neis|niflaos|nifla os|wonders? (of|in) (hashem|history)|supernatural|above nature|lemaalah min hateva|nature|teva|natural|natural order|hidden miracles?|open miracles?|nes nigleh|nes nistar)\\b"), "nissim-veteva"],
  [r("\\b(bitachon|bitochon|betachon|trust (in )?hashem|trust|reliance|relying on hashem|worry|worries|anxiety|fear of the future|security|hishtadlus|effort|parnassah)\\b"), "bitachon"],
  [r("\\b(creation|creating|created|briah|beriah|bri ah|maaseh bereishis|ten (utterances|maamaros|sayings)|asarah maamaros|maamaros|human body|wonders of (the )?(creation|world|body|nature)|argument from design|design|microcosm|olam katan|universe|world was created|purpose of (the )?creation|creator|continuous|every day a new|renewed every|constantly renew|limbs|248|365|sinews|perek shirah?|upper and lower waters|animals?|birds?|plants?|stars|sun|heavens|earth|four elements|water|fire|ruach|wind)\\b"), "maaseh-bereishis"],
  [r("\\b(olam haba|olam habah|olam hab ?a|world to come|gan eden|gehinnom|gehenom|gehinom|reward|punishment|schar|onesh|sechar|judgment after|after death|afterlife|chibut hakever|techiyas|resurrection|olam haemes|olam ha ?emes|din v ?cheshbon|heavenly court|beis din shel maalah)\\b"), "schar-veonesh"],
  [r("\\b(emunah peshutah|emunah pshutah|simple (faith|emunah|jew|jews)|peshutah|temimus|tmimus|temimut|tamim|above (reason|daas|da as|the intellect|intellect|understanding|logic|knowledge)|beyond (reason|understanding|the intellect|intellect|logic)|without (understanding|seeing|proof|questions)|limits of (the )?(human )?(mind|intellect|understanding|reason)|inherited emunah|emunah (as an )?inherit\\w*|maaminim|believers|blind faith|feeling of the heart|faith of (our|the) (fathers|avos)|emunas avos|heart over mind|chochmah and emunah)\\b"), "emunah-peshutah"],
  [r("\\b(foundations? of emunah|yesodos|yesodei|yesod hayesodos|principles of (faith|emunah)|thirteen (ikarim|principles)|ikarim|ani maamin|knowing hashem|knowledge of hashem|da as hashem|daas hashem|hashem echad|achdus hashem|oneness of hashem|unity of hashem|yichud hashem|hashem s (unity|oneness|existence)|existence of hashem|proof|proofs|rambam hilchos yesodei|mitzvah of emunah|emunah as (the )?foundation|first mitzvah|anochi|knowing g ?d|ein od milvado|ein od|there is nothing (else|but))\\b"), "yesodei-haemunah"],
  [r("\\b(emunah|emuna|emunas|faith|believ\\w*|belief|maamin|hashem s (kingship|existence)|kingship of hashem|malchus shamayim|kabbalas ol malchus)\\b"), "emunah"],

  [r("\\b(chofetz chaim|chafetz chaim|chasam sofer|chassam sofer|vilna gaon|the gaon|gra|chazon ish|reb shraga feivel|shraga feivel|mendlowitz|rav hirsch|rabbi akiva eiger|reb akiva eiger|maharsham|steipler|brisker|reb chaim|rabbi chaim of volozhin|volozhin|reb yisrael salanter|yisrael salanter|salanter|rav kook|arizal|ari zal|the ari|ramchal|baal haturim|maharal|rambam|ramban|rashi|ibn ezra|abarbanel|ohr hachaim|or hachaim|shelah|sheloh|rav saadia|gedolim|gedolei|torah giants|rishonim|acharonim|rabbi akiva|reb akiva|chanina ben dosa|shimon hatzaddik|hillel|shammai|rabbi meir|rabban yochanan|yochanan ben zakai|rabbi eliezer|rabbi yehoshua|rabbeinu hakadosh|rebbi yehuda hanasi|tannaim|amoraim|chazal|anshei knesses hagedolah|knesses hagedolah|rav ashi|abaye|rava)\\b"), "gedolei-yisroel"],
  [r("\\b(niggun|niggunim|nigun|nigunim|music|musical|song|songs|singing|shirah|shira|zemer|melod\\w*|harp|kinor|dancing|dance)\\b"), "niggun-shirah"],
  [r("\\b(lifnim mishuras hadin|beyond the letter of the law|kiruv|kiruv rechokim|outreach|shluchim)\\b"), "ahavas-yisroel"],
  [r("\\b(decline of the generations|yeridas hadoros|yeridas hadorot|erev rav)\\b"), "simanei-ikvesa"],
  [r("\\b(hakhel|hakhel)\\b"), "sukkos"],
  [r("\\b(masechta|maseches|masechtos|masechet|tractate|yevamos|gemara|bava kamma|shabbos daf)\\b"), "torah-lishmah"],
  [r("\\b(good and evil|tov v ?ra|tov vara|no neutral|reshus)\\b"), "kedushah-vekelipah"],
  [r("\\b(pirsumei nisa|pirsum hanes)\\b"), "neros-chanukah"],
  [r("\\b(dama ben nesina)\\b"), "kibud-av-vaem"],
  [r("\\b(eis ratzon|et ratzon|time of (favor|ratzon)|raava)\\b"), "koach-hatefilah"],
  [r("\\b(gid hanasheh|gid hanashe)\\b"), "yaakov-velavan"],
  [r("\\b(inherit\\w* from the avos|yerushas avos|yerushah)\\b"), "emunah-peshutah"],
  [r("\\b(never too late|despair|despairing|yiush|yeiush|hopeless\\w*)\\b"), "teshuvah"],
  [r("\\b(kareis|kares|karet|judgment according|according to (one s|his) level)\\b"), "schar-veonesh"],
  [r("\\b(keini|kenizi|kadmoni)\\b"), "kedushas-eretz-yisroel"],
  [r("\\b(mesilas yesharim|chovos halevavos|mussar|musar|reishis chochmah)\\b"), "avodas-hashem"],
  [r("\\b(moreh nevuchim|kuzari|sefer haikarim)\\b"), "yesodei-haemunah"],
  [r("\\b(sefer chareidim|sefer hachinuch)\\b"), "taamei-hamitzvos"],
  [r("\\b(siyata dishmaya|siyata dishmaya|help from heaven)\\b"), "bitachon"],
  [r("\\b(vayigdelu)\\b"), "yaakov-veesav"],
  [r("\\b(velo sasuru|lo sasuru)\\b"), "tzitzis"],
  [r("\\b(pesukim|pesukei|verses|176)\\b"), "otiyos-gematria"],
  [r("\\b(malchus shamayim|kingship of hashem|hashem s kingship|ol malchus|kabbalas ol|hashem as king|king of the world|melech haolam)\\b"), "yesodei-haemunah"],
  [r("\\b(chochmah|chochma|binah|daas|da as|fifty gates of binah|gadlus|katnus|right over left|giver and (receiver|taker)|mashpia|mekabel)\\b"), "sefiros"],
  [r("\\b(fear|afraid|awe|before the king)\\b"), "yiras-shamayim"],
  [r("\\b(thoughts?|machshavah|machshavos|tongue|mouth)\\b"), "machshavah-dibur"],
  [r("\\b(gehazi|gechazi|naaman)\\b"), "eliyahu-hanavi"],
  [r("\\b(bein hamtzarim|bein hamitzarim)\\b"), "tammuz-av"],
  [r("\\b(chamishah asar b ?av|chamisha asar b ?av)\\b"), "tu-bav-nechamah"],
  [r("\\b(al hanissim|al hanisim)\\b"), "neros-chanukah"],
  [r("\\b(ad delo yada|ad dlo yada)\\b"), "purim"],
  [r("\\b(bikurim|bikkurim)\\b"), "kedushas-eretz-yisroel"],
  [r("\\b(avinu malkeinu)\\b"), "aseres-yemei-teshuvah"],
  [r("\\b(census|tzelofchad|tzelafchad)\\b"), "sefer-bamidbar"],
  [r("\\b(azazel)\\b"), "yom-kippur"],
  [r("\\b(challah|hafrashas)\\b"), "taamei-hamitzvos"],
  [r("\\b(chad gadya)\\b"), "leil-haseder"],
  [r("\\b(erusin|nisuin|kiddushin)\\b"), "shidduchim-chasunah"],
  [r("\\b(levayah|escorting)\\b"), "tzedakah-chesed"],
  [r("\\b(christianity|islam|christian|muslims?)\\b"), "galus-haumos"],
  [r("\\b(chazaras hashatz)\\b"), "tefilah-betzibbur"],
  [r("\\b(ner maaravi)\\b"), "korbanos"],
  [r("\\b(nefesh as|body (and|versus) soul|soul (and|versus) body)\\b"), "madreigos-haneshamah"],
  [r("\\b(pesach|passover)\\b"), "pesach"],
  [r("\\b(sedras|sedra|sidra|parshiyos|parsha|parshas|parashah|haftarah|haftara|haftoros)\\b"), "parsha"],
  // --- Broad fallbacks ---
  [r("\\b(" + SHABBOS + "|shabbat)\\b"), "kedushas-shabbos"],
  [r("\\b(yom tov|yomim tovim|moadim|moed|moadei|festival|festivals|holidays?|shalosh regalim|three regalim|regel|chol hamoed|chol hamo ed)\\b"), "zmanim"],
  [r("\\b(geulah|galus|golus|exile|exiles)\\b"), "galus-haumos"],
  [r("\\b(kedushah|kedusha|kedushas|holiness|holy|tumah|kadosh|kedoshim tihyu|separation|perishus|prishus|abstinence)\\b"), "kedushah"],
  [r("\\b(torah)\\b"), "torah"],
  [r("\\b(tzaddik|tzaddikim|tzadik|tzadikim|righteous|tzaddekes|chassid|chassidim|chasidim|rebbe|holy jew)\\b"), "tzaddikim"],
  [r("\\b(hashem|g ?d|hakadosh baruch hu|hkbh|ribono shel olam|divine|heaven|heavenly|shamayim)\\b"), "emunah"],
  [r("\\b(" + YISRAEL + "|jew|jews|jewish|yidden|klal)\\b"), "klal-yisroel"],
  [r("\\b(chassidus|chasidus|chassidut|kabbalah|kabbala|zohar|arizal|mekubalim|kabbalistic)\\b"), "chassidus"],
];

// ---------------------------------------------------------------------------------------------

const matchForm = (p: string): string =>
  p
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’‘`ʼ']s\b/g, " s")
    .replace(/[’‘`ʼ'"“”]/g, "")
    .replace(/[^a-z0-9,:\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function main(): void {
  const report = process.argv.includes("--report");
  const raw = JSON.parse(readFileSync(RAW_PATH, "utf8")) as RawTopic[];

  const nodes = new Map<string, { def: NodeDef; children: string[] }>();
  for (const def of NODES) {
    if (nodes.has(def[0])) throw new Error(`duplicate node ${def[0]}`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(def[0])) throw new Error(`bad id ${def[0]}`);
    nodes.set(def[0], { def, children: [] });
  }
  for (const def of NODES) {
    if (def[1] !== null) {
      const p = nodes.get(def[1]);
      if (!p) throw new Error(`unknown parent ${def[1]} for ${def[0]}`);
      p.children.push(def[0]);
    }
  }
  for (const [, target] of RULES) {
    if (typeof target === "string" && !nodes.has(target)) throw new Error(`rule targets unknown topic ${target}`);
  }

  // 1. Map phrases.
  const assign = new Map<string, string>(); // phrase -> topic id
  const unmapped: RawTopic[] = [];
  for (const t of raw) {
    const m = matchForm(t.phrase);
    let hit: string | null = null;
    for (const [re, target] of RULES) {
      const mm = m.match(re);
      if (mm) {
        hit = typeof target === "string" ? target : target(mm);
        break;
      }
    }
    if (hit) assign.set(t.phrase, hit);
    else unmapped.push(t);
  }
  const byPhrase = new Map(raw.map((t) => [t.phrase, t]));

  // 2. Fold leaves with too few shiurim into their parent, repeatedly.
  const removed = new Set<string>();
  const folded: string[] = [];
  const shiurSet = (id: string): Set<string> => {
    const s = new Set<string>();
    for (const [ph, tid] of assign) if (tid === id) for (const sid of byPhrase.get(ph)!.shiurIds) s.add(sid);
    return s;
  };
  const liveChildren = (id: string): string[] => nodes.get(id)!.children.filter((c) => !removed.has(c));
  for (;;) {
    let changed = false;
    for (const def of NODES) {
      const id = def[0];
      if (removed.has(id) || def[1] === null || liveChildren(id).length > 0) continue;
      const n = shiurSet(id).size;
      if (n < MIN_SHIURIM && !KEEP.has(id)) {
        removed.add(id);
        folded.push(`${id} (${n}) -> ${def[1]}`);
        for (const [ph, tid] of assign) if (tid === id) assign.set(ph, def[1]);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Coverage per live node, including descendants.
  const subtreeShiurim = (id: string): Set<string> => {
    const s = shiurSet(id);
    for (const c of liveChildren(id)) for (const x of subtreeShiurim(c)) s.add(x);
    return s;
  };

  // 3. Build Topic[].
  const levelOf = (id: string): 1 | 2 | 3 => {
    let l = 1;
    let p = nodes.get(id)!.def[1];
    while (p !== null) {
      l++;
      p = nodes.get(p)!.def[1];
    }
    if (l > 3) throw new Error(`${id} is deeper than 3 levels`);
    return l as 1 | 2 | 3;
  };
  const topics: Topic[] = [];
  for (const def of NODES) {
    const [id, parentId, en, yi, he, extra] = def;
    if (removed.has(id)) continue;
    const phrases = [...assign].filter(([, tid]) => tid === id).map(([ph]) => byPhrase.get(ph)!);
    phrases.sort((a, b) => b.count - a.count || a.phrase.length - b.phrase.length || a.phrase.localeCompare(b.phrase));
    const aliasSet = new Set<string>();
    for (const x of extra ?? []) aliasSet.add(x.toLowerCase());
    for (const p of phrases) {
      if (aliasSet.size >= MAX_ALIASES) break;
      if (p.phrase.length <= 60) aliasSet.add(p.phrase);
    }
    if (he) aliasSet.add(he);
    aliasSet.delete(en.toLowerCase());
    const label: Topic["label"] = he ? { en, yi, he } : { en, yi };
    topics.push({
      id,
      parentId,
      level: levelOf(id),
      label,
      aliases: [...aliasSet],
      description: null,
      shiurCount: 0,
      hubShiurIds: [],
      reviewStatus: "unreviewed",
    });
  }
  topics.sort((a, b) => a.level - b.level || a.label.en.localeCompare(b.label.en));

  const live = new Set(topics.map((t) => t.id));
  const aliasMap: Record<string, string> = {};
  for (const t of [...raw].sort((a, b) => a.phrase.localeCompare(b.phrase))) {
    const tid = assign.get(t.phrase);
    if (tid && live.has(tid)) aliasMap[t.phrase] = tid;
  }

  writeFileSync(OUT_TOPICS, JSON.stringify(topics, null, 1) + "\n");
  writeFileSync(OUT_ALIASES, JSON.stringify(aliasMap, null, 1) + "\n");

  const leaves = topics.filter((t) => !topics.some((c) => c.parentId === t.id));
  const topLevel = topics.filter((t) => t.level === 1).length;
  console.log(
    `topics ${topics.length}, top-level ${topLevel}, leaves ${leaves.length}, mapped ${Object.keys(aliasMap).length}, unmapped ${unmapped.length} (of ${raw.length})`,
  );
  if (report) {
    console.log("\nFolded:\n  " + folded.join("\n  "));
    console.log("\nLeaves (shiurim):");
    for (const t of leaves) console.log(`  ${String(subtreeShiurim(t.id).size).padStart(4)}  ${"  ".repeat(t.level - 1)}${t.id}`);
    console.log("\nInternal nodes (subtree shiurim / own phrases' shiurim):");
    for (const t of topics.filter((x) => !leaves.includes(x)))
      console.log(`  ${String(subtreeShiurim(t.id).size).padStart(4)} / ${String(shiurSet(t.id).size).padStart(4)}  ${t.id}`);
    unmapped.sort((a, b) => b.count - a.count);
    console.log("\nTop unmapped:\n  " + unmapped.slice(0, 150).map((u) => `${u.phrase} (${u.count})`).join(" | "));
  }
}

main();
