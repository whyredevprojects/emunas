/**
 * Raw loaders. Ingest and manifest are fatal when missing or invalid (nothing works without them);
 * catalogs and per-shiur files never throw: a problem becomes a reason and the shiur goes
 * catalog-only.
 */
import * as v from "valibot";
import type { Extraction, IngestOutput, Writeup } from "../../../../src/types.ts";
import type { DataReader } from "./read.ts";
import {
  CatalogFileSchema,
  ExtractionSchema,
  IngestSchema,
  ManifestSchema,
  MetaSchema,
  WriteupSchema,
  issueSummary,
  type CatalogFile,
  type Manifest,
  type Meta,
} from "./schemas.ts";

export class FatalDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalDataError";
  }
}

function parseFatal<S extends v.GenericSchema>(reader: DataReader, rel: string, schema: S): { value: v.InferOutput<S>; text: string } {
  const text = reader.readText(rel);
  if (text === null) throw new FatalDataError(`${rel} is missing`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new FatalDataError(`${rel} is not valid JSON`);
  }
  const r = v.safeParse(schema, json);
  if (!r.success) throw new FatalDataError(`${rel} is invalid: ${issueSummary(r.issues, 5).join("; ")}`);
  return { value: r.output, text };
}

export function loadIngest(reader: DataReader): IngestOutput {
  return parseFatal(reader, "derived/ingest.json", IngestSchema).value;
}

export function loadManifest(reader: DataReader): Manifest {
  const m = parseFatal(reader, "derived/manifest.json", ManifestSchema).value;
  const seen = new Set<string>();
  for (const e of m.entries) {
    if (seen.has(e.shiurId)) throw new FatalDataError(`derived/manifest.json lists ${e.shiurId} twice`);
    seen.add(e.shiurId);
  }
  return m;
}

export interface Catalogs {
  pocketGuide: CatalogFile | null;
  uncatalogued: CatalogFile | null;
  warnings: string[];
}

export function loadCatalogs(reader: DataReader): Catalogs {
  const warnings: string[] = [];
  const one = (rel: string): CatalogFile | null => {
    const text = reader.readText(rel);
    if (text === null) {
      warnings.push(`${rel} missing; section order falls back to ingest order`);
      return null;
    }
    try {
      const r = v.safeParse(CatalogFileSchema, JSON.parse(text));
      if (r.success) return r.output;
      warnings.push(`${rel} invalid (${issueSummary(r.issues).join("; ")}); section order falls back to ingest order`);
    } catch {
      warnings.push(`${rel} is not valid JSON; section order falls back to ingest order`);
    }
    return null;
  };
  return {
    pocketGuide: one("catalog/pocket-guide-2012.json"),
    uncatalogued: one("catalog/uncatalogued-guide.json"),
    warnings,
  };
}

export interface ShiurFiles {
  /** Raw texts ("" when missing), for the fingerprint. */
  texts: { meta: string; extraction: string; writeup: string };
  meta: Meta | null;
  extraction: Extraction | null;
  writeup: Writeup | null;
  /** Why a file could not be used (missing / not JSON / schema issues). Empty when all three parsed. */
  problems: string[];
  /** True when at least one of the three files exists. */
  anyFile: boolean;
}

type FileName = "meta" | "extraction" | "writeup";

export function loadShiurFiles(reader: DataReader, shiurId: string): ShiurFiles {
  const problems: string[] = [];
  const texts = { meta: "", extraction: "", writeup: "" };
  let anyFile = false;
  function one<S extends v.GenericSchema>(name: FileName, schema: S): v.InferOutput<S> | null {
    const text = reader.readText(`derived/shiurim/${shiurId}/${name}.json`);
    if (text === null) {
      problems.push(`${name}.json missing`);
      return null;
    }
    anyFile = true;
    texts[name] = text;
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      problems.push(`${name}.json is not valid JSON`);
      return null;
    }
    const r = v.safeParse(schema, json);
    if (!r.success) {
      problems.push(...issueSummary(r.issues).map((s) => `${name}.json ${s}`));
      return null;
    }
    return r.output;
  }
  const meta = one("meta", MetaSchema);
  const extraction = one("extraction", ExtractionSchema);
  const writeup = one("writeup", WriteupSchema);
  return { texts, meta, extraction, writeup, problems, anyFile };
}
