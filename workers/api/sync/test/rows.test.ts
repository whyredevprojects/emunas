import { describe, expect, it } from "vitest";
import { MOMENT_ROW_FIELDS, momentSearchText } from "@emunas/search-core";
import {
  corpusRevOf,
  parseMomentsNdjson,
  RowError,
  rowLangs,
  toMomentRecord,
  toVectorUnits,
  utf8Bytes,
  vectorIdFor,
  VECTOR_ID_MAX_BYTES,
  VECTOR_METADATA_KEYS,
} from "../src/rows.ts";
import { parseVectorId, vectorIdFor as workerVectorIdFor } from "../../src/contract.ts";
import { splitSql } from "../src/sql.ts";
import { miniMoments } from "./helpers.ts";

const line = (o: object) => JSON.stringify(o);

describe("moments.ndjson validation", () => {
  const good = miniMoments()[0]!;

  it("accepts search-core rows", () => {
    expect(parseMomentsNdjson(`${line(good)}\n`)).toHaveLength(1);
    expect(Object.keys(good).sort()).toEqual([...MOMENT_ROW_FIELDS].sort());
  });

  it("rejects transcript-derived and unknown keys at any level", () => {
    expect(() => parseMomentsNdjson(line({ ...good, heardAs: ["x"] }))).toThrow(/forbidden key "heardAs"/);
    expect(() => parseMomentsNdjson(line({ ...good, asrNotes: "x" }))).toThrow(RowError);
    expect(() => parseMomentsNdjson(line({ ...good, extra: 1 }))).toThrow(/unknown key "extra"/);
    expect(() => parseMomentsNdjson(line({ ...good, facets: { ...good.facets, segs: [1] } }))).toThrow(/forbidden key "segs"/);
    expect(() => parseMomentsNdjson(line({ ...good, entities: { ...good.entities, transcript: [] } }))).toThrow(RowError);
  });

  it("rejects bad types, ids and duplicates", () => {
    expect(() => parseMomentsNdjson(line({ ...good, t: "1" }))).toThrow(/bad t/);
    expect(() => parseMomentsNdjson(line({ ...good, kind: "shiur" }))).toThrow(/bad kind/);
    expect(() => parseMomentsNdjson(line({ ...good, shiurId: "other" }))).toThrow(/bad shiurId/);
    expect(() => parseMomentsNdjson(line({ ...good, hash: "nothex" }))).toThrow(/bad hash/);
    expect(() => parseMomentsNdjson(`${line(good)}\n${line(good)}`)).toThrow(/duplicate id/);
    expect(() => parseMomentsNdjson("{not json")).toThrow(/invalid JSON/);
  });
});

describe("row mapping", () => {
  const rows = miniMoments();

  it("languages: both for bilingual kinds, own language only for write-up paragraphs", () => {
    for (const r of rows) {
      const langs = rowLangs(r);
      if (r.kind === "writeup") expect(langs).toEqual([r.body_en !== null ? "en" : "yi"]);
      else expect(langs.length).toBeGreaterThan(0);
    }
  });

  it("FTS text is search-core momentSearchText; display text keeps the original spelling", () => {
    const r = rows.find((x) => x.kind === "section")!;
    const rec = toMomentRecord(r);
    for (const f of rec.fts) expect(f).toEqual({ lang: f.lang, ...momentSearchText(r, f.lang)! });
    expect(rec.texts.find((x) => x.lang === "en")).toEqual({ lang: "en", title: r.title_en, body: r.body_en });
    expect(rec.moment.catalogued).toBe(r.facets.catalogued ? 1 : 0);
  });

  it("vectors: no write-up paragraphs, ids within 64 bytes, metadata exactly the contract keys", () => {
    const units = rows.flatMap(toVectorUnits);
    expect(units.length).toBeGreaterThan(100);
    expect(units.some((u) => u.momentId.includes("~w"))).toBe(false);
    for (const u of units) {
      expect(u.vectorId).toBe(vectorIdFor(u.momentId, u.lang));
      expect(utf8Bytes(u.vectorId)).toBeLessThanOrEqual(VECTOR_ID_MAX_BYTES);
      for (const k of Object.keys(u.metadata)) expect(VECTOR_METADATA_KEYS).toContain(k);
      expect(u.text.length).toBeGreaterThan(0);
    }
  });

  it("vector ids: plain when they fit, else an alias the Worker parses; identical to the Worker's scheme", () => {
    const short = "yi-a-01~kp0";
    expect(vectorIdFor(short, "yi")).toBe(`${short}@yi`);
    const shiurId = "yi-zmanim-unc-yt-kslv-17-01-17-19-kislev-5775-12-r-moshe-wolfson";
    for (const local of ["~s0", "~kp4", "~st12", "~q123"]) {
      for (const lang of ["en", "yi"] as const) {
        const id = vectorIdFor(`${shiurId}${local}`, lang);
        expect(utf8Bytes(id)).toBeLessThanOrEqual(VECTOR_ID_MAX_BYTES);
        expect(id).toBe(workerVectorIdFor(`${shiurId}${local}`, lang));
        const parsed = parseVectorId(id);
        expect(parsed?.alias?.local).toBe(local);
        expect(shiurId.startsWith(parsed!.alias!.shiurHead)).toBe(true);
      }
    }
  });

  it("corpus revision depends on content only", () => {
    const a = corpusRevOf(rows);
    expect(corpusRevOf([...rows].reverse())).toBe(a);
    const changed = rows.map((r, i) => (i === 3 ? { ...r, hash: "0".repeat(64) } : r));
    expect(corpusRevOf(changed)).not.toBe(a);
  });
});

describe("SQL helpers", () => {
  it("splits migration files on statement ends only", () => {
    const sql = "-- c; x\nCREATE TABLE a (x TEXT DEFAULT 'a;b');\n/* ; */ INSERT INTO a VALUES ('it''s;');\nCREATE VIRTUAL TABLE f USING fts5(t, tokenize = \"unicode61 remove_diacritics 2\");";
    expect(splitSql(sql)).toEqual([
      "CREATE TABLE a (x TEXT DEFAULT 'a;b')",
      "INSERT INTO a VALUES ('it''s;')",
      'CREATE VIRTUAL TABLE f USING fts5(t, tokenize = "unicode61 remove_diacritics 2")',
    ]);
  });
});
