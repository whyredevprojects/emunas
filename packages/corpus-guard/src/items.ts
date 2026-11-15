/**
 * Shipped text units of a `.corpus/shiurim/<id>.json` (PublicShiur, integration-plan §5.2)
 * and the item ids the guard reports and suppresses.
 *
 * Item ids (what `suppress.json`, `site-policy/verbatim-allow.json` and
 * `publish-policy.json` `allowVerbatim[]` refer to):
 *
 * | Where in PublicShiur                       | Item id                                   |
 * |--------------------------------------------|-------------------------------------------|
 * | any object carrying a string `id` (moments: keyPoints, insights, takeaways, questions, stories) | that id, prefixed `<shiurId>~` unless it already contains `~` |
 * | notes.summary.oneLiner / abstract          | `<shiurId>~ol0` / `<shiurId>~ab0` (corpus moment ids) |
 * | notes.chapters[i]                          | `<shiurId>~s<idx>`                        |
 * | notes.chapters[i].sub[j]                   | `<shiurId>~s<idx>.<j>`                    |
 * | notes.sources[i]                           | `<shiurId>~src<idx>`                      |
 * | notes.writeup.<ed>[b] heading              | `<shiurId>~w-<ed>-<sectionIndex>-h`       |
 * | notes.writeup.<ed>[b].paragraphs[p]        | `<shiurId>~w-<ed>-<sectionIndex>-p<p>`    |
 * | anything else                              | `<shiurId>~<dotted path with indices>`    |
 *
 * The walker reads every string, so a field the projector adds later is still scanned.
 */

export interface ShippedItem {
  /** Item id (see table above). */
  id: string;
  shiurId: string;
  /** Field path with array indices folded to `[]`, e.g. `notes.writeup.en[].paragraphs[].text`. */
  field: string;
  text: string;
}

export interface ShiurUnits {
  shiurId: string;
  recordingIds: string[];
  items: ShippedItem[];
}

type Path = (string | number)[];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function fieldOf(path: Path): string {
  let s = "";
  for (const p of path) {
    if (typeof p === "number") s += "[]";
    else s += s === "" ? p : `.${p}`;
  }
  return s;
}

/** `kp0` → `<sid>~kp0`; `<sid>~kp0` stays. */
export function qualifyId(shiurId: string, id: string): string {
  return id.includes("~") ? id : `${shiurId}~${id}`;
}

function childId(sid: string, parentPath: Path, key: string | number, child: unknown, current: string | null): string | null {
  const pattern = fieldOf(parentPath);
  if (isRecord(child) && typeof child.id === "string" && parentPath.length > 0) return qualifyId(sid, child.id);
  if (pattern === "notes.summary" && (key === "oneLiner" || key === "abstract")) return `${sid}~${key === "oneLiner" ? "ol" : "ab"}0`;
  if (pattern === "notes.chapters" && typeof key === "number") {
    const idx = isRecord(child) && typeof child.idx === "number" ? child.idx : key;
    return `${sid}~s${idx}`;
  }
  if (pattern === "notes.chapters[].sub" && typeof key === "number") return current === null ? null : `${current}.${key}`;
  if (pattern === "notes.sources" && typeof key === "number") {
    const idx = isRecord(child) && typeof child.idx === "number" ? child.idx : key;
    return `${sid}~src${idx}`;
  }
  if (parentPath.length === 3 && parentPath[0] === "notes" && parentPath[1] === "writeup" && typeof key === "number") {
    const ed = String(parentPath[2]);
    const si = isRecord(child) && typeof child.sectionIndex === "number" ? child.sectionIndex : key;
    return `${sid}~w-${ed}-${si}`;
  }
  if (current !== null && /^notes\.writeup\.[^.]+\[\]$/.test(pattern) && key === "heading") return `${current}-h`;
  if (current !== null && /^notes\.writeup\.[^.]+\[\]\.paragraphs$/.test(pattern) && typeof key === "number") return `${current}-p${key}`;
  return null;
}

export interface CollectOptions {
  /** Top-level keys whose strings are not scanned (default: `catalog`: printed-catalog text is public by definition). */
  skipTopLevel?: readonly string[];
}

/** Every string in a PublicShiur-shaped object, with its item id and field path. */
export function collectShiurItems(shiur: unknown, opts: CollectOptions = {}): ShiurUnits | null {
  if (!isRecord(shiur) || typeof shiur.id !== "string") return null;
  const sid = shiur.id;
  const skip = new Set(opts.skipTopLevel ?? ["catalog"]);
  const recordingIds: string[] = [];
  if (Array.isArray(shiur.recordings)) {
    for (const r of shiur.recordings) if (isRecord(r) && typeof r.id === "string") recordingIds.push(r.id);
  }
  const items: ShippedItem[] = [];
  const walk = (node: unknown, path: Path, current: string | null): void => {
    if (typeof node === "string") {
      items.push({ id: current ?? `${sid}~${path.join(".")}`, shiurId: sid, field: fieldOf(path), text: node });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, [...path, i], childId(sid, path, i, child, current) ?? current));
      return;
    }
    if (isRecord(node)) {
      for (const [k, child] of Object.entries(node)) {
        if (path.length === 0 && skip.has(k)) continue;
        walk(child, [...path, k], childId(sid, path, k, child, current) ?? current);
      }
    }
  };
  walk(shiur, [], null);
  return { shiurId: sid, recordingIds, items };
}
