/**
 * Shared state for the layer projection: the visible set, the projected shiurim, catalog order,
 * chapter lookup by time, and corpus id resolution through the retired-id redirects. Pure.
 */
import type { LocalizedText, TranslatedLang } from "@emunas/i18n";
import type { CorpusIndex, PublicChapter, PublicShiur } from "../public/types.ts";
import type { LayerMomentRef, LayerTranslationCounts } from "../public/corpus-layer.ts";
import { TRANSLATED_LANGS, currentCorpusOverlays, type CorpusOverlayFiles } from "../build/translations.ts";
import type { CorpusInput } from "./input/load.ts";
import type { ShiurTagsIn } from "./input/schemas.ts";
import type { VisibleSet } from "./input/visible.ts";
import type { CorpusPolicy } from "./policy.ts";
import { resolveCorpusRedirects, type EntityRef, type LayerIdKind, type ResolvedRedirects } from "./redirects.ts";

export const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export interface LayerContextInput {
  input: CorpusInput;
  policy: CorpusPolicy;
  visible: VisibleSet;
  shiurim: readonly PublicShiur[];
  index: CorpusIndex;
  /** Corpus translation overlay files (none: no translated text). */
  overlays?: CorpusOverlayFiles;
}

/** A corpus collection as named in overlay entry keys (`<collection>:<id>`). */
export type OverlayCollection = "concepts" | "stories" | "topics" | "teaching-clusters" | "people" | "series";

export class LayerContext {
  readonly input: CorpusInput;
  readonly policy: CorpusPolicy;
  readonly V: VisibleSet;
  readonly index: CorpusIndex;
  readonly redirects: ResolvedRedirects;
  /** Visible shiurim in catalog order. */
  readonly visibleIds: readonly string[];
  readonly warnings: string[] = [];
  /** Corpus overlay counts per translated language (all languages, zero when none). */
  readonly translationCounts: Record<TranslatedLang, LayerTranslationCounts>;
  /** Current corpus translations: language → entry key → field path → text. */
  private readonly translated: Partial<Record<TranslatedLang, ReadonlyMap<string, ReadonlyMap<string, string>>>>;
  private readonly byId: Map<string, PublicShiur>;
  private readonly pos: Map<string, number>;
  /** Live (not retired) ids per kind. */
  private readonly live: Record<LayerIdKind, ReadonlySet<string>>;

  constructor(x: LayerContextInput) {
    this.input = x.input;
    this.policy = x.policy;
    this.V = x.visible;
    this.index = x.index;
    this.byId = new Map(x.shiurim.map((s) => [s.id, s]));
    this.pos = new Map(x.index.shiurim.map((r, i) => [r.id, i]));
    this.visibleIds = [...x.visible.ids].sort(this.cmpCatalog);
    const i = x.input;
    this.redirects = resolveCorpusRedirects(i);
    const liveOf = (kind: LayerIdKind, ids: readonly string[]) =>
      new Set(ids.filter((id) => this.redirects.map[kind][id] === undefined));
    this.live = {
      topics: liveOf("topics", i.topics.map((r) => r.id)),
      concepts: liveOf("concepts", i.concepts.map((r) => r.id)),
      people: liveOf("people", i.people.map((r) => r.id)),
      works: liveOf("works", i.works.map((r) => r.id)),
      stories: liveOf("stories", (i.stories ?? []).map((r) => r.id)),
      threads: liveOf("threads", (i.teachingClusters ?? []).map((r) => r.id)),
    };
    const tr = currentCorpusOverlays(x.overlays ?? {}, {
      concepts: i.concepts,
      stories: i.stories ?? [],
      topics: i.topics,
      teachingClusters: i.teachingClusters ?? [],
      people: i.people,
      series: i.series.values(),
    });
    this.translated = tr.current;
    this.translationCounts = tr.counts;
  }

