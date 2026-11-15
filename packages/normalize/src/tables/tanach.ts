/**
 * Tanach books in traditional order, with Sefaria index titles.
 *
 * `work` is the workKey the book belongs to. Shmuel, Melachim and Divrei HaYamim are one work
 * each (one sefer, two Sefaria indexes); the ref parser keeps I/II apart in the sort order.
 *
 * reviewStatus "unreviewed".
 */
export const tanachReviewStatus = "unreviewed" as const;

export type TanachSection = "torah" | "neviim" | "kesuvim";

export interface TanachBook {
  /** Sefaria index title, e.g. "Genesis", "I Samuel" */
  sefaria: string;
  /** the work this book belongs to (works table key) */
  work: string;
  section: TanachSection;
  /** 1..39 in the traditional order (Torah, Nevi'im, Kesuvim as printed in Mikraos Gedolos) */
  order: number;
  he: string;
  en: string;
  /** other titles seen in refs or names, e.g. "Bereishis" */
  aliases: readonly string[];
}

type Row = [sefaria: string, work: string, section: TanachSection, he: string, en: string, aliases?: string[]];

const ROWS: Row[] = [
  ["Genesis", "bereishis", "torah", "בראשית", "Bereishis", ["Bereshit", "Bereishit", "Breishis"]],
  ["Exodus", "shemos", "torah", "שמות", "Shemos", ["Shemot"]],
  ["Leviticus", "vayikra", "torah", "ויקרא", "Vayikra"],
  ["Numbers", "bamidbar", "torah", "במדבר", "Bamidbar", ["Bemidbar"]],
  ["Deuteronomy", "devarim", "torah", "דברים", "Devarim"],
  ["Joshua", "yehoshua", "neviim", "יהושע", "Yehoshua"],
  ["Judges", "shoftim", "neviim", "שופטים", "Shoftim"],
  ["I Samuel", "shmuel", "neviim", "שמואל א", "Shmuel I", ["1 Samuel", "Shmuel Alef"]],
  ["II Samuel", "shmuel", "neviim", "שמואל ב", "Shmuel II", ["2 Samuel", "Shmuel Beis"]],
  ["I Kings", "melachim", "neviim", "מלכים א", "Melachim I", ["1 Kings"]],
  ["II Kings", "melachim", "neviim", "מלכים ב", "Melachim II", ["2 Kings"]],
  ["Isaiah", "yeshayahu", "neviim", "ישעיהו", "Yeshayahu", ["Yeshaya", "Yeshayah"]],
  ["Jeremiah", "yirmiyahu", "neviim", "ירמיהו", "Yirmiyahu", ["Yirmeyahu"]],
  ["Ezekiel", "yechezkel", "neviim", "יחזקאל", "Yechezkel"],
  ["Hosea", "hoshea", "neviim", "הושע", "Hoshea"],
  ["Joel", "yoel", "neviim", "יואל", "Yoel"],
  ["Amos", "amos", "neviim", "עמוס", "Amos"],
  ["Obadiah", "ovadiah", "neviim", "עובדיה", "Ovadiah", ["Ovadya"]],
  ["Jonah", "yonah", "neviim", "יונה", "Yonah"],
  ["Micah", "michah", "neviim", "מיכה", "Michah", ["Micha"]],
  ["Nahum", "nachum", "neviim", "נחום", "Nachum"],
  ["Habakkuk", "chavakuk", "neviim", "חבקוק", "Chavakuk"],
  ["Zephaniah", "tzefaniah", "neviim", "צפניה", "Tzefaniah"],
  ["Haggai", "chaggai", "neviim", "חגי", "Chaggai"],
  ["Zechariah", "zechariah", "neviim", "זכריה", "Zechariah", ["Zecharyah"]],
  ["Malachi", "malachi", "neviim", "מלאכי", "Malachi"],
  ["Psalms", "tehillim", "kesuvim", "תהלים", "Tehillim", ["Tehilim"]],
  ["Proverbs", "mishlei", "kesuvim", "משלי", "Mishlei"],
  ["Job", "iyov", "kesuvim", "איוב", "Iyov"],
  ["Song of Songs", "shir-hashirim", "kesuvim", "שיר השירים", "Shir HaShirim"],
  ["Ruth", "rus", "kesuvim", "רות", "Rus", ["Megillas Rus"]],
  ["Lamentations", "eichah", "kesuvim", "איכה", "Eichah", ["Eicha"]],
  ["Ecclesiastes", "koheles", "kesuvim", "קהלת", "Koheles"],
  ["Esther", "esther", "kesuvim", "אסתר", "Esther", ["Megillas Esther"]],
  ["Daniel", "daniel", "kesuvim", "דניאל", "Daniel"],
  ["Ezra", "ezra", "kesuvim", "עזרא", "Ezra"],
  ["Nehemiah", "nechemiah", "kesuvim", "נחמיה", "Nechemiah", ["Nechemia"]],
  ["I Chronicles", "divrei-hayamim", "kesuvim", "דברי הימים א", "Divrei HaYamim I", ["1 Chronicles"]],
  ["II Chronicles", "divrei-hayamim", "kesuvim", "דברי הימים ב", "Divrei HaYamim II", ["2 Chronicles"]],
];

export const TANACH: readonly TanachBook[] = ROWS.map(([sefaria, work, section, he, en, aliases], i) => ({
  sefaria,
  work,
  section,
  order: i + 1,
  he,
  en,
  aliases: aliases ?? [],
}));
