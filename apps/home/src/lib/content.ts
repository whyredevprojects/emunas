/**
 * Fixed data of the home site, taken from the old www.emunas.com (crawled 2026-11-16): contact
 * details, external links, the English sefarim, and what the essay and article covers say. The
 * UI copy and prose, in every interface language, are in src/i18n/.
 */
import type { EssayGroup } from "./legacy-schema.ts";

/** The wordmark: "Emunas" and the same word in Hebrew letters, shown together on every page. */
export const SITE_NAME = "Emunas";
export const SITE_NAME_HEBREW_SCRIPT = "אמונת";

export const CONTACT = {
  email: "info@emunas.com",
  address: ["Cong. Emunas Yisrael", "C/O Mrs. Vorhand", "1443 40th Street", "Brooklyn, NY 11218"],
  phone: "646.992.9900",
  phoneHref: "tel:+16469929900",
} as const;

export const EXTERNAL = {
  /** Support the printing of the Mashgiach's sefarim (card payments, third party). */
  support: "https://secure.merchpay.com/cong-emunas-yisroel/",
  /** Weekly Devar Torah sign-up (Brevo). */
  devarTorah:
    "https://8bf9f8ed.sibforms.com/serve/MUIFABPPPSiXcrFKY5lvWawQPnY32-wOIo-NqQ2zxc8l4rouJn6lr-cpeCIKwQC9N07qjl6TLp2xIlusvW82Y2YG74nfCPtQyoMf7LIDfKCKrGDLOO01QofBZiTsNUXM03pwQOubXP-bR4WhmDvKqZho8wMPjz_R7n-PWWaV490LD31cPCdAPI9bAKmEbdtnnEjwTg145PHEpqKi",
} as const;

export interface Sefer {
  readonly title: string;
  /** Only where the old site's subtitle belongs to this book (its Festivals of Faith subtitles were copy-pasted). */
  readonly subtitle?: string;
  readonly author: string;
  readonly publisher: string;
  readonly year: number;
  readonly href: string;
}

/** The English sefarim based on the Mashgiach's teachings, newest first, as on the old home page. */
export const SEFARIM: readonly Sefer[] = [
  { title: "Festivals of Faith: Yamim Noraim & Succos", author: "Baila Vorhand", publisher: "Feldheim", year: 2024, href: "https://www.bailavorhand.com/festivals-tishrei.html" },
  { title: "Festivals of Faith: Chanukah & the Winter Months", author: "Baila Vorhand", publisher: "Feldheim", year: 2024, href: "https://www.bailavorhand.com/festivals-chanukah.html" },
  { title: "Festivals of Faith: Adar & Purim", author: "Baila Vorhand", publisher: "Feldheim", year: 2024, href: "https://www.bailavorhand.com/festivals-purim.html" },
  { title: "Festivals of Faith: Pesach, Shavuos & the Summer Months", author: "Baila Vorhand", publisher: "Feldheim", year: 2024, href: "https://www.bailavorhand.com/festivals-pesach.html" },
  { title: "Feast of Faith", subtitle: "Reveal the radiance of Shabbos through the parashah", author: "Baila Vorhand", publisher: "Feldheim", year: 2022, href: "https://www.bailavorhand.com/feast-of-faith.html" },
  { title: "The Core of Emunah", subtitle: "Fundamental truths of emunah and practical strategies", author: "Baila Vorhand", publisher: "Feldheim", year: 2020, href: "https://www.bailavorhand.com/core-of-emunah.html" },
  { title: "Sacred Soil", subtitle: "A guided tour through the spiritual essence of Eretz Yisrael", author: "Baila Vorhand", publisher: "ArtScroll Mesorah", year: 2017, href: "https://www.artscroll.com/Books/9781422619247.html" },
  { title: "Flames of Faith", subtitle: "An introduction to Chassidic thought", author: "Rabbi Zev Reichman", publisher: "Kodesh Publishers", year: 2014, href: "https://www.amazon.com/Flames-Faith-Introduction-Chasidic-Thought/dp/0692024549" },
  { title: "Service of the Heart", subtitle: "The beauty and essence of tefillah", author: "Rabbi Shimon Finkelman", publisher: "ArtScroll Mesorah", year: 2012, href: "https://www.artscroll.com/Books/9781422613030.html" },
  { title: "Wellsprings of Faith", subtitle: "Discourses designed as an experience of faith rather than instruction in it", author: "Rabbi Yehoshua Fieldsteel", publisher: "Feldheim", year: 2002, href: "https://www.feldheim.com/wellsprings-of-faith-1" },
];

