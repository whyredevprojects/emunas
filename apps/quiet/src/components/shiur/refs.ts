/**
 * The shiur page's corpus-layer line (concept-quiet-corpus C4.8; corpus-wave-plan §3.3 per-shiur
 * refs): `topicLine`, a pure function from the shiur's `.corpus/layer/shiur/<id>.json` refs and the
 * layer's topic records to the topics printed under the abstract (salience ≥ 0.6, at most five, as
 * links to their topic pages). Section-level topics are never printed here (they are too fine to read).
 *
 * Every link goes through `@emunas/links` with the layer's page flags: an entry with a Quiet page
 * links there, one listed in its index without a page links to its index anchor, and one that is
 * in no index (a family member, a type-other person under the line threshold, a generic work) is
 * printed as plain text. The layer only holds the visible set, so a shiur that is not in it has no
 * refs and no topic line. Records are read defensively: the pipeline's data keeps growing
 * and its shape may change.
 *
 * Browser-safe and framework-free (types only from the layer reader), so it is unit-tested
 * without Astro. Nothing here reads raw data or any transcript-bearing field.
 */
import { formatQuiet, type CorpusKind, type LinkData } from "@emunas/links";
import type { LayerConcept, LayerPerson, LayerShiurRefs, LayerStory, LayerTopicNode, LayerWork } from "@emunas/corpus/public";
import type { Ed } from "../../lib/edition.ts";
import { editionName } from "../corpus/model.ts";
import { iri } from "./view.ts";

/** Shiur-level salience at which a topic is what the shiur is about (Quiet C4.1 grade 1, C4.8). */
export const TOPIC_LINE_MIN_SALIENCE = 0.6;
/** At most this many topics on the ענינים line (Quiet C4.8). */
export const TOPIC_LINE_MAX = 5;

/** The parts of the Quiet layer reader (`../corpus/layer.ts`) the shiur page reads. */
export interface ShiurLayer {
  topic(id: string): LayerTopicNode | undefined;
  person(id: string): LayerPerson | undefined;
  concept(id: string): LayerConcept | undefined;
  work(id: string): LayerWork | undefined;
  story(id: string): LayerStory | undefined;
  /** Page flags and concept → topic (`@emunas/links` `pageLookupFromLayer`). */
  readonly links: Pick<LinkData, "hasPage" | "conceptTopic">;
}

/** A name to print, with its link (null: plain text). */
export interface NamedLink {
  readonly id: string;
  readonly name: string;
  readonly href: string | null;
  /** The name is in Hebrew script (set right to left). */
  readonly hebrew: boolean;
}

const HEBREW = /[֐-׿]/;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const isHebrew = (s: string): boolean => HEBREW.test(s);

/** Whether an entry has a Quiet page (layer flag; read as `=== true`). */
function hasQuietPage(layer: ShiurLayer, kind: CorpusKind, id: string): boolean {
  return layer.links.hasPage?.("quiet", kind, id) === true;
}

/**
 * Whether the entry is printed in its Quiet index, so that its index anchor exists. Topics,
 * glossary entries and stories are all listed; people follow the layer's `listed` flag and the
 * family/private/owner exclusion; works are all listed except generic labels without a page
 * (`kind` genre with no child works).
 */
function listedOnQuiet(layer: ShiurLayer, kind: CorpusKind, id: string): boolean {
  switch (kind) {
    case "topic":
      return layer.topic(id) !== undefined;
    case "concept":
      return layer.concept(id) !== undefined;
    case "story":
      return layer.story(id) !== undefined;
    case "person": {
      const p = layer.person(id);
      return p !== undefined && (p.excluded ?? null) === null && p.listed?.quiet === true;
    }
    case "work": {
      const w = layer.work(id);
      return w !== undefined && w.generic !== true;
    }
    case "thread":
      return false;
  }
}

/**
 * The Quiet link of a corpus entry: its page, else its index anchor when it is listed, else null
 * (plain text). A glossary term merged into a topic links to that topic (one inyan, one entry).
 */
export function entryHref(ed: Ed, layer: ShiurLayer, kind: CorpusKind, id: string): string | null {
  if (kind === "thread" || id === "") return null;
  if (kind === "concept") {
    const topic = layer.links.conceptTopic?.(id);
    if (topic && layer.topic(topic) !== undefined) return entryHref(ed, layer, "topic", topic);
  }
  if (!hasQuietPage(layer, kind, id) && !listedOnQuiet(layer, kind, id)) return null;
  return iri(formatQuiet({ kind: "entry", ed, entry: kind, id }, layer.links));
}

// ---------------------------------------------------------------- names in the edition

/**
 * A topic's label in the edition: English in the English edition; Yiddish (else Hebrew) in the
 * Yiddish; Hebrew (else Yiddish) in the Hebrew (`editionName`).
 */
export function topicName(ed: Ed, node: Pick<LayerTopicNode, "label">): string {
  const l = node.label;
  return editionName(ed, { en: str(l?.en), yi: str(l?.yi), he: str(l?.he) });
}

// ---------------------------------------------------------------- the ענינים line

/**
 * Under the abstract: the shiur's topics at salience ≥ 0.6, highest first, at most five, each
 * linked to its topic entry. Topics missing from the tree are skipped (never a dead link).
 */
export function topicLine(ed: Ed, layer: ShiurLayer, refs: Pick<LayerShiurRefs, "topics"> | null | undefined): NamedLink[] {
  const list = Array.isArray(refs?.topics) ? refs.topics : [];
  const ranked = list
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => typeof t?.id === "string" && typeof t.salience === "number" && t.salience >= TOPIC_LINE_MIN_SALIENCE)
    .sort((a, b) => b.t.salience - a.t.salience || a.i - b.i);
  const out: NamedLink[] = [];
  const seen = new Set<string>();
  for (const { t } of ranked) {
    if (out.length >= TOPIC_LINE_MAX) break;
    if (seen.has(t.id)) continue;
    const node = layer.topic(t.id);
    if (!node) continue;
    const name = topicName(ed, node);
    const href = entryHref(ed, layer, "topic", t.id);
    if (name === "" || href === null) continue;
    seen.add(t.id);
    out.push({ id: t.id, name, href, hebrew: isHebrew(name) });
  }
  return out;
}
