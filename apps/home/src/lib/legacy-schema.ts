/**
 * The schema of `src/data/legacy-files.json`: the files copied from the old www.emunas.com site
 * into R2 (written by scripts/upload-legacy.ts). Each entry is served by the Worker at `path`
 * (`/files/<rest>`) from the R2 key `site/files/<rest>`.
 *
 * Pure: `parseLegacyFiles` validates parsed JSON and throws on anything unexpected, so a bad or
 * partial manifest fails the build instead of producing broken links.
 */

export const FILES_PREFIX = "/files/";
export const R2_KEY_PREFIX = "site/files/";

export const LEGACY_KINDS = ["essay", "article", "image"] as const;
export type LegacyKind = (typeof LEGACY_KINDS)[number];

/** Essay groups, in the order the essays page shows them. */
export const ESSAY_GROUPS = ["Bereishis", "Shemos", "Vayikra", "Bamidbar", "Devarim", "Yomim Tovim"] as const;
export type EssayGroup = (typeof ESSAY_GROUPS)[number];

export interface LegacyFile {
  readonly key: string;
  readonly path: string;
  readonly kind: LegacyKind;
  readonly title: string;
  readonly group: EssayGroup | null;
  readonly order: number;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly contentType: string;
  readonly originalUrl: string;
}

const PATH_RE = /^\/files\/(?:essays|articles|images)\/[a-z0-9][a-z0-9-]*\.[a-z0-9]+$/;

function fail(i: number, msg: string): never {
  throw new Error(`legacy-files.json entry ${i}: ${msg}`);
}

function str(o: Record<string, unknown>, k: string, i: number): string {
  const v = o[k];
  if (typeof v !== "string" || v.trim() === "") fail(i, `"${k}" must be a non-empty string`);
  return v;
}

function int(o: Record<string, unknown>, k: string, i: number, min: number): number {
  const v = o[k];
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) fail(i, `"${k}" must be an integer >= ${min}`);
  return v;
}

/** The directory under /files/ that holds each kind. */
const KIND_DIR: Readonly<Record<LegacyKind, string>> = { essay: "essays", article: "articles", image: "images" };

export function parseLegacyFiles(raw: unknown): LegacyFile[] {
  if (!Array.isArray(raw)) throw new Error("legacy-files.json: expected an array");
  const seen = new Set<string>();
  const out = raw.map((entry: unknown, i): LegacyFile => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) fail(i, "not an object");
    const o = entry as Record<string, unknown>;
    const path = str(o, "path", i);
    if (!PATH_RE.test(path)) fail(i, `bad path ${JSON.stringify(path)}`);
    const key = str(o, "key", i);
    if (key !== R2_KEY_PREFIX + path.slice(FILES_PREFIX.length)) fail(i, `key ${key} does not match path ${path}`);
    const kind = o["kind"];
    if (typeof kind !== "string" || !(LEGACY_KINDS as readonly string[]).includes(kind)) fail(i, `bad kind ${String(kind)}`);
    const k = kind as LegacyKind;
    if (!path.startsWith(`${FILES_PREFIX}${KIND_DIR[k]}/`)) fail(i, `a ${k} must live under /files/${KIND_DIR[k]}/`);
    const group = o["group"];
    if (k === "essay") {
      if (typeof group !== "string" || !(ESSAY_GROUPS as readonly string[]).includes(group)) fail(i, `essay has bad group ${String(group)}`);
    } else if (group !== null) {
      fail(i, `only essays have a group`);
    }
    const sha256 = str(o, "sha256", i);
    if (!/^[0-9a-f]{64}$/.test(sha256)) fail(i, "sha256 must be 64 lowercase hex digits");
    if (seen.has(path)) fail(i, `duplicate path ${path}`);
    seen.add(path);
    return {
      key,
      path,
      kind: k,
      title: str(o, "title", i).trim(),
      group: group as EssayGroup | null,
      order: int(o, "order", i, 0),
      sizeBytes: int(o, "sizeBytes", i, 1),
      sha256,
      contentType: str(o, "contentType", i),
      originalUrl: str(o, "originalUrl", i),
    };
  });
  if (!out.some((f) => f.kind === "essay")) throw new Error("legacy-files.json: no essays");
  return out;
}

/** The last path segment without its extension: `/files/essays/noach.pdf` → `noach`. */
export function slugOf(file: Pick<LegacyFile, "path">): string {
  const name = file.path.slice(file.path.lastIndexOf("/") + 1);
  return name.replace(/\.[^.]+$/, "");
}

/** "Noach: Escorted by the Succah" → { head: "Noach", sub: "Escorted by the Succah" }. */
export function splitTitle(title: string): { head: string; sub: string | null } {
  const i = title.indexOf(": ");
  if (i === -1) return { head: title, sub: null };
  return { head: title.slice(0, i), sub: title.slice(i + 2) };
}

/** Human file size, as the essays list shows it: `198 KB`, `18.5 MB`. */
export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
