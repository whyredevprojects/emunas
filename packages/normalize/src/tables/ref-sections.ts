/**
 * Named sections inside Sefaria titles that are addressed as "<Book>, <Section> n:n":
 * Mishneh Torah hilchos (Rambam's order), Shulchan Arukh's four parts, Sefer HaMitzvot.
 *
 * reviewStatus "unreviewed".
 */
export const refSectionsReviewStatus = "unreviewed" as const;

export interface RefSection {
  /** Sefaria section name */
  en: string;
  he: string;
  aliases?: readonly string[];
}

/** Mishneh Torah, in the Rambam's order (Sefaria English section titles). */
export const MISHNEH_TORAH_HILCHOS: readonly RefSection[] = [
  { en: "Foundations of the Torah", he: "יסודי התורה" },
  { en: "Human Dispositions", he: "דעות" },
  { en: "Torah Study", he: "תלמוד תורה" },
  { en: "Foreign Worship and Customs of the Nations", he: "עבודה זרה וחוקות הגויים" },
  { en: "Repentance", he: "תשובה" },
  { en: "Reading the Shema", he: "קריאת שמע" },
  { en: "Prayer and the Priestly Blessing", he: "תפילה וברכת כהנים" },
  { en: "Tefillin, Mezuzah and the Torah Scroll", he: "תפילין ומזוזה וספר תורה" },
  { en: "Fringes", he: "ציצית" },
  { en: "Blessings", he: "ברכות" },
  { en: "Circumcision", he: "מילה" },
  { en: "Sabbath", he: "שבת" },
  { en: "Eruvin", he: "עירובין" },
  { en: "Rest on the Tenth of Tishrei", he: "שביתת עשור" },
  { en: "Rest on a Holiday", he: "שביתת יום טוב" },
  { en: "Leavened and Unleavened Bread", he: "חמץ ומצה" },
  { en: "Shofar, Sukkah and Lulav", he: "שופר וסוכה ולולב" },
  { en: "Sheqel Dues", he: "שקלים" },
  { en: "Sanctification of the New Month", he: "קידוש החודש" },
  { en: "Fasts", he: "תעניות" },
  { en: "Scroll of Esther and Hanukkah", he: "מגילה וחנוכה", aliases: ["Scrolls of Esther and Hanukkah", "Megillah and Chanukah"] },
  { en: "Marriage", he: "אישות" },
  { en: "Divorce", he: "גירושין" },
  { en: "Levirate Marriage and Release", he: "יבום וחליצה" },
  { en: "Virgin Maiden", he: "נערה בתולה" },
  { en: "Woman Suspected of Infidelity", he: "סוטה" },
  { en: "Forbidden Intercourse", he: "איסורי ביאה" },
  { en: "Forbidden Foods", he: "מאכלות אסורות" },
  { en: "Ritual Slaughter", he: "שחיטה" },
  { en: "Oaths", he: "שבועות" },
  { en: "Vows", he: "נדרים" },
  { en: "Nazariteship", he: "נזירות" },
  { en: "Appraisals and Devoted Property", he: "ערכים וחרמים" },
  { en: "Diverse Species", he: "כלאים" },
  { en: "Gifts to the Poor", he: "מתנות עניים" },
  { en: "Heave Offerings", he: "תרומות" },
  { en: "Tithes", he: "מעשרות" },
  { en: "Second Tithes and Fourth Year's Fruit", he: "מעשר שני ונטע רבעי" },
  { en: "First Fruits and other Gifts to Priests Outside the Sanctuary", he: "ביכורים ושאר מתנות כהונה שבגבולין" },
  { en: "Sabbatical Year and the Jubilee", he: "שמיטה ויובל" },
  { en: "The Chosen Temple", he: "בית הבחירה" },
  { en: "Vessels of the Sanctuary and Those who Serve Therein", he: "כלי המקדש והעובדים בו" },
  { en: "Admission into the Sanctuary", he: "ביאת המקדש" },
  { en: "Things Forbidden on the Altar", he: "איסורי המזבח" },
  { en: "Sacrificial Procedure", he: "מעשה הקרבנות" },
  { en: "Daily Offerings and Additional Offerings", he: "תמידין ומוספין" },
  { en: "Sacrifices Rendered Unfit", he: "פסולי המוקדשין" },
  { en: "Service on the Day of Atonement", he: "עבודת יום הכפורים" },
  { en: "Trespass", he: "מעילה" },
  { en: "Paschal Offering", he: "קרבן פסח" },
  { en: "Festival Offering", he: "חגיגה" },
  { en: "Firstlings", he: "בכורות" },
  { en: "Offerings for Unintentional Transgressions", he: "שגגות" },
  { en: "Offerings for Those with Incomplete Atonement", he: "מחוסרי כפרה" },
  { en: "Substitution", he: "תמורה" },
  { en: "Defilement by a Corpse", he: "טומאת מת" },
  { en: "Red Heifer", he: "פרה אדומה" },
  { en: "Defilement by Leprosy", he: "טומאת צרעת" },
  { en: "Those Who Defile Bed or Seat", he: "מטמאי משכב ומושב" },
  { en: "Other Sources of Defilement", he: "שאר אבות הטומאות" },
  { en: "Defilement of Foods", he: "טומאת אוכלים" },
  { en: "Vessels", he: "כלים" },
  { en: "Immersion Pools", he: "מקואות" },
  { en: "Damages to Property", he: "נזקי ממון" },
  { en: "Theft", he: "גניבה" },
  { en: "Robbery and Lost Property", he: "גזילה ואבידה" },
  { en: "One Who Injures a Person or Property", he: "חובל ומזיק" },
  { en: "Murderer and the Preservation of Life", he: "רוצח ושמירת נפש" },
  { en: "Sales", he: "מכירה" },
  { en: "Ownerless Property and Gifts", he: "זכייה ומתנה" },
  { en: "Neighbors", he: "שכנים" },
  { en: "Agents and Partners", he: "שלוחין ושותפין" },
  { en: "Slaves", he: "עבדים" },
  { en: "Hiring", he: "שכירות" },
  { en: "Borrowing and Deposit", he: "שאלה ופקדון" },
  { en: "Creditor and Debtor", he: "מלוה ולוה" },
  { en: "Plaintiff and Defendant", he: "טוען ונטען" },
  { en: "Inheritances", he: "נחלות" },
  { en: "The Sanhedrin and the Penalties within Their Jurisdiction", he: "סנהדרין והעונשין המסורין להם", aliases: ["Sanhedrin and the Penalties within their Jurisdiction"] },
  { en: "Testimony", he: "עדות" },
  { en: "Rebels", he: "ממרים" },
  { en: "Mourning", he: "אבל" },
  { en: "Kings and Wars", he: "מלכים ומלחמות" },
];

export const SHULCHAN_ARUKH_PARTS: readonly RefSection[] = [
  { en: "Orach Chayim", he: "אורח חיים", aliases: ["Orach Chayyim", "Orach Chaim"] },
  { en: "Yoreh De'ah", he: "יורה דעה", aliases: ["Yoreh Deah"] },
  { en: "Even HaEzer", he: "אבן העזר" },
  { en: "Choshen Mishpat", he: "חושן משפט" },
];

export const SEFER_HAMITZVOT_PARTS: readonly RefSection[] = [
  { en: "Positive Commandments", he: "מצוות עשה" },
  { en: "Negative Commandments", he: "מצוות לא תעשה" },
];
