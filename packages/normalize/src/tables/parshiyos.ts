/**
 * Parsha table: the 54 sedros plus the 7 combined parshiyos.
 *
 * - `key`: stable ASCII key (Ashkenazi transliteration). Shares one occasion namespace with the
 *   zman keys in `occasions.ts`; a test asserts they are disjoint.
 * - `order`: 1..54 in Torah order; a combined parsha sorts right after its first part (n + 0.5).
 * - `chumash`: workKey of the book (`tanach.ts`).
 * - `hebcal`: the name `@hebcal/core` uses (diaspora/Israel schedule lookups in @emunas/calendar).
 * - `aliases`: catalog spellings and common variants. Matching is on `foldBasic`, so quote marks,
 *   hyphens and case do not need their own aliases. The canonical `he` is always an alias.
 *
 * reviewStatus "unreviewed": a person should confirm labels and spellings.
 */
export const parshiyosReviewStatus = "unreviewed" as const;

export type ChumashKey = "bereishis" | "shemos" | "vayikra" | "bamidbar" | "devarim";

export interface Parsha {
  key: string;
  order: number;
  chumash: ChumashKey;
  he: string;
  yi: string;
  en: string;
  hebcal: string;
  /** for combined parshiyos: the keys of the two parts, in order */
  parts?: readonly [string, string];
  aliases: readonly string[];
}

type Row = [key: string, chumash: ChumashKey, he: string, en: string, hebcal: string, aliases?: string[]];

const SINGLE: Row[] = [
  ["bereishis", "bereishis", "בראשית", "Bereishis", "Bereshit"],
  ["noach", "bereishis", "נח", "Noach", "Noach"],
  ["lech-lecha", "bereishis", "לך לך", "Lech Lecha", "Lech-Lecha"],
  ["vayeira", "bereishis", "וירא", "Vayeira", "Vayera"],
  ["chayei-sarah", "bereishis", "חיי שרה", "Chayei Sarah", "Chayei Sara"],
  ["toldos", "bereishis", "תולדות", "Toldos", "Toldot", ["תולדת"]],
  ["vayeitzei", "bereishis", "ויצא", "Vayeitzei", "Vayetzei"],
  ["vayishlach", "bereishis", "וישלח", "Vayishlach", "Vayishlach"],
  ["vayeishev", "bereishis", "וישב", "Vayeishev", "Vayeshev"],
  ["mikeitz", "bereishis", "מקץ", "Mikeitz", "Miketz"],
  ["vayigash", "bereishis", "ויגש", "Vayigash", "Vayigash"],
  ["vayechi", "bereishis", "ויחי", "Vayechi", "Vayechi"],
  ["shemos", "shemos", "שמות", "Shemos", "Shemot"],
  ["vaeira", "shemos", "וארא", "Va'eira", "Vaera"],
  ["bo", "shemos", "בא", "Bo", "Bo"],
  ["beshalach", "shemos", "בשלח", "Beshalach", "Beshalach"],
  ["yisro", "shemos", "יתרו", "Yisro", "Yitro"],
  ["mishpatim", "shemos", "משפטים", "Mishpatim", "Mishpatim"],
  ["terumah", "shemos", "תרומה", "Terumah", "Terumah"],
  ["tetzaveh", "shemos", "תצוה", "Tetzaveh", "Tetzaveh", ["תצווה"]],
  ["ki-sisa", "shemos", "כי תשא", "Ki Sisa", "Ki Tisa"],
  ["vayakhel", "shemos", "ויקהל", "Vayakhel", "Vayakhel"],
  ["pekudei", "shemos", "פקודי", "Pekudei", "Pekudei"],
  ["vayikra", "vayikra", "ויקרא", "Vayikra", "Vayikra"],
  ["tzav", "vayikra", "צו", "Tzav", "Tzav"],
  ["shemini", "vayikra", "שמיני", "Shemini", "Shmini"],
  ["tazria", "vayikra", "תזריע", "Tazria", "Tazria"],
  ["metzora", "vayikra", "מצורע", "Metzora", "Metzora"],
  ["acharei-mos", "vayikra", "אחרי מות", "Acharei Mos", "Achrei Mot", ["Acharei Mot"]],
  ["kedoshim", "vayikra", "קדושים", "Kedoshim", "Kedoshim"],
  ["emor", "vayikra", "אמור", "Emor", "Emor"],
  ["behar", "vayikra", "בהר", "Behar", "Behar"],
  ["bechukosai", "vayikra", "בחקותי", "Bechukosai", "Bechukotai", ["בחקתי"]],
  ["bamidbar", "bamidbar", "במדבר", "Bamidbar", "Bamidbar"],
  ["nasso", "bamidbar", "נשא", "Nasso", "Nasso"],
  ["behaaloscha", "bamidbar", "בהעלותך", "Beha'aloscha", "Beha'alotcha"],
  ["shelach", "bamidbar", "שלח", "Shelach", "Sh'lach", ["שלח לך"]],
  ["korach", "bamidbar", "קרח", "Korach", "Korach"],
  ["chukas", "bamidbar", "חקת", "Chukas", "Chukat", ["חוקת"]],
  ["balak", "bamidbar", "בלק", "Balak", "Balak"],
  ["pinchas", "bamidbar", "פינחס", "Pinchas", "Pinchas", ["פנחס"]],
  ["matos", "bamidbar", "מטות", "Matos", "Matot"],
  ["masei", "bamidbar", "מסעי", "Masei", "Masei"],
  ["devarim", "devarim", "דברים", "Devarim", "Devarim"],
  ["vaeschanan", "devarim", "ואתחנן", "Va'eschanan", "Vaetchanan"],
  ["eikev", "devarim", "עקב", "Eikev", "Eikev"],
  ["reeh", "devarim", "ראה", "Re'eh", "Re'eh"],
  ["shoftim", "devarim", "שופטים", "Shoftim", "Shoftim"],
  ["ki-seitzei", "devarim", "כי תצא", "Ki Seitzei", "Ki Teitzei"],
  ["ki-savo", "devarim", "כי תבוא", "Ki Savo", "Ki Tavo", ["כי תבא"]],
  ["nitzavim", "devarim", "נצבים", "Nitzavim", "Nitzavim", ["ניצבים"]],
  ["vayeilech", "devarim", "וילך", "Vayeilech", "Vayeilech"],
  ["haazinu", "devarim", "האזינו", "Ha'azinu", "Ha'azinu"],
  ["vezos-haberachah", "devarim", "וזאת הברכה", "Vezos Haberachah", "Vezot Haberakhah"],
];

