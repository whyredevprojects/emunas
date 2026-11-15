/**
 * Transliteration variant table for search folding (`fold()`).
 *
 * Each row maps spellings (already passed through `foldBasic`, so lower case, no quotes or
 * apostrophes, hyphens as spaces) to one canonical folded form. Multi-word variants are matched
 * as whole token sequences, longest first. A canonical form may be Hebrew so that a Latin query
 * and Hebrew-script text meet in one bilingual index (lag baomer → לג בעומר).
 *
 * This table only affects search folding. Stable keys use `foldBasic` and are not affected by
 * edits here, so reviewers can extend it freely.
 */
export const variantsReviewStatus = "unreviewed" as const;

export interface VariantRow {
  canonical: string;
  variants: readonly string[];
}

export const VARIANTS: readonly VariantRow[] = [
  // ---- occasions (canonical = Hebrew folded form, so both scripts meet) ----
  { canonical: "לג בעומר", variants: ["lag baomer", "lag bomer", "lag laomer", "lag beomer", "lag b omer", "lag ba omer", "lag baomer", "לג בעומר"] },
  { canonical: "חנוכה", variants: ["chanukah", "chanuka", "chanukkah", "channukah", "hanukkah", "hanukah", "hanuka", "chanike", "chanuke"] },
  { canonical: "זאת חנוכה", variants: ["zos chanukah", "zot chanukah", "zos chanuka", "zot hanukkah", "zos chanike"] },
  { canonical: "פורים", variants: ["purim"] },
  { canonical: "פורים קטן", variants: ["purim katan", "purim koton"] },
  { canonical: "שושן פורים", variants: ["shushan purim"] },
  { canonical: "פסח", variants: ["pesach", "pesah", "peisach", "passover"] },
  { canonical: "שבועות", variants: ["shavuos", "shavuot", "shavuoth", "shvuos", "shevuos"] },
  { canonical: "סוכות", variants: ["sukkos", "sukkot", "succos", "succot", "sukos", "sukkoth"] },
  { canonical: "ראש השנה", variants: ["rosh hashanah", "rosh hashana", "rosh hashono", "rosh hashonoh"] },
  { canonical: "יום כפור", variants: ["yom kippur", "yom kipur", "yom hakippurim", "yom hakipurim", "יום הכיפורים", "יוכ", "יום כיפור"] },
  { canonical: "שמיני עצרת", variants: ["shemini atzeres", "shemini atzeret", "shmini atzeres", "shmini atzeret"] },
  { canonical: "שמחת תורה", variants: ["simchas torah", "simchat torah"] },
  { canonical: "הושענא רבה", variants: ["hoshana rabbah", "hoshana raba", "hoshana rabba", "hoshanah rabbah"] },
  { canonical: "טו בשבט", variants: ["tu bishvat", "tu bshvat", "tu beshvat", "tu bshevat", "chamisha asar bshvat"] },
  { canonical: "טו באב", variants: ["tu beav", "tu bav", "tu bav", "tu baav"] },
  { canonical: "תשעה באב", variants: ["tisha beav", "tisha bav", "tishah beav", "tishah bav", "tisha baav", "ט באב"] },
  { canonical: "בין המצרים", variants: ["bein hametzarim", "bein hamitzarim", "bein hameitzarim", "three weeks"] },
  { canonical: "ספירה", variants: ["sefirah", "sefira", "sfira", "sefiras haomer"] },
  { canonical: "אלול", variants: ["elul"] },
  { canonical: "שובבים", variants: ["shovavim", "shovevim"] },
  { canonical: "יט כסלו", variants: ["yud tes kislev", "yud tet kislev"] },
  // ---- common words ----
  { canonical: "shabbos", variants: ["shabbat", "shabbes", "shabes", "shabbath", "sabbath"] },
  { canonical: "chassidus", variants: ["chasidus", "chassidut", "chasidut", "hasidut", "hassidus"] },
  { canonical: "teshuvah", variants: ["teshuva", "tshuva", "tshuvah"] },
  { canonical: "tefillah", variants: ["tefilla", "tefila", "tefilah", "tfila", "tfilla"] },
  { canonical: "mitzvah", variants: ["mitzva", "mitsva", "mitsvah"] },
  { canonical: "mitzvos", variants: ["mitzvot", "mitzvoth"] },
  { canonical: "emunah", variants: ["emuna"] },
  { canonical: "moshiach", variants: ["mashiach", "mashiah", "moshiah", "meshiach"] },
  { canonical: "geulah", variants: ["geula", "geulo"] },
  { canonical: "hashem", variants: ["ha shem"] },
  { canonical: "tehillim", variants: ["tehilim", "tehilims"] },
  { canonical: "midrash", variants: ["medrash"] },
  { canonical: "gemara", variants: ["gemoro", "gemora", "gemorah"] },
  { canonical: "rebbe", variants: ["rebbi"] },
  { canonical: "tzaddik", variants: ["tzadik", "tsadik", "tzadick"] },
  { canonical: "tzaddikim", variants: ["tzadikim", "tsadikim"] },
  { canonical: "kedushah", variants: ["kedusha", "kdusha"] },
  { canonical: "galus", variants: ["galut", "golus"] },
  { canonical: "bitachon", variants: ["bittachon", "bitochon"] },
  { canonical: "dovid", variants: ["david", "dovid"] },
  { canonical: "yaakov", variants: ["yakov", "yaakov", "yankev"] },
  { canonical: "yitzchak", variants: ["yitzhak", "yitschak", "itzchak"] },
  { canonical: "avraham", variants: ["avrohom", "avrohom", "avrom"] },
  { canonical: "moshe", variants: ["moishe", "mosheh"] },
  { canonical: "yisrael", variants: ["yisroel", "yisruel", "yisreal"] },
  { canonical: "yehudah", variants: ["yehuda", "yehudo"] },
  { canonical: "rivkah", variants: ["rivka", "rivko"] },
  { canonical: "esav", variants: ["eisav", "esau"] },
  { canonical: "bilaam", variants: ["bilam"] },
  // ---- parshiyos and books (Ashkenazi canonical) ----
  { canonical: "bereishis", variants: ["bereshit", "bereishit", "breishis", "bereshis", "breishit"] },
  { canonical: "shemos", variants: ["shemot", "shmos", "shmot"] },
  { canonical: "vayikra", variants: ["vayiqra"] },
  { canonical: "bamidbar", variants: ["bemidbar"] },
  { canonical: "devarim", variants: ["dvarim"] },
  { canonical: "lech lecha", variants: ["lech lcha", "lekh lekha"] },
  { canonical: "vayeira", variants: ["vayera", "vayero"] },
  { canonical: "chayei sarah", variants: ["chayei sara", "chaye sarah", "chayei soro"] },
  { canonical: "toldos", variants: ["toldot", "toledot", "toldois"] },
  { canonical: "vayeitzei", variants: ["vayetzei", "vayeitze", "vayetze"] },
  { canonical: "vayeishev", variants: ["vayeshev", "vayeishiv"] },
  { canonical: "mikeitz", variants: ["miketz", "mikketz"] },
  { canonical: "vaeira", variants: ["vaera", "vaeiro"] },
  { canonical: "beshalach", variants: ["beshallach", "bshalach"] },
  { canonical: "yisro", variants: ["yitro", "yisroi"] },
  { canonical: "ki sisa", variants: ["ki tisa", "ki sissa", "ki tissa"] },
  { canonical: "tazria", variants: ["sazria"] },
  { canonical: "acharei mos", variants: ["acharei mot", "achrei mot", "acharei mois"] },
  { canonical: "bechukosai", variants: ["bechukotai", "bechukosay"] },
  { canonical: "nasso", variants: ["naso"] },
  { canonical: "behaaloscha", variants: ["behaalotcha", "behaaloscho", "behaalotecha"] },
  { canonical: "shelach", variants: ["shlach", "shelach lecha"] },
  { canonical: "chukas", variants: ["chukat", "chukkas"] },
  { canonical: "matos", variants: ["matot", "mattos"] },
  { canonical: "vaeschanan", variants: ["vaetchanan", "voeschanan"] },
  { canonical: "reeh", variants: ["re eh"] },
  { canonical: "ki seitzei", variants: ["ki teitzei", "ki tetze", "ki seitze"] },
  { canonical: "ki savo", variants: ["ki tavo", "ki sovo"] },
  { canonical: "haazinu", variants: ["ha azinu"] },
  { canonical: "koheles", variants: ["kohelet", "koheleth"] },
  { canonical: "eichah", variants: ["eicha", "eichoh"] },
  { canonical: "rus", variants: ["ruth"] },
  { canonical: "mishlei", variants: ["mishle"] },
  { canonical: "yeshayahu", variants: ["yeshaya", "yeshayah", "yeshaiah"] },
  { canonical: "yirmiyahu", variants: ["yirmeyahu", "yirmiya"] },
  { canonical: "yechezkel", variants: ["yechezkiel"] },
];
