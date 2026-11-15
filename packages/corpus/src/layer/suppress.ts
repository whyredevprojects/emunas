/**
 * Corpus-layer suppression (corpus-wave-plan §3.4, C1.3): `corpus:build --suppress` blanks each
 * generated corpus text field the guard pre-pass listed. The entity stays, with its counts, links
 * and page flags, so its page shows the AI label without the text.
 *
 * Item ids (the same scheme as `@emunas/corpus-guard`'s layer reader):
 * `corpus:<kind>:<entityId>#<field>.<lang>`
 *
 * | kind      | file               | fields                                              |
 * |-----------|--------------------|-----------------------------------------------------|
 * | `story`   | stories.json       | `title`, `retelling`                                |
 * | `thread`  | threads.json       | `label`, `summary`                                  |
 * | `topic`   | topics.json detail | `description`                                       |
 * | `concept` | concepts.json      | `label`, `definition`                               |
 * | `person`  | people.json        | `description`                                       |
 * | `series`  | series/<id>.json   | `title`, `overview`, `keyThemes.<i>`, `arc.<shiurId>` (its `oneLiner`) |
 *
 * Ids come from `site-policy/publish-policy.json` `suppress[]` and the guard's suppress file; ids
 * that are not corpus ids are the projector's business and are ignored here. A corpus id that
 * matches no field is reported, never an error (the entity may have left the visible set).
 * The report holds ids only.
 */
import { loadPublishPolicy, loadSuppressFile } from "../build/policy.ts";
import { LAYER_FILES } from "../public/corpus-layer.ts";
import type {
  LayerConceptsFile,
  LayerPeopleFile,
  LayerSeries,
  LayerStoriesFile,
  LayerThreadsFile,
  LayerTopicsFile,
} from "../public/corpus-layer.ts";
import type { L } from "../public/types.ts";

export const CORPUS_ITEM_PREFIX = "corpus:";

export const CORPUS_ITEM_KINDS = ["story", "thread", "topic", "concept", "person", "series"] as const;
export type CorpusItemKind = (typeof CORPUS_ITEM_KINDS)[number];

export interface CorpusItemRef {
  kind: CorpusItemKind;
  entityId: string;
  /** `retelling`, `keyThemes.2`, `arc.<shiurId>`, … */
  field: string;
  lang: string;
}

const ITEM_RE = /^corpus:(story|thread|topic|concept|person|series):([^#\s]+)#([A-Za-z]+(?:\.[^.#\s]+)?)\.([a-z]{2})$/;

export function isCorpusItemId(id: string): boolean {
  return id.startsWith(CORPUS_ITEM_PREFIX);
}

export function corpusItemId(ref: CorpusItemRef): string {
  return `${CORPUS_ITEM_PREFIX}${ref.kind}:${ref.entityId}#${ref.field}.${ref.lang}`;
}

/** Parse a corpus item id; null when it is not one (or malformed). */
export function parseCorpusItemId(id: string): CorpusItemRef | null {
  const m = ITEM_RE.exec(id);
  if (!m) return null;
  return { kind: m[1] as CorpusItemKind, entityId: m[2]!, field: m[3]!, lang: m[4]! };
}

/** Corpus item ids from the publish policy and the guard's suppress file (deduplicated, sorted). */
export function loadCorpusSuppressIds(opts: { policyDir: string; suppressFile?: string | undefined }): string[] {
  const ids = [...loadPublishPolicy(opts.policyDir).suppress, ...(opts.suppressFile ? loadSuppressFile(opts.suppressFile) : [])];
  return [...new Set(ids.filter(isCorpusItemId))].sort();
}

export interface CorpusSuppressReport {
  /** Ids whose field was blanked (sorted). */
  applied: string[];
  /** Corpus ids that matched no field, or are malformed (sorted). */
  unmatched: string[];
}

type Bilingual = L | Record<string, string>;

/** Blank `lang` in a bilingual object; true when the field existed (and is now empty). */
function blank(obj: Bilingual | null | undefined, lang: string): boolean {
  if (obj === null || obj === undefined || typeof obj !== "object") return false;
  const rec = obj as Record<string, unknown>;
  if (typeof rec[lang] !== "string") return false;
  rec[lang] = "";
  return true;
}

function blankEntityField(
  rec: Record<string, unknown> | undefined,
  ref: CorpusItemRef,
  fields: readonly string[],
): boolean {
  if (rec === undefined || !fields.includes(ref.field)) return false;
  return blank(rec[ref.field] as Bilingual | null | undefined, ref.lang);
}

/**
 * Blank the suppressed corpus fields in place in a layer file map (`LayerOutput.files`: path inside
 * `.corpus/layer/` → content) and add one warning line per id to `layer.json` `warnings`.
 */
export function applyCorpusSuppress(files: Record<string, unknown>, ids: readonly string[]): CorpusSuppressReport {
  const applied: string[] = [];
  const unmatched: string[] = [];
  const stories = files[LAYER_FILES.stories] as LayerStoriesFile | undefined;
  const threads = files[LAYER_FILES.threads] as LayerThreadsFile | undefined;
  const topics = files[LAYER_FILES.topics] as LayerTopicsFile | undefined;
  const concepts = files[LAYER_FILES.concepts] as LayerConceptsFile | undefined;
  const people = files[LAYER_FILES.people] as LayerPeopleFile | undefined;
  const byId = <T extends { id: string }>(xs: readonly T[] | undefined, id: string) =>
    xs?.find((x) => x.id === id) as unknown as Record<string, unknown> | undefined;

  for (const id of [...new Set(ids.filter(isCorpusItemId))].sort()) {
    const ref = parseCorpusItemId(id);
    let ok = false;
    if (ref !== null) {
      switch (ref.kind) {
        case "story":
          ok = blankEntityField(byId(stories?.stories, ref.entityId), ref, ["title", "retelling"]);
          break;
        case "thread":
          ok = blankEntityField(byId(threads?.threads, ref.entityId), ref, ["label", "summary"]);
          break;
        case "topic":
          ok = blankEntityField(byId(topics?.detail, ref.entityId), ref, ["description"]);
          break;
        case "concept":
          ok = blankEntityField(byId(concepts?.concepts, ref.entityId), ref, ["label", "definition"]);
          break;
        case "person":
          ok = blankEntityField(byId(people?.people, ref.entityId), ref, ["description"]);
          break;
        case "series": {
          const s = files[`${LAYER_FILES.seriesDir}/${ref.entityId}.json`] as LayerSeries | undefined;
          if (s === undefined) break;
          if (ref.field === "title" || ref.field === "overview") ok = blank(s[ref.field], ref.lang);
          else if (ref.field.startsWith("keyThemes.")) {
            const i = Number(ref.field.slice("keyThemes.".length));
            ok = Number.isInteger(i) && i >= 0 && blank(s.keyThemes[i], ref.lang);
          } else if (ref.field.startsWith("arc.")) {
            const sid = ref.field.slice("arc.".length);
            ok = blank(s.arc.find((a) => a.shiurId === sid)?.oneLiner, ref.lang);
          }
          break;
        }
      }
    }
    (ok ? applied : unmatched).push(id);
  }

  const info = files[LAYER_FILES.layer] as { warnings?: string[] } | undefined;
  if (info && Array.isArray(info.warnings)) {
    for (const id of applied) info.warnings.push(`suppressed ${id}: text blanked (verbatim run)`);
    for (const id of unmatched) info.warnings.push(`suppress id ${id} matches no corpus field (not applied)`);
  }
  return { applied, unmatched };
}
