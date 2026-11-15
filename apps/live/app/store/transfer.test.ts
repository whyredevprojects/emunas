/** Import is untrusted input: validation, caps, unknown fields dropped, version handling. */
import { describe, expect, it } from "vitest";
import { LIMITS, PERSONAL_SCHEMA_VERSION, emptyDump, type PersonalDump } from "./schema.ts";
import { EXPORT_FORMAT, buildExport, exportFileName, mergeDumps, parseImport, serializeExport } from "./transfer.ts";

const file = (data: unknown, over: Record<string, unknown> = {}) =>
  JSON.stringify({ format: EXPORT_FORMAT, schemaVersion: PERSONAL_SCHEMA_VERSION, exportedAt: "x", data, ...over });

const note = { id: "n1", shiurId: "yi-tanya-1-01", t: 5, text: "hi", createdAt: 1, updatedAt: 2 };

describe("parseImport", () => {
  it("round-trips an export", () => {
    const d = emptyDump();
    d.notes.push(note);
    d.queue.push({ key: "q1", shiurId: "yi-tanya-1-01", start: 1, end: null, momentId: null, pos: 1, updatedAt: 3 });
    const parsed = parseImport(serializeExport(buildExport(d, Date.UTC(2026, 10, 15))));
    expect(parsed.dump).toEqual(d);
    expect(parsed).toMatchObject({ accepted: 2, skipped: 0, schemaVersion: PERSONAL_SCHEMA_VERSION });
  });

  it("refuses files that are not exports", () => {
    expect(() => parseImport("nope")).toThrow(expect.objectContaining({ code: "not-json" }));
    expect(() => parseImport("[]")).toThrow(expect.objectContaining({ code: "wrong-format" }));
    expect(() => parseImport(JSON.stringify({ format: "other", schemaVersion: 1, data: {} }))).toThrow(
      expect.objectContaining({ code: "wrong-format" }),
    );
    expect(() => parseImport(file([]))).toThrow(expect.objectContaining({ code: "wrong-format" }));
    expect(() => parseImport(file({}, { schemaVersion: 0 }))).toThrow(expect.objectContaining({ code: "wrong-format" }));
    expect(() => parseImport("x".repeat(20 * 1024 * 1024 + 1))).toThrow(expect.objectContaining({ code: "too-large" }));
  });

  it("refuses a file from a newer schema rather than half-reading it", () => {
    expect(() => parseImport(file({}, { schemaVersion: PERSONAL_SCHEMA_VERSION + 1 }))).toThrow(
      expect.objectContaining({ code: "newer-version" }),
    );
  });

  it("skips malformed records and keeps the rest", () => {
    const parsed = parseImport(
      file({
        notes: [note, { ...note, id: "bad id with spaces" }, { ...note, id: "n2", t: -1 }, { ...note, id: "n3", text: 5 }],
        progress: [{ shiurId: "x", t: 1, duration: 2, completedChapters: [1.5], completedAt: null, updatedAt: 1 }],
        playlists: [{ id: "p", name: "n", createdAt: 1, updatedAt: 1, items: [{ shiurId: "a", start: 5, end: 4 }] }],
        prefs: [{ key: "k", value: { nested: [1, "two", null] }, updatedAt: 1 }],
        queue: "not an array",
      }),
    );
    expect(parsed.dump.notes.map((n) => n.id)).toEqual(["n1"]);
    expect(parsed.dump.progress).toEqual([]);
    expect(parsed.dump.playlists).toEqual([]);
    expect(parsed.dump.prefs).toEqual([{ key: "k", value: { nested: [1, "two", null] }, updatedAt: 1 }]);
    expect(parsed.accepted).toBe(2);
    expect(parsed.skipped).toBe(6);
  });

  it("copies allowed fields only: anything else in a record is dropped", () => {
    const parsed = parseImport(file({ notes: [{ ...note, heardAs: "planted", extra: { a: 1 } }] }));
    expect(parsed.dump.notes).toEqual([note]);
    expect(JSON.stringify(parsed.dump)).not.toContain("planted");
  });

  it("caps store sizes, keeping the most recent records", () => {
    const history = Array.from({ length: LIMITS.history + 5 }, (_, i) => ({
      shiurId: `s-${i}`,
      t: 1,
      lastPlayedAt: i,
      updatedAt: i,
    }));
    const parsed = parseImport(file({ history }));
    expect(parsed.dump.history).toHaveLength(LIMITS.history);
    expect(parsed.dump.history.some((h) => h.shiurId === "s-0")).toBe(false);
    expect(parsed.skipped).toBe(5);
  });

  it("duplicate keys in one file keep the newer record", () => {
    const parsed = parseImport(file({ notes: [{ ...note, text: "new", updatedAt: 9 }, { ...note, text: "old", updatedAt: 1 }] }));
    expect(parsed.dump.notes.map((n) => n.text)).toEqual(["new"]);
  });
});

describe("mergeDumps", () => {
  it("is last-writer-wins per key, ties to the incoming side", () => {
    const a: PersonalDump = emptyDump();
    const b: PersonalDump = emptyDump();
    a.notes.push({ ...note, text: "a newer", updatedAt: 10 }, { ...note, id: "only-a", updatedAt: 1 });
    b.notes.push({ ...note, text: "b older", updatedAt: 5 }, { ...note, id: "only-b", updatedAt: 1 });
    a.prefs.push({ key: "k", value: "a", updatedAt: 3 });
    b.prefs.push({ key: "k", value: "b", updatedAt: 3 });
    const m = mergeDumps(a, b);
    expect(m.notes.map((n) => [n.id, n.text]).sort()).toEqual([
      ["n1", "a newer"],
      ["only-a", "hi"],
      ["only-b", "hi"],
    ]);
    expect(m.prefs).toEqual([{ key: "k", value: "b", updatedAt: 3 }]);
  });
});

it("names the export file by date", () => {
  expect(exportFileName(Date.UTC(2026, 10, 15, 12))).toBe("emunas-shelf-2026-11-15.json");
});
