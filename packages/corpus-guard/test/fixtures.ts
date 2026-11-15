/**
 * Synthetic fixture: one fake transcript and a tiny `.corpus/` built from invented words,
 * so tests can plant runs of exact lengths and grep reports for them.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** 30 invented-looking tokens; any window of it is a "transcript run". */
export const SENTENCE = [
  "zebrafinch", "quantumleaf", "lanternmoss", "orchardwind", "whispercoal", "copperfern", "meadowlark",
  "falconreed", "velvetbrook", "harborsalt", "crimsonpeak", "glacierbell", "tundrafox", "mosaicrain",
  "embertide", "saffronhill", "pebblecreek", "thunderoak", "willowgate", "cobaltmoon", "nectarvale",
  "ospreycliff", "juniperdawn", "quartzhollow", "bramblewick", "marigoldfen", "sparrowmist", "cinderfield",
  "larkspurrow", "hazelridge",
];

/** A Yiddish/Hebrew stretch (with nikud and a gershayim) for the same transcript. */
export const HEBREW = "בְּרֵאשִׁית בָּרָא אֱלֹקִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ חז״ל זאגן אז די וועלט איז באשאפן געווארן פאר די תורה און פאר ישראל ווייל";

export const SHIUR = "yi-test-shiur-01";
export const REC = "yi-test-rec-01";
export const OTHER_SHIUR = "yi-test-shiur-02";
export const OTHER_REC = "yi-test-rec-02";

export function words(from: number, n: number): string {
  return SENTENCE.slice(from, from + n).join(" ");
}

export const FILLER = "the rav explains this idea at length with care and warmth for everyone listening";

export interface Fixture {
  root: string;
  transcripts: string;
  corpus: string;
  site: string;
  cleanup: () => void;
}

export function shiurJson(
  overrides: { keyPoint?: string; insight?: string; takeaway?: string; paragraph?: string } = {},
  sid = SHIUR,
  rec = REC,
) {
  return {
    id: sid,
    rev: "r1",
    lang: "yi",
    category: "parsha",
    catalog: { titleOriginal: "בראשית", sectionTitle: "Parsha", topics: [] },
    recordings: [{ id: rec, order: 0, offset: 0, duration: 100, audioUrl: `https://media.emunas.example/shiurim/${rec}.mp3`, playable: true, transcript: { eligible: false } }],
    status: "full",
    notes: {
      summary: {
        oneLiner: { en: "A short line.", yi: "א קורצע שורה." },
        abstract: { en: FILLER, yi: "א תקציר" },
        keyPoints: [
          { id: `${sid}~kp0`, text: { en: overrides.keyPoint ?? FILLER, yi: "נקודה" }, t: 1, end: 2 },
        ],
      },
      chapters: [
        { idx: 0, t: 0, end: 50, title: { en: "Opening", yi: "אנהייב" }, summary: { en: FILLER, yi: "" }, kind: "intro",
          catalogTopicIdx: [], sub: [{ title: { en: "Sub", yi: "" }, summary: { en: "sub summary", yi: "" }, t: 3 }] },
      ],
      skip: [],
      sources: [],
      insights: [{ id: `${sid}~i0`, text: { en: overrides.insight ?? FILLER, yi: "" }, t: 4, end: 5 }],
      takeaways: [{ id: `${sid}~tk0`, text: { en: overrides.takeaway ?? FILLER, yi: "" }, t: 6, end: 7 }],
      questions: [],
      stories: [],
      people: [],
      concepts: [],
      writeup: {
        en: [{ sectionIndex: 0, heading: "Heading", paragraphs: [{ text: overrides.paragraph ?? FILLER, src: [], t: 0, end: 10 }] }],
        yi: [{ sectionIndex: 0, heading: null, paragraphs: [{ text: "א פאראגראף", src: [], t: 0, end: 10 }] }],
      },
    },
  };
}

export function makeFixture(opts: { shiur?: unknown; allow?: string[] } = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), "corpus-guard-"));
  const transcripts = join(root, "transcripts");
  const corpus = join(root, ".corpus");
  const site = join(root, "site-policy");
  mkdirSync(transcripts, { recursive: true });
  mkdirSync(join(corpus, "shiurim"), { recursive: true });
  mkdirSync(site, { recursive: true });

  // The sentence is split across segments (runs may cross segment boundaries), with odd casing and punctuation.
  const segs: [number, number, string][] = [
    [0, 5, "Um, " + SENTENCE.slice(0, 12).map((w, i) => (i % 3 === 0 ? w.toUpperCase() : w)).join(", ")],
    [5, 10, SENTENCE.slice(12).join(" ") + "."],
    [10, 15, HEBREW],
  ];
  writeFileSync(join(transcripts, `${REC}.json`), JSON.stringify({
    recordingId: REC, key: "x", duration: 15, model: "m", mode: null, transcribedAt: null, language: null, segments: segs,
  }));
  writeFileSync(join(transcripts, `${OTHER_REC}.json`), JSON.stringify({
    recordingId: OTHER_REC, key: "y", duration: 5, model: "m", mode: null, transcribedAt: null, language: null,
    segments: [[0, 5, "completely different words about another subject entirely and nothing else at all here today friends"]],
  }));

  writeFileSync(join(corpus, "shiurim", `${SHIUR}.json`), JSON.stringify(opts.shiur ?? shiurJson()));
  const other = shiurJson({}, OTHER_SHIUR, OTHER_REC);
  writeFileSync(join(corpus, "shiurim", `${OTHER_SHIUR}.json`), JSON.stringify(other));

  writeFileSync(join(site, "verbatim-allow.json"), JSON.stringify((opts.allow ?? []).map((id) => ({ id, reason: "test", reviewedBy: "t", reviewedAt: "2026-11-15" }))));
  writeFileSync(join(site, "publish-policy.json"), JSON.stringify({ policyVersion: 1, suppress: [], allowVerbatim: [] }));
  writeFileSync(join(site, "transcript-eligibility.json"), JSON.stringify({ policyVersion: 1, eligible: {} }));

  return { root, transcripts, corpus, site, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export function writeFile(path: string, content: string | Uint8Array): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}
