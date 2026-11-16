/**
 * The old www.emunas.com files the home site rehosts, in old-site order.
 *
 * Essays: the 53 PDFs linked from /essays.html, in the order that page lists them. Titles are
 * the page's link text with typos fixed ("Beginnings", "Desert"); groups are assigned by
 * parsha, with the essays that are only about a Yom Tov under "Yomim Tovim".
 * Articles: the two magazine PDFs linked from /about.html.
 * Images: the header portrait (the old site's logo slot). Not copied: the home-page promo banner
 * (its baked-in Hebrew title reads שליט"א, which must not be published now that he has passed
 * away) and the theme files (background, dropdown, CSS, JS).
 */

export type LegacyKind = "essay" | "article" | "image";
export type EssayGroup = "Bereishis" | "Shemos" | "Vayikra" | "Bamidbar" | "Devarim" | "Yomim Tovim";

export interface LegacySource {
  kind: LegacyKind;
  /** File name under site/files/<kind>s/ (without extension for PDFs). Lowercase ascii, hyphenated. */
  slug: string;
  title: string;
  group: EssayGroup | null;
  /** Upload file name on the old site, under ORIGIN + UPLOADS. */
  file: string;
}

export const ORIGIN = "https://www.emunas.com";
export const UPLOADS = "/uploads/1/3/0/0/130027178/";

type EssayRow = readonly [slug: string, group: EssayGroup, file: string, title: string];