/** Anchor and filter id of an essay group; its label is `group.<id>` in src/i18n/. */
export type GroupId = "bereishis" | "shemos" | "vayikra" | "bamidbar" | "devarim" | "yomim-tovim";

export interface GroupInfo {
  /** Anchor and filter id on the essays page. */
  readonly id: GroupId;
  /** The group's Hebrew name, shown beside its label on an English page. */
  readonly he: string;
  /** Cover cloth (CSS modifier). */
  readonly cloth: "oxblood" | "green" | "navy" | "ochre" | "slate" | "paper";
}

export const GROUP_INFO: Readonly<Record<EssayGroup, GroupInfo>> = {
  Bereishis: { id: "bereishis", he: "ספר בראשית", cloth: "oxblood" },
  Shemos: { id: "shemos", he: "ספר שמות", cloth: "green" },
  Vayikra: { id: "vayikra", he: "ספר ויקרא", cloth: "navy" },
  Bamidbar: { id: "bamidbar", he: "ספר במדבר", cloth: "ochre" },
  Devarim: { id: "devarim", he: "ספר דברים", cloth: "slate" },
  "Yomim Tovim": { id: "yomim-tovim", he: "ימים טובים", cloth: "paper" },
};

/** The Hebrew name on each essay's cover, by file slug. Every essay needs one (test/content.test.ts). */
export const ESSAY_HEBREW: Readonly<Record<string, string>> = {
  bereishis: "בראשית",
  noach: "נח",
  "lech-lecha": "לך לך",
  vayera: "וירא",
  "chaya-sarah": "חיי שרה",
  toldos: "תולדות",
  vayeitzei: "ויצא",
  vayishlach: "וישלח",
  "vayeshev-chanukah": "וישב",
  "mikeitz-chanukah-teves": "מקץ",
  vayigash: "ויגש",
  vayechi: "ויחי",
  shemos: "שמות",
  "vaera-shevat": "וארא",
  bo: "בא",
  beshalach: "בשלח",
  yisro: "יתרו",
  "terumah-purim": "תרומה",
  "tetzaveh-purim": "תצוה",
  "ki-sisa-parah": "כי תשא",
  "vayakheil-pekudei": "ויקהל פקודי",
  "vayikra-nissan": "ויקרא",
  "tzav-pesach": "צו",
  "chol-hamoed-pesach": "חול המועד פסח",
  "acharon-shel-pesach": "אחרון של פסח",
  shemini: "שמיני",
  "tazria-metzora": "תזריע מצורע",
  "acharei-kedoshim": "אחרי קדושים",
  emor: "אמור",
  "behar-bechukosai": "בהר בחקתי",
  shevuos: "שבועות",
  naso: "נשא",
  behaaloscha: "בהעלתך",
  shelach: "שלח",
  korach: "קרח",
  chukas: "חקת",
  balak: "בלק",
  pinchos: "פינחס",
  matos: "מטות",
  masei: "מסעי",
  devarim: "דברים",
  vaeschanan: "ואתחנן",
  eikev: "עקב",
  reeh: "ראה",
  shoftim: "שופטים",
  "ki-setzei": "כי תצא",
  "ki-savo": "כי תבוא",
  "nitzavim-vayelech-rosh-hashanah": "נצבים וילך",
  "vayelech-shabbos-shuvah-yom-kippur": "שבת שובה",
  haazinu: "האזינו",
  sukkos: "סוכות",
  "sukkos-simchas-bais-hashoevah": "שמחת בית השואבה",
  "hoshanah-rabbah-shemini-atzeres-simchas-torah": "שמיני עצרת",
};

/** Essays shown as covers under "From the archive" on the home page, by file path. */
export const FEATURED_ESSAYS: readonly string[] = [
  "/files/essays/bereishis.pdf",
  "/files/essays/mikeitz-chanukah-teves.pdf",
  "/files/essays/terumah-purim.pdf",
  "/files/essays/sukkos.pdf",
];

export interface ArticleInfo {
  /** The headline as printed (the manifest title may carry the magazine's name). */
  readonly headline: string;
  /** Masthead line on the newsprint cover. */
  readonly source: string;
  /** Only where the date is known (from the original file name). */
  readonly date?: string;
}

/** What the covers of the two magazine articles say, by file path. */
export const ARTICLE_INFO: Readonly<Record<string, ArticleInfo>> = {
  "/files/articles/the-mashgiach-rebuilding-a-real-yiddishkeit.pdf": { headline: "The Mashgiach: Rebuilding a Real Yiddishkeit", source: "Feature", date: "June 2024" },
  "/files/articles/mishpacha-seven-becomes-eight.pdf": { headline: "Seven Becomes Eight", source: "Mishpacha Magazine" },
};
