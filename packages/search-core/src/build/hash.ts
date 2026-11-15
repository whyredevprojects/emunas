import { createHash } from "node:crypto";
import { SEARCH_SCHEMA_VERSION } from "../types.ts";

/** JSON with object keys sorted at every depth (stable across key insertion order). */
export function canonicalJson(x: unknown): string {
  return JSON.stringify(x, (_k, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
    }
    return v;
  });
}

/** sha256(schemaVersion + canonical JSON of the text and metadata), hex. */
export function contentHash(withoutHash: object): string {
  return createHash("sha256").update(`${SEARCH_SCHEMA_VERSION}\u0000${canonicalJson(withoutHash)}`).digest("hex");
}