const ESSAYS: readonly EssayRow[] = [
  ["bereishis", "Bereishis", "09_bereishis.pdf", "Bereishis: The Last Generation Will Be Rectified Through Emunah"],
  ["noach", "Bereishis", "02_noach.pdf", "Noach: Escorted by the Succah"],
  ["lech-lecha", "Bereishis", "11_lech_lecha.pdf", "Lech Lecha: Avraham Avinu, the Roots of Geulah"],
  ["vayera", "Bereishis", "12_vayera.pdf", "Vayera: Avraham Avinu's Greatest Act of Hospitality"],
  ["chaya-sarah", "Bereishis", "13_chaya_sura.pdf", "Chaya Sarah: A Chanukah Candle Called Rivkah"],
  ["toldos", "Bereishis", "14_toldos.pdf", "Toldos: The Fire of Yitzchak Will Prevail Over Yishmael"],
  ["vayeitzei", "Bereishis", "15_vayetzei.pdf", "Vayeitzei: Yaakov Avinu Paved the Way for the Exiled Jew"],
  ["vayishlach", "Bereishis", "16_vayishlach.pdf", "Vayishlach: One Nation with One G-d"],
  ["vayeshev-chanukah", "Bereishis", "17_vayeshev_-_chanukah.pdf", "Vayeshev: Everything Revolves Around the Coming of Mashiach"],
  ["mikeitz-chanukah-teves", "Bereishis", "18_mikeitz_-_chanukah_-_teves.pdf", "Mikeitz: Chanukah Lights Up Teves"],
  ["vayigash", "Bereishis", "20_vayigash.pdf", "Vayigash: The Treasures of Teves"],
  ["vayechi", "Bereishis", "21_vayichi.pdf", "Vayechi: Yaakov Avinu Lives in Each of Us"],
  ["shemos", "Shemos", "22_shemos.pdf", "Shemos: Names of Redemption"],
  ["vaera-shevat", "Shemos", "23_vaera.pdf", "Vaera and Shevat: The Power to Pray"],
  ["bo", "Shemos", "24_bo.pdf", "Bo: New Beginnings"],
  ["beshalach", "Shemos", "25_beshalach.pdf", "Beshalach: A Song of Perfect Harmony"],
  ["yisro", "Shemos", "26_yisro.pdf", "Yisro: The Song of Yisro"],
  ["terumah-purim", "Shemos", "28_terumah_-_purim.pdf", "Terumah/Purim: Bread of Life"],
  ["tetzaveh-purim", "Shemos", "29_tetzaveh_-_purim.pdf", "Titzaveh/Purim: A Yom Tov of Outreach"],
  ["ki-sisa-parah", "Shemos", "30_ki_sisa_-_parah.pdf", "Ki Sisa - Parah: The Greatness of the Jewish People"],
  ["vayakheil-pekudei", "Shemos", "31_vayakheil_pekudei.pdf", "Vayakheil - Pekudei: A Time Auspicious for Mashiach"],
  ["vayikra-nissan", "Vayikra", "32_vayikra_-_nissan.pdf", "Vayikra/Nissan: A Time of Chessed"],
  ["tzav-pesach", "Vayikra", "33_tzav.pdf", "Tzav/Pesach: Strengthening Emunah"],
  ["chol-hamoed-pesach", "Yomim Tovim", "34_pesach_chol_hamoed.pdf", "Chol HaMoed Pesach: Goodheartedness, Emunah and Simplicity"],
  ["acharon-shel-pesach", "Yomim Tovim", "35_acharon_shel_pesach.pdf", "Achron Shel Pesach: Go Through Life Singing"],
  ["shemini", "Vayikra", "36_shemini.pdf", "Shemini: Humility is a Prerequisite for Torah"],
  ["tazria-metzora", "Vayikra", "37_tzaria_metzora.pdf", "Tazria Metzorah: The Unbroken Chain of Yaakov"],
  ["acharei-kedoshim", "Vayikra", "38_acharei_mos_kedoshim.pdf", "Achrei Kedoshim: Aharon is the Person of the Kodesh Hakadoshim"],
  ["emor", "Vayikra", "39_emor.pdf", "Emor: The Rectification of the Moon"],
  ["behar-bechukosai", "Vayikra", "40_behar_bechukosei.pdf", "Behar Bechukoisei: Yovel - The Laws of Return"],
  ["shevuos", "Yomim Tovim", "41_shevuos.pdf", "Shevuos: The Revelation of Mashiach"],
  ["naso", "Bamidbar", "42_naso.pdf", "Nasoi: The Downfall of Yishmael"],
  ["behaaloscha", "Bamidbar", "43_behaloischa.pdf", "Behaloischa: Waiting for Miriam in the Desert"],
  ["shelach", "Bamidbar", "44_shelach.pdf", "Shelach: Our Mission During the Summer Months"],
  ["korach", "Bamidbar", "45_korach.pdf", "Korach: Korach Will Blossom"],
  ["chukas", "Bamidbar", "46_chukas.pdf", "Chukas: The Incomprehensible Humility of Moshe Rabbeinu"],
  ["balak", "Bamidbar", "47_balak.pdf", "Balak: Hashem Loves You!"],
  ["pinchos", "Bamidbar", "01_pinchos.pdf", "Pinchos: Eliyahu HaNavi Will Rectify Every Jew"],
  ["matos", "Bamidbar", "02_matos.pdf", "Matos: The Jewish Connection to Eretz Yisrael"],
  ["masei", "Bamidbar", "03_masei.pdf", "Masei: The Jewish Connection to Eretz Yisrael"],
  ["devarim", "Devarim", "01_devarim.pdf", "Devarim: Cleaving to Hashem in the Valley of Tears"],
  ["vaeschanan", "Devarim", "04_vaeschanun.pdf", "Vaeschanan: Mishkan Shiloh and the Bais HaMikdash"],
  ["eikev", "Devarim", "02_eikev.pdf", "Eikev: Hashem's Bond With the Jewish People is Permanent"],
  ["reeh", "Devarim", "03_reeh.pdf", "Re'eh: Finding the Point of G-dliness"],
  ["shoftim", "Devarim", "04_shoftim.pdf", "Shoftim: Jewish Kings"],
  ["ki-setzei", "Devarim", "05_ki_setzei.pdf", "Ki Setzei: Seek Hashem"],
  ["ki-savo", "Devarim", "05_ki_savoi.pdf", "Ki Savoi: Gratitude, Humility, Bikkurim, and Moshe Rabbeinu's Legacy"],
  ["nitzavim-vayelech-rosh-hashanah", "Devarim", "nitzavim_vayelech_rosh_hashana.pdf", "Nitzavim Vayelech - Rosh Hashanah: We Endure through the Mitzvah of Emunah"],
  ["vayelech-shabbos-shuvah-yom-kippur", "Devarim", "shabbos_shuva.pdf", "Vayelech, Shabbos Shuvah, Yom Kippur: Opening Up to Hashem During These Holy Days"],
  ["haazinu", "Devarim", "07_haazinu.pdf", "Haazinu: The Birth of A New Year"],
  ["sukkos", "Yomim Tovim", "succos_complete.pdf", "Sukkos: Freedom In the Sukkah"],
  ["sukkos-simchas-bais-hashoevah", "Yomim Tovim", "08-1_succos-simchas_bais_hashoevah.pdf", "Succos: Simchas Bais HaShoevah, Rejoice, You Are In Gan Eden!"],
  ["hoshanah-rabbah-shemini-atzeres-simchas-torah", "Yomim Tovim", "08-2_succos-shmini_atzeres.pdf", "Hoshanah Rabbah, Shemini Atzeres, Simchas Torah: Understanding What These Days Are All About"],
];

export const SOURCES: readonly LegacySource[] = [
  ...ESSAYS.map(([slug, group, file, title]): LegacySource => ({ kind: "essay", slug, title, group, file })),
  {
    kind: "article",
    slug: "the-mashgiach-rebuilding-a-real-yiddishkeit",
    title: "The Mashgiach: Rebuilding a Real Yiddishkeit",
    group: null,
    file: "article_feature_6-26-24_the_mashgiach.pdf",
  },
  {
    kind: "article",
    slug: "mishpacha-seven-becomes-eight",
    title: "Seven Becomes Eight (Mishpacha Magazine)",
    group: null,
    file: "seven_becomes_eight_-_mishpacha_magazine.pdf",
  },
  { kind: "image", slug: "portrait.jpg", title: "Harav Moshe Wolfson zt\"l", group: null, file: "1438224189746.jpg" },
];