type CombinedRow = [first: string, second: string, he: string, en: string, hebcal: string, aliases?: string[]];

const COMBINED: CombinedRow[] = [
  ["vayakhel", "pekudei", "ויקהל פקודי", "Vayakhel-Pekudei", "Vayakhel-Pekudei"],
  ["tazria", "metzora", "תזריע מצורע", "Tazria-Metzora", "Tazria-Metzora"],
  ["acharei-mos", "kedoshim", "אחרי מות קדושים", "Acharei Mos-Kedoshim", "Achrei Mot-Kedoshim"],
  ["behar", "bechukosai", "בהר בחקותי", "Behar-Bechukosai", "Behar-Bechukotai", ["בהר בחקתי"]],
  ["chukas", "balak", "חקת בלק", "Chukas-Balak", "Chukat-Balak", ["חוקת בלק"]],
  ["matos", "masei", "מטות מסעי", "Matos-Masei", "Matot-Masei"],
  ["nitzavim", "vayeilech", "נצבים וילך", "Nitzavim-Vayeilech", "Nitzavim-Vayeilech", ["ניצבים וילך"]],
];

function build(): Parsha[] {
  const out: Parsha[] = [];
  SINGLE.forEach(([key, chumash, he, en, hebcal, aliases], i) => {
    out.push({ key, order: i + 1, chumash, he, yi: he, en, hebcal, aliases: [he, en, hebcal, ...(aliases ?? [])] });
  });
  for (const [a, b, he, en, hebcal, aliases] of COMBINED) {
    const first = out.find((p) => p.key === a);
    if (!first) throw new Error(`parshiyos: unknown part ${a}`);
    out.push({
      key: `${a}-${b}`,
      order: first.order + 0.5,
      chumash: first.chumash,
      he,
      yi: he,
      en,
      hebcal,
      parts: [a, b],
      aliases: [he, en, hebcal, ...(aliases ?? [])],
    });
  }
  return out.sort((x, y) => x.order - y.order);
}

export const PARSHIYOS: readonly Parsha[] = build();
