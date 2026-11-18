/**
 * Allow-list projection (§5.2, C6–C9): builds `PublicShiur` field by field from typed inputs. It
 * copies allowed fields and never spreads a raw object, so unknown or forbidden fields (heardAs,
 * asrNotes, segs, audioKey, …) cannot reach the output. Audio URLs come from the audio table
 * (`@emunas/audio`), which reads the bucket key and emits only the encoded media URL.
 */
import { lookupAudio, type AudioTable } from "@emunas/audio";
import type { LocalizedText, UiLang } from "@emunas/i18n";
import type { Extraction, Localized, Recording, Shiur, Writeup, WriteupBlock } from "../../../../src/types.ts";
import { momentId, writeupMomentKind, type MomentKind } from "../public/moment-id.ts";
import { offsetsFor, round3 } from "../public/timeline.ts";
import type {
  KeyedValue,
  Moment,
  PublicCatalog,
  PublicChapter,
  PublicNotes,
  PublicQuestion,
  PublicRecording,
  PublicShiur,
  PublicSource,
  PublicStory,
  PublicWriteupBlock,
  SkipRange,
} from "../public/types.ts";
import type { KeyKind, Keyer } from "./keyer.ts";
import type { PublishPolicy } from "./policy.ts";
import type { ReportCollector } from "./report.ts";
import type { Meta } from "./schemas.ts";
import { TimeModel, mergeRanges, type RecTime, type SpanResult } from "./time.ts";
import { TRANSLATED_LANGS, type ShiurOverlays } from "./translations.ts";

/** Bump when the projection output changes for the same input (feeds every fingerprint). */
export const PROJECTOR_VERSION = "4";

export interface ProjectContext {
  keyer: Keyer;
  policy: PublishPolicy;
  /** Ids (moment ids) not to publish. */
  suppress: ReadonlySet<string>;
  report: ReportCollector;
  recordingsById: ReadonlyMap<string, Recording>;
  /** Series id → number of in-scope shiurim in it. */
  seriesCount: ReadonlyMap<string, number>;
  /** recordingId → media URL / playability (Amendment A1). A recording missing from it is unplayable. */
  audio: AudioTable;
}

type MutableText = { -readonly [K in keyof LocalizedText]: LocalizedText[K] };

/**
 * The published text of a raw `Localized` at overlay key `key` (`x.sections.2.title`, …): `en` and
 * `yi` from the source, plus every translated language whose current overlay has a non-blank text
 * for the key. A raw `he` field of the extraction is never published.
 */
export function localizedText(x: Pick<Localized, "en" | "yi">, key: string, overlays: ShiurOverlays = {}): LocalizedText {
  const out: MutableText = { en: x.en, yi: x.yi };
  for (const lang of TRANSLATED_LANGS) {
    const t = overlays[lang]?.get(key);
    if (t !== undefined && t.trim() !== "") out[lang] = t;
  }
  return out;
}

const BLANK: LocalizedText = { en: "", yi: "" };

