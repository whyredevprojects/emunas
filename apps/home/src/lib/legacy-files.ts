/**
 * The legacy-files manifest for pages, read at build time. The manifest is required: when
 * src/data/legacy-files.json is missing the build fails here, with no fallback.
 */
import { ESSAY_GROUPS, parseLegacyFiles, type EssayGroup, type LegacyFile } from "./legacy-schema.ts";

const found = import.meta.glob<unknown>("../data/legacy-files.json", { eager: true, import: "default" });
const raw = found["../data/legacy-files.json"];
if (raw === undefined) {
  throw new Error("apps/home/src/data/legacy-files.json is missing: run apps/home/scripts/upload-legacy.ts to write it");
}

export const LEGACY_FILES: readonly LegacyFile[] = parseLegacyFiles(raw);

const byOrder = (a: LegacyFile, b: LegacyFile) => a.order - b.order || a.path.localeCompare(b.path);

export const ESSAYS: readonly LegacyFile[] = LEGACY_FILES.filter((f) => f.kind === "essay").sort(byOrder);
export const ARTICLES: readonly LegacyFile[] = LEGACY_FILES.filter((f) => f.kind === "article").sort(byOrder);

export interface EssayGroupList {
  readonly group: EssayGroup;
  readonly essays: readonly LegacyFile[];
}

/** Essays by group, in ESSAY_GROUPS order; empty groups are left out. */
export const ESSAY_GROUP_LISTS: readonly EssayGroupList[] = ESSAY_GROUPS.map((group) => ({
  group,
  essays: ESSAYS.filter((e) => e.group === group),
})).filter((g) => g.essays.length > 0);

/** The manifest entry at `path`; throws if there is none (so a page can never link a missing file). */
export function fileAt(path: string): LegacyFile {
  const f = LEGACY_FILES.find((x) => x.path === path);
  if (!f) throw new Error(`home: no legacy file at ${path}`);
  return f;
}
