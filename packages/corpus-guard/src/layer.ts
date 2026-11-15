/**
 * Text units of `.corpus/layer/` (corpus-wave-plan §3.3, §3.4): the generated corpus-wide prose the
 * sites print (story title and retelling, thread label and summary, topic description, concept
 * label and definition, person description, series title, overview, key themes and arc one-liners), each with its item
 * id and the shiurim it was written from.
 *
 * Item ids: `corpus:<kind>:<entityId>#<field>.<lang>`
 *
 * | Layer file            | kind      | fields                                              | member shiurim                         |
 * |-----------------------|-----------|-----------------------------------------------------|----------------------------------------|
 * | `stories.json`        | `story`   | `title`, `retelling`                                | `tellings[].shiurId`                   |
 * | `threads.json`        | `thread`  | `label`, `summary`                                  | `members[].shiurId`                    |
 * | `topics.json` detail  | `topic`   | `description`                                       | `hubs[]` + every graded shiur          |
 * | `concepts.json`       | `concept` | `label`, `definition`                               | `shiurIds[]` + `exampleRefs[].shiurId` |
 * | `people.json`         | `person`  | `description`                                       | `shiurIds[]`                           |
 * | `series/<id>.json`    | `series`  | `title`, `overview`, `keyThemes.<i>`, `arc.<shiurId>` | `arc[].shiurId`                      |
 *
 * `<lang>` is the key of the bilingual object (`en`, `yi`). The same ids are what
 * `corpus:build --suppress` blanks (`packages/corpus/src/layer/suppress.ts`) and what
 * `site-policy/verbatim-allow.json` may list. The reader is defensive: a file of another shape
 * yields fewer units, never an error, since the layer's shape may grow.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const CORPUS_ITEM_PREFIX = "corpus:";

export const CORPUS_UNIT_KINDS = ["story", "thread", "topic", "concept", "person", "series"] as const;
export type CorpusUnitKind = (typeof CORPUS_UNIT_KINDS)[number];

export interface CorpusUnit {
  /** `corpus:<kind>:<entityId>#<field>.<lang>` */
  id: string;
  kind: CorpusUnitKind;
  entityId: string;
  /** `retelling`, `keyThemes.2`, `arc.<shiurId>`, … */
  field: string;
  lang: string;
  /** File inside `.corpus/layer/` (`stories.json`, `series/<id>.json`). */
  file: string;
  /** JSON path of the string inside that file. */
  path: (string | number)[];
  text: string;
  /** Shiurim the text was written from (deduplicated, in first-seen order). */
  members: string[];
}

export function corpusItemId(kind: CorpusUnitKind, entityId: string, field: string, lang: string): string {
  return `${CORPUS_ITEM_PREFIX}${kind}:${entityId}#${field}.${lang}`;
}

export function isCorpusItemId(id: string): boolean {
  return id.startsWith(CORPUS_ITEM_PREFIX);
}