/** Catalog title split on ';' (same rule as the pipeline's catalogTopics). */
export function splitCatalogTopics(title: string): string[] {
  return title
    .split(/[;؛]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function keyed(ctx: ProjectContext, kind: KeyKind, raw: string, shiurId: string): string {
  const r = ctx.keyer.key(kind, raw);
  if (!r.mapped) ctx.report.unmapped(kind, raw, r.key, shiurId);
  return r.key;
}

function keyedValue(ctx: ProjectContext, kind: KeyKind, raw: string | null, shiurId: string): KeyedValue | null {
  if (raw === null || raw.trim() === "") return null;
  return { raw, key: keyed(ctx, kind, raw, shiurId) };
}

function catalogOf(s: Shiur, topics: string[]): PublicCatalog {
  const c = s.catalog;
  const out: PublicCatalog = {
    source: c.source,
    sectionId: c.sectionId,
    sectionTitle: c.sectionTitle,
    n: c.n,
    page: c.page,
    titleOriginal: c.titleOriginal,
    subTitle: c.subTitle,
    derived: c.derived,
    note: c.note,
    topics,
  };
  if (c.heading !== undefined) out.heading = c.heading;
  return out;
}

function recordingsOf(ids: readonly string[], durations: readonly number[], audio: AudioTable): PublicRecording[] {
  const offsets = offsetsFor(durations);
  return ids.map((id, i): PublicRecording => {
    const base = { id, order: i, offset: offsets[i]!, duration: durations[i]! };
    const transcript = { eligible: false as const };
    const a = lookupAudio(audio, id);
    return a?.playable
      ? { ...base, audioUrl: a.url, cleanedUrl: a.cleanedUrl, playable: true, transcript }
      : { ...base, audioUrl: null, cleanedUrl: null, playable: false, transcript };
  });
}

/** Durations from ingest (catalog-only shiurim); unknown → 0. */
function ingestDurations(s: Shiur, ctx: ProjectContext): number[] {
  return s.recordingIds.map((id) => round3(Math.max(0, ctx.recordingsById.get(id)?.durationSec ?? 0)));
}

export interface ProjectInput {
  shiur: Shiur;
  rev: string;
  /** Present only when the status gate passed. */
  full: { meta: Meta; extraction: Extraction; writeup: Writeup } | null;
  /** Current translation overlays of this shiur (stale and invalid ones already left out). */
  overlays?: ShiurOverlays;
}

export type ProjectResult = { shiur: PublicShiur; notesError: null } | { shiur: PublicShiur; notesError: string };

/**
 * Project one shiur. When `full` is given but the notes cannot be built (a section time cannot be
 * resolved) the shiur is returned catalog-only with `notesError` set.
 */
export function projectShiur(input: ProjectInput, ctx: ProjectContext): ProjectResult {
  const s = input.shiur;
  const base = (topics: string[], recordings: PublicRecording[]): PublicShiur => {
    const total = recordings.reduce((a, r) => a + r.duration, 0);
    return {
      id: s.id,
      rev: input.rev,
      lang: s.lang,
      category: s.category,
      catalog: catalogOf(s, topics),
      parsha: keyedValue(ctx, "parsha", s.parsha, s.id),
      zman: keyedValue(ctx, "zman", s.zman, s.id),
      perek: s.perek,
      years: [...s.hebrewYears],
      series:
        s.seriesId !== null ? { id: s.seriesId, order: s.seriesOrder, count: ctx.seriesCount.get(s.seriesId) ?? 0 } : null,
      pathNotes: [...s.pathNotes],
      duration: round3(total),
      recordings,
      status: "catalog-only",
    };
  };

  const catalogOnly = () => base(splitCatalogTopics(s.catalog.titleOriginal), recordingsOf(s.recordingIds, ingestDurations(s, ctx), ctx.audio));
  if (!input.full) return { shiur: catalogOnly(), notesError: null };

  const { meta, extraction, writeup } = input.full;
  const metaById = new Map(meta.recordings.map((r) => [r.recording.id, r]));
  const durations = s.recordingIds.map((id) => round3(Math.max(0, metaById.get(id)?.durationSec ?? 0)));
  const recordings = recordingsOf(s.recordingIds, durations, ctx.audio);
  const recTimes: RecTime[] = recordings.map((r) => {
    const m = metaById.get(r.id)!;
    return { id: r.id, order: r.order, offset: r.offset, duration: r.duration, starts: m.starts, ends: m.ends };
  });
  const tm = new TimeModel(recTimes);
  const built = buildNotes(s.id, meta, extraction, writeup, tm, ctx, input.overlays ?? {});
  if (typeof built === "string") return { shiur: catalogOnly(), notesError: built };
  const out = base(meta.catalogTopics.length > 0 ? [...meta.catalogTopics] : splitCatalogTopics(s.catalog.titleOriginal), recordings);
  out.status = "full";
  out.notes = built;
  return { shiur: out, notesError: null };
}

const SKIP_KINDS = new Set(["noise", "singing", "other_speaker"]);

function buildNotes(
  shiurId: string,
  meta: Meta,
  ex: Extraction,
  wu: Writeup,
  tm: TimeModel,
  ctx: ProjectContext,
  overlays: ShiurOverlays,
): PublicNotes | string {
  const { policy, report, suppress } = ctx;
  const L = (x: Pick<Localized, "en" | "yi">, key: string): LocalizedText => localizedText(x, key, overlays);
  const id = (kind: MomentKind, i: number, sub?: number) => momentId(shiurId, kind, i, sub);
  const isSuppressed = (mid: string): boolean => {
    if (!suppress.has(mid)) return false;
    report.suppressedApplied.add(mid);
    report.dropped.suppressed++;
    return true;
  };
  /** undefined → drop; otherwise whether the item is soft. */
  const confidence = (c: number): boolean | undefined => {
    if (c < policy.dropBelow) {
      report.dropped.lowConfidence++;
      return undefined;
    }
    const soft = c < policy.softBelow;
    if (soft) report.soft++;
    return soft;
  };
  const time = (mid: string, r: SpanResult): { t: number | null; end: number | null } => {
    if (r.ok) return { t: r.span.t, end: r.span.end };
    report.time(mid, r.reason);
    return { t: null, end: null };
  };

  // ---- chapters (sections) ----
  const order = new Map(tm.recs.map((r) => [r.id, r.order]));
  const sorted = ex.sections
    .map((sec, idx) => ({ sec, idx }))
    .sort((a, b) => order.get(a.sec.recordingId)! - order.get(b.sec.recordingId)! || a.sec.startSeg - b.sec.startSeg);
  const chapters: PublicChapter[] = [];
  const chapterByIdx = new Map<number, PublicChapter>();
  for (let k = 0; k < sorted.length; k++) {
    const { sec, idx } = sorted[k]!;
    const rec = tm.rec(sec.recordingId);
    if (!rec) return `section ${idx}: recording not found`;
    const startLocal = sec.startSeg === 0 ? 0 : rec.starts[sec.startSeg];
    if (startLocal === undefined) return `section ${idx}: start segment out of range`;
    const next = sorted[k + 1];
    const nextLocal = next && next.sec.recordingId === sec.recordingId ? rec.starts[next.sec.startSeg] : rec.duration;
    if (nextLocal === undefined) return `section ${idx}: end cannot be resolved`;
    const prev = chapters[chapters.length - 1];
    // Monotonic and tiling: a chapter starts where the previous one ended.
    const t = prev && prev.recordingId === rec.id ? prev.end : tm.global(rec, startLocal);
    const end = Math.max(t, tm.global(rec, nextLocal));
    const mid = id("s", idx);
    const blank = isSuppressed(mid);
    const ch: PublicChapter = {
      idx,
      id: mid,
      recordingId: rec.id,
      t,
      end,
      title: L(sec.title, `x.sections.${idx}.title`),
      summary: blank ? BLANK : L(sec.summary, `x.sections.${idx}.summary`),
      kind: sec.kind,
      catalogTopicIdx: sec.catalogTopicIdx.filter((i) => i >= 0 && i < meta.catalogTopics.length),
      sub: sec.subsections.map((sub, j) => {
        const st = rec.starts[sub.startSeg];
        return {
          title: L(sub.title, `x.sections.${idx}.subsections.${j}.title`),
          summary: blank ? BLANK : L(sub.summary, `x.sections.${idx}.subsections.${j}.summary`),
          t: st === undefined ? t : Math.min(Math.max(t, tm.global(rec, st)), end),
        };
      }),
    };
    chapters.push(ch);
    chapterByIdx.set(idx, ch);
  }
  // The last chapter of each recording ends exactly where the next recording starts.
  for (let k = 0; k < chapters.length; k++) {
    const ch = chapters[k]!;
    const nx = chapters[k + 1];
    if (nx && nx.recordingId !== ch.recordingId) nx.t = ch.end;
  }

  // ---- skip ranges ----
  const noise: [number, number][] = [];
  for (const m of meta.recordings) {
    const rec = tm.rec(m.recording.id);
    if (!rec) continue;
    for (const f of m.noise ?? []) {
      const a = rec.starts[f.idx];
      const b = rec.ends[f.idx];
      if (a === undefined || b === undefined) continue;
      noise.push([tm.global(rec, a), tm.global(rec, b)]);
    }
  }
  const skipChapters = chapters.filter((c) => SKIP_KINDS.has(c.kind)).map((c): SkipRange => [c.t, c.end, c.kind]);
  const skip: SkipRange[] = [
    // Pause ranges (segments flagged as noise in meta.json) already inside a skippable chapter add nothing.
    ...mergeRanges(noise)
      .filter(([a, b]) => !skipChapters.some(([s, e]) => a >= s && b <= e))
      .map(([a, b]): SkipRange => [a, b, "pause"]),
    ...skipChapters,
  ].sort((x, y) => x[0] - y[0] || x[1] - y[1]);

  // ---- summary ----
  const olId = id("ol", 0);
  const abId = id("ab", 0);
  const oneLiner = isSuppressed(olId) ? BLANK : L(ex.summary.oneLiner, "x.summary.oneLiner");
  const abstract = isSuppressed(abId) ? BLANK : L(ex.summary.abstract, "x.summary.abstract");

  const momentPath = { kp: "summary.keyPoints", i: "insights", tk: "takeaways" } as const;
  const moments = (kind: "kp" | "i" | "tk", items: Extraction["insights"]): Moment[] => {
    const out: Moment[] = [];
    items.forEach((it, i) => {
      const mid = id(kind, i);
      if (isSuppressed(mid)) return;
      const soft = confidence(it.evidence.confidence);
      if (soft === undefined) return;
      const m: Moment = { id: mid, text: L(it.text, `x.${momentPath[kind]}.${i}.text`), ...time(mid, tm.span(it.evidence.recordingId, it.evidence.segs)) };
      if (soft) m.soft = true;
      out.push(m);
    });
    return out;
  };

  // ---- sources (C8) ----
  const sources: PublicSource[] = [];
  const sourceRemap = new Map<number, number>();
  ex.sources.forEach((src, i) => {
    const mid = id("src", i);
    if (src.resolution === "unresolved" && src.work === null) {
      report.dropped.unresolvedSourcesWithoutWork++;
      return;
    }
    if (isSuppressed(mid)) return;
    const soft = confidence(src.evidence.confidence);
    if (soft === undefined) return;
    const out: PublicSource = {
      idx: sources.length,
      id: mid,
      work: src.work,
      workKey: src.work !== null && src.work.trim() !== "" ? keyed(ctx, "work", src.work, shiurId) : null,
      ref: src.ref,
      sefariaRef: src.sefariaRef,
      resolution: src.resolution,
      mention: src.mention,
      t: time(mid, tm.span(src.evidence.recordingId, src.evidence.segs)).t,
    };
    if (soft) out.soft = true;
    sourceRemap.set(i, out.idx);
    sources.push(out);
  });

  // ---- questions ----
  const questions: PublicQuestion[] = [];
  ex.questions.forEach((q, i) => {
    const mid = id("q", i);
    if (isSuppressed(mid)) return;
    const soft = confidence(q.confidence);
    if (soft === undefined) return;
    const out: PublicQuestion = {
      id: mid,
      q: L(q.question, `x.questions.${i}.question`),
      a: L(q.answer, `x.questions.${i}.answer`),
      tq: time(mid, tm.span(q.recordingId, q.questionSegs)).t,
      ta: time(`${mid}:answer`, tm.span(q.recordingId, q.answerSegs)).t,
    };
    if (soft) out.soft = true;
    questions.push(out);
  });

  // ---- stories ----
  const stories: PublicStory[] = [];
  ex.stories.forEach((st, i) => {
    const mid = id("st", i);
    if (isSuppressed(mid)) return;
    const soft = confidence(st.evidence.confidence);
    if (soft === undefined) return;
    const out: PublicStory = {
      id: mid,
      title: L(st.title, `x.stories.${i}.title`),
      retelling: L(st.retelling, `x.stories.${i}.retelling`),
      // st.people (raw extraction names) is never projected: the layer's merged story names them.
      ...time(mid, tm.span(st.evidence.recordingId, st.evidence.segs)),
    };
    if (soft) out.soft = true;
    report.dropped.rawPersonNames += st.people.length;
    stories.push(out);
  });

  // ---- write-up (src remapped to the filtered source list; times default to the section's recording) ----
  // `also`: the source paragraph's moment kind for a translated write-up, whose suppression covers the translation.
  const writeupOf = (lang: UiLang, blocks: readonly WriteupBlock[], also?: MomentKind): PublicWriteupBlock[] =>
    blocks.map((b, bi) => {
      const section = ex.sections[b.sectionIndex]!;
      const ch = chapterByIdx.get(b.sectionIndex)!;
      const paragraphs = b.paragraphs.flatMap((p, pi) => {
        const mid = id(writeupMomentKind(lang), bi, pi);
        // A translation is dropped with its source paragraph (counted once, at the source).
        if (also !== undefined && suppress.has(id(also, bi, pi))) return [];
        if (isSuppressed(mid)) return [];
        const src: number[] = [];
        for (const k of p.sourceIdx) {
          const n = sourceRemap.get(k);
          if (n === undefined) {
            if (also === undefined) report.dropped.writeupRefsToDroppedSources++;
          } else if (!src.includes(n)) src.push(n);
        }
        // A paragraph belongs to its section: prefer its evidence inside the section, and keep the
        // time inside the chapter (segments that straddle a boundary end slightly past it).
        const recId = p.evidence.recordingId ?? section.recordingId;
        const inSection =
          recId === section.recordingId ? p.evidence.segs.filter((g) => g >= section.startSeg && g <= section.endSeg) : [];
        const r = tm.span(recId, inSection.length > 0 ? inSection : p.evidence.segs);
        // Time warnings are reported for the source paragraphs only; a translation has the same times.
        let { t, end } = also === undefined ? time(mid, r) : r.ok ? { t: r.span.t, end: r.span.end } : { t: null, end: null };
        if (t !== null && end !== null) {
          if ((t < ch.t || t > ch.end) && also === undefined) report.time(mid, "paragraph evidence outside its section; time clamped to the section");
          t = Math.min(Math.max(t, ch.t), ch.end);
          end = Math.min(Math.max(end, t), ch.end);
        }
        return [{ id: mid, text: p.text, src, t, end }];
      });
      return { sectionIndex: b.sectionIndex, heading: b.heading, paragraphs };
    });
  const writeup: { -readonly [K in keyof PublicNotes["writeup"]]: PublicNotes["writeup"][K] } = {
    en: writeupOf("en", wu.en),
    yi: writeupOf("yi", wu.yi),
  };
  for (const lang of TRANSLATED_LANGS) {
    const blocks = translatedWriteup(wu.yi, overlays[lang]);
    if (blocks !== null) writeup[lang] = writeupOf(lang, blocks, writeupMomentKind("yi"));
  }

  // The extraction's people list (raw names) is never projected (F.1).
  report.dropped.rawPersonNames += ex.people.length;
  return {
    summary: { oneLiner, abstract, keyPoints: moments("kp", ex.summary.keyPoints) },
    chapters,
    skip,
    sources,
    insights: moments("i", ex.insights),
    takeaways: moments("tk", ex.takeaways),
    questions,
    stories,
    writeup,
  };
}

/**
 * The `yi` write-up with every heading and paragraph text replaced by its translation
 * (`w.<block>.heading`, `w.<block>.paragraphs.<p>.text`); `sectionIndex`, `sourceIdx` and `evidence`
 * are the `yi` paragraph's. Null when the overlay is missing or leaves any text untranslated: a
 * write-up is shown whole in one language, never mixed.
 */
export function translatedWriteup(yi: readonly WriteupBlock[], text: ReadonlyMap<string, string> | undefined): WriteupBlock[] | null {
  if (text === undefined || yi.length === 0) return null;
  const tr = (k: string): string | null => {
    const t = text.get(k);
    return t !== undefined && t.trim() !== "" ? t : null;
  };
  const out: WriteupBlock[] = [];
  for (let b = 0; b < yi.length; b++) {
    const block = yi[b]!;
    let heading: string | null = null;
    if (block.heading) {
      heading = tr(`w.${b}.heading`);
      if (heading === null) return null;
    }
    const paragraphs: WriteupBlock["paragraphs"] = [];
    for (let i = 0; i < block.paragraphs.length; i++) {
      const p = block.paragraphs[i]!;
      const t = tr(`w.${b}.paragraphs.${i}.text`);
      if (t === null) return null;
      paragraphs.push({ text: t, sourceIdx: p.sourceIdx, evidence: p.evidence });
    }
    out.push({ sectionIndex: block.sectionIndex, heading, paragraphs });
  }
  return out;
}
