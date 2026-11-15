/**
 * ערכים, the glossary (Quiet C4.2, C6; corpus-wave-plan C2.1), on the merged concepts of the
 * corpus layer.
 *
 * - One long page, aleph to tav by the Hebrew headword (`canonicalHe`, in both editions): the
 *   gloss from `label` in the edition's language, the generated definition, and a count.
 * - A term with a page (five or more shiurim, by the layer's flags) links to it. A term in fewer
 *   shiurim carries its shiurim on the line. A passim term (above about one shiur in seven) says
 *   "throughout" in place of a list.
 * - A concept merged into a topic (`mergedIntoTopic`, from the topic's `sameAs`) has no glossary
 *   page: its line links to the topic, where its graded list lives.
 * - An entry page: definition, "well illustrated in" (`exampleRefs`, each a section title with its
 *   time, linking to that section), then the shiurim (or "throughout").
 */
import { corpusLabel } from "@emunas/i18n";
import type { LayerConcept } from "@emunas/corpus/public";
import { clock } from "../../lib/bidi.ts";
import type { Ed } from "../../lib/edition.ts";
import type { EntryData } from "../indexes/entries.ts";
import { citeShiur, citeShiurim, entryHref, hasEntryPage, hebrewRun, nameSortForm, ownTextOf, run, str, strings, textOf } from "../indexes/entry-model.ts";
import { byLetter, letterOf, sectionHref, type Cite, type LetterBlock, type Run } from "../indexes/model.ts";
import { useIndexesT } from "../indexes/strings.ts";

export interface GlossaryLine {
  readonly id: string;
  readonly he: Run;
  /** The gloss in the edition's language (null when it only repeats the headword). */
  readonly gloss: Run | null;
  readonly definition: Run | null;
  readonly letter: string;
  readonly count: number;
  readonly countText: string;
  /** The entry page, or the topic it is merged into; null when neither (then `cites` or `throughout`). */
  readonly href: string | null;
  /** The line links to a topic page. */
  readonly toTopic: boolean;
  /** Passim: "throughout" in place of a list. */
  readonly throughout: boolean;
  readonly cites: readonly Cite[];
}

const collator = new Intl.Collator("he", { sensitivity: "base", numeric: true });

function glossOf(c: LayerConcept, ed: Ed, he: string): Run | null {
  const g = ownTextOf(c.label, ed);
  return g === "" || g === he ? null : run(g, ed);
}

function definitionOf(c: LayerConcept, ed: Ed): Run | null {
  const text = textOf(c.definition, ed);
  return text === "" ? null : run(text, ed);
}

/** The glossary, aleph to tav, in blocks by letter. */
export function glossaryIndex(d: EntryData, ed: Ed): LetterBlock<GlossaryLine>[] {
  const t = useIndexesT(ed);
  const lines: GlossaryLine[] = [];
  for (const c of d.layer.concepts) {
    const he = str(c.canonicalHe);
    if (he === "") continue;
    const count = Number.isInteger(c.count) ? c.count : strings(c.shiurIds).length;
    const merged = typeof c.mergedIntoTopic === "string" && c.mergedIntoTopic !== "";
    const page = !merged && hasEntryPage(d, "concept", c.id);
    const throughout = c.passim === true;
    lines.push({
      id: c.id,
      he: hebrewRun(he),
      gloss: glossOf(c, ed, he),
      definition: definitionOf(c, ed),
      letter: letterOf(he),
      count,
      countText: t("count.shiurim", { count }),
      // A merged concept's entry route resolves to its topic (@emunas/links).
      href: merged || page ? entryHref(d, ed, "concept", c.id) : null,
      toTopic: merged,
      throughout,
      cites: merged || page || throughout ? [] : citeShiurim(d, ed, c.shiurIds),
    });
  }
  lines.sort((a, b) => collator.compare(nameSortForm(a.he.text), nameSortForm(b.he.text)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // Letters outside א-ת (a Latin or digit headword) come last as one block.
  const hebrew = lines.filter((l) => l.letter !== "#" && /[א-ת]/.test(l.letter));
  const rest = lines.filter((l) => !hebrew.includes(l)).map((l) => ({ ...l, letter: "#" }));
  return byLetter([...hebrew, ...rest]);
}

export interface ExampleLine {
  readonly shiurId: string;
  /** The section title (else the shiur's citation text). */
  readonly title: Run;
  readonly time: string;
  readonly href: string;
  readonly cite: Cite;
}

export interface ConceptPage {
  readonly id: string;
  readonly he: Run;
  readonly gloss: Run | null;
  readonly definition: Run | null;
  readonly also: readonly Run[];
  readonly countText: string;
  readonly examples: readonly ExampleLine[];
  readonly throughout: boolean;
  readonly throughoutText: string;
  readonly shiurim: readonly Cite[];
  readonly reviewed: boolean;
}

export function conceptPage(d: EntryData, ed: Ed, c: LayerConcept): ConceptPage {
  const t = useIndexesT(ed);
  const he = str(c.canonicalHe);
  const count = Number.isInteger(c.count) ? c.count : strings(c.shiurIds).length;
  const examples: ExampleLine[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(c.exampleRefs) ? c.exampleRefs : []) {
    if (typeof r?.shiurId !== "string" || !Number.isInteger(r.sectionIndex)) continue;
    const key = `${r.shiurId}~s${r.sectionIndex}`;
    if (seen.has(key)) continue;
    const ch = d.chapters(r.shiurId).get(r.sectionIndex);
    const at = typeof r.t === "number" && Number.isFinite(r.t) ? r.t : ch?.t;
    if (at === undefined) continue;
    const href = sectionHref(ed, r.shiurId, r.sectionIndex);
    const cite = citeShiur(d, ed, r.shiurId, null, href);
    if (!cite) continue;
    seen.add(key);
    const title = ch ? textOf(ch.title, ed) : "";
    examples.push({ shiurId: r.shiurId, title: title === "" ? cite.occasion : run(title, ed), time: clock(at), href, cite });
  }
  const throughout = c.passim === true;
  const gloss = glossOf(c, ed, he);
  return {
    id: c.id,
    he: hebrewRun(he),
    gloss,
    definition: definitionOf(c, ed),
    also: strings(c.transliterations)
      .filter((x) => x !== he && x !== gloss?.text)
      .map((x) => run(x, ed)),
    countText: t("count.shiurim", { count }),
    examples,
    throughout,
    throughoutText: `${corpusLabel("throughout", ed)} (${t("count.shiurim", { count })})`,
    shiurim: throughout ? [] : citeShiurim(d, ed, c.shiurIds),
    reviewed: c.reviewed === true,
  };
}

/** Concepts with a glossary page (never one merged into a topic: the layer's flags). */
export function conceptPageIds(d: EntryData): string[] {
  return d.layer.concepts.filter((c) => !c.mergedIntoTopic && hasEntryPage(d, "concept", c.id)).map((c) => c.id);
}