const ITEM_RE = /^corpus:(story|thread|topic|concept|person|series):([^#\s]+)#([A-Za-z]+(?:\.[^.#\s]+)?)\.([a-z]{2})$/;

export function parseCorpusItemId(id: string): { kind: CorpusUnitKind; entityId: string; field: string; lang: string } | null {
  const m = ITEM_RE.exec(id);
  if (!m) return null;
  return { kind: m[1] as CorpusUnitKind, entityId: m[2]!, field: m[3]!, lang: m[4]! };
}

/** Layer files that carry generated text (besides `series/<id>.json`). */
const LAYER_TEXT_FILES: readonly string[] = ["stories.json", "threads.json", "topics.json", "concepts.json", "people.json"];

type J = Record<string, unknown>;

function isRecord(v: unknown): v is J {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function records(v: unknown): [number, J][] {
  if (!Array.isArray(v)) return [];
  const out: [number, J][] = [];
  v.forEach((x, i) => {
    if (isRecord(x)) out.push([i, x]);
  });
  return out;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function shiurIdsOf(v: unknown): string[] {
  return records(v)
    .map(([, r]) => r.shiurId)
    .filter((x): x is string => typeof x === "string");
}

function dedupe(xs: readonly string[]): string[] {
  return [...new Set(xs)];
}

/** Units of one layer file (`file` relative to `.corpus/layer/`). Unknown files yield nothing. */
export function layerFileUnits(file: string, value: unknown): CorpusUnit[] {
  const out: CorpusUnit[] = [];
  const add = (
    kind: CorpusUnitKind,
    entityId: unknown,
    field: string,
    bilingual: unknown,
    path: (string | number)[],
    members: readonly string[],
  ) => {
    if (typeof entityId !== "string" || entityId === "" || !isRecord(bilingual)) return;
    for (const [lang, text] of Object.entries(bilingual)) {
      if (typeof text !== "string" || text.trim() === "") continue;
      out.push({ id: corpusItemId(kind, entityId, field, lang), kind, entityId, field, lang, file, path: [...path, lang], text, members: dedupe(members) });
    }
  };
  if (!isRecord(value)) return out;

  if (file === "stories.json") {
    for (const [i, s] of records(value.stories)) {
      const m = shiurIdsOf(s.tellings);
      add("story", s.id, "title", s.title, ["stories", i, "title"], m);
      add("story", s.id, "retelling", s.retelling, ["stories", i, "retelling"], m);
    }
  } else if (file === "threads.json") {
    for (const [i, t] of records(value.threads)) {
      const m = shiurIdsOf(t.members);
      add("thread", t.id, "label", t.label, ["threads", i, "label"], m);
      add("thread", t.id, "summary", t.summary, ["threads", i, "summary"], m);
    }
  } else if (file === "topics.json") {
    for (const [i, d] of records(value.detail)) {
      const g = isRecord(d.grades) ? d.grades : {};
      const m = [...strings(d.hubs), ...shiurIdsOf(g.main), ...shiurIdsOf(g.discussed), ...shiurIdsOf(g.touched)];
      add("topic", d.id, "description", d.description, ["detail", i, "description"], m);
    }
  } else if (file === "concepts.json") {
    for (const [i, c] of records(value.concepts)) {
      const m = [...strings(c.shiurIds), ...shiurIdsOf(c.exampleRefs)];
      add("concept", c.id, "label", c.label, ["concepts", i, "label"], m);
      add("concept", c.id, "definition", c.definition, ["concepts", i, "definition"], m);
    }
  } else if (file === "people.json") {
    for (const [i, p] of records(value.people)) {
      add("person", p.id, "description", p.description, ["people", i, "description"], strings(p.shiurIds));
    }
  } else if (/^series\/[^/]+\.json$/.test(file)) {
    const id = value.seriesId;
    const arc = records(value.arc);
    const m = shiurIdsOf(value.arc);
    add("series", id, "title", value.title, ["title"], m);
    add("series", id, "overview", value.overview, ["overview"], m);
    for (const [i, k] of records(value.keyThemes)) add("series", id, `keyThemes.${i}`, k, ["keyThemes", i], m);
    for (const [i, a] of arc) {
      if (typeof a.shiurId === "string") add("series", id, `arc.${a.shiurId}`, a.oneLiner, ["arc", i, "oneLiner"], m);
    }
  }
  return out;
}

/** Layer file name of a path whose parent folders include `layer/` (`.corpus/layer/stories.json` → `stories.json`), else null. */
export function layerFileOf(path: string): string | null {
  const parts = path.split(/[\\/]/);
  for (let i = parts.length - 2; i >= 0; i--) {
    if (parts[i] !== "layer") continue;
    const rel = parts.slice(i + 1).join("/");
    if (LAYER_TEXT_FILES.includes(rel) || /^series\/[^/]+\.json$/.test(rel)) return rel;
    return null;
  }
  return null;
}

/** Every text unit of `.corpus/layer/` (empty when the layer is absent). Unreadable files count in `unreadable`. */
export function readLayerUnits(corpusDir: string): { units: CorpusUnit[]; files: number; unreadable: string[] } {
  const dir = join(corpusDir, "layer");
  const units: CorpusUnit[] = [];
  const unreadable: string[] = [];
  let files = 0;
  if (!existsSync(dir)) return { units, files, unreadable };
  const names = LAYER_TEXT_FILES.filter((f) => existsSync(join(dir, f)));
  const seriesDir = join(dir, "series");
  if (existsSync(seriesDir)) {
    for (const f of readdirSync(seriesDir).sort()) if (f.endsWith(".json")) names.push(`series/${f}`);
  }
  for (const name of names) {
    files++;
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(join(dir, name), "utf8"));
    } catch {
      unreadable.push(name);
      continue;
    }
    units.push(...layerFileUnits(name, value));
  }
  return { units, files, unreadable };
}

/** JSON path → key used to look a unit up while walking a parsed file. */
export function pathKey(path: readonly (string | number)[]): string {
  return path.join("\u0000");
}