  /**
   * A generated corpus text as published: `en` and `yi` from the record, plus every translated
   * language with a current, non-blank translation of `<collection>:<id>.<field>`. A `he` the record
   * itself carries (topic labels) is kept and wins over a translation.
   */
  text(collection: OverlayCollection, id: string, field: string, v: { en: string; yi: string; he?: string }): LocalizedText {
    const out: { -readonly [K in keyof LocalizedText]: LocalizedText[K] } = { en: v.en, yi: v.yi };
    for (const lang of TRANSLATED_LANGS) {
      const own = v[lang];
      const t = own !== undefined && own.trim() !== "" ? own : this.translated[lang]?.get(`${collection}:${id}`)?.get(field);
      if (t !== undefined && t.trim() !== "") out[lang] = t;
    }
    return out;
  }

  shiur(id: string): PublicShiur | undefined {
    return this.byId.get(id);
  }

  /** Tags of a visible shiur (undefined when not visible or untagged). */
  tags(id: string): ShiurTagsIn | undefined {
    return this.V.has(id) ? this.input.shiurTags.get(id) : undefined;
  }

  cmpCatalog = (a: string, b: string): number =>
    (this.pos.get(a) ?? Number.MAX_SAFE_INTEGER) - (this.pos.get(b) ?? Number.MAX_SAFE_INTEGER) || cmpStr(a, b);

  /** Earliest Hebrew year of a shiur, null when undated. */
  year(id: string): number | null {
    const ys = this.byId.get(id)?.years ?? [];
    return ys.length > 0 ? Math.min(...ys) : null;
  }

  /** By earliest year (undated last), then catalog order. */
  cmpYear = (a: string, b: string): number => {
    const ya = this.year(a) ?? Number.POSITIVE_INFINITY;
    const yb = this.year(b) ?? Number.POSITIVE_INFINITY;
    if (ya !== yb) return ya < yb ? -1 : 1;
    return this.cmpCatalog(a, b);
  };

  /** Is `id` a live (not retired) record of `kind`? */
  isLive(kind: LayerIdKind, id: string): boolean {
    return this.live[kind].has(id);
  }

  /**
   * The live entity a reference of `kind` stands for: itself, or the entity it was merged into
   * (possibly of another kind); null when unknown.
   */
  resolveRef(kind: LayerIdKind, id: string): EntityRef | null {
    if (this.live[kind].has(id)) return { kind, id };
    const to = this.redirects.map[kind][id];
    return to !== undefined && this.live[to.kind].has(to.id) ? to : null;
  }

  /** A live id of the same kind for `id`: itself, or where it was merged into; null when unknown or moved to another kind. */
  resolve(kind: LayerIdKind, id: string): string | null {
    const r = this.resolveRef(kind, id);
    return r !== null && r.kind === kind ? r.id : null;
  }

  chapter(shiurId: string, idx: number): PublicChapter | undefined {
    return this.byId.get(shiurId)?.notes?.chapters.find((c) => c.idx === idx);
  }

  /** The chapter a time falls in (start inclusive; the end of the last chapter belongs to it). */
  chapterAt(shiurId: string, t: number | null): PublicChapter | null {
    if (t === null) return null;
    const chs = this.byId.get(shiurId)?.notes?.chapters ?? [];
    for (let k = 0; k < chs.length; k++) {
      const c = chs[k]!;
      if (t >= c.t && (t < c.end || k === chs.length - 1)) return c;
    }
    return null;
  }

  /** A visible moment of a shiur as a layer reference. */
  momentRef(shiurId: string, momentId: string, t: number | null): LayerMomentRef {
    const s = this.byId.get(shiurId)!;
    return { shiurId, momentId, chapterIdx: this.chapterAt(shiurId, t)?.idx ?? null, t, year: this.year(shiurId), lang: s.lang };
  }

  /** Order moment refs by year (undated last), catalog order, then moment id. */
  cmpRef = (a: LayerMomentRef, b: LayerMomentRef): number => this.cmpYear(a.shiurId, b.shiurId) || cmpStr(a.momentId, b.momentId);
}
