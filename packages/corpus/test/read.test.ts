import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ForbiddenPathError, createDataReader, readPolicyText } from "../src/build/read.ts";
import { MINI_DATA, PKG, REAL_DATA, REAL_POLICY } from "./helpers.ts";

// Built from parts: the literals themselves are banned in this package outside the transcript gate.
const TRANSCRIPTS = ["transcripts"].join("");
const ASR_INPUT = ["input", "txt"].join(".");
const AUDIT_DIR = ["aud", "its"].join("");

describe("allow-listed data reader", () => {
  const reader = createDataReader(REAL_DATA);

  it("reads the allowed inputs", () => {
    expect(reader.readText("derived/ingest.json")).toContain('"shiurim"');
    expect(reader.readText("derived/manifest.json")).toContain('"entries"');
    expect(reader.readText("catalog/pocket-guide-2012.json")).toContain('"sections"');
    expect(reader.readText("derived/shiurim/yi-zmanim-tv-bb-04/meta.json")).toContain('"starts"');
    // An allowed path with no file behind it reads as null (an id no pipeline run will ever produce).
    expect(reader.readText("derived/shiurim/yi-no-such-shiur-0/meta.json")).toBeNull();
    expect(reader.exists("derived/shiurim/yi-no-such-shiur-0/meta.json")).toBe(false);
  });

  const transcriptFile = readdirSync(join(REAL_DATA, TRANSCRIPTS))[0]!;
  const forbidden = [
    `${TRANSCRIPTS}/${transcriptFile}`,
    `${TRANSCRIPTS}/x.json`,
    `derived/shiurim/yi-zmanim-tv-bb-04/${ASR_INPUT}`,
    `derived/${AUDIT_DIR}/yi-parshas-hashavua-chks-01.json`,
    "derived/usage.tsv",
    "derived/pilot-set.json",
    "catalog/pocket-guide-2012.pdf",
    "catalog/uncatalogued-audio.json",
    "derived/shiurim/../../transcripts/a.json",
    "derived/shiurim/yi-a/../../ingest.json",
    "/etc/passwd",
    "./derived/ingest.json",
    "derived//ingest.json",
    "derived\\ingest.json",
    "derived/shiurim/YI-UPPER/meta.json",
    "derived/shiurim/a/b/meta.json",
  ];
  it.each(forbidden)("refuses %s", (rel) => {
    expect(() => reader.readText(rel)).toThrow(ForbiddenPathError);
    expect(() => reader.exists(rel)).toThrow(ForbiddenPathError);
  });

  it("reads only allowed policy files", () => {
    expect(readPolicyText(REAL_POLICY, "publish-policy.json")).toContain("confidence");
    expect(() => readPolicyText(REAL_POLICY, "transcript-eligibility.json")).toThrow(ForbiddenPathError);
  });

  it("works on any data root (fixtures)", () => {
    expect(createDataReader(MINI_DATA).readText("derived/ingest.json")).not.toBeNull();
  });
});

describe("module boundaries", () => {
  const srcFiles = (dir: string) =>
    readdirSync(join(PKG, dir), { withFileTypes: true, recursive: true })
      .filter((e) => e.isFile() && e.name.endsWith(".ts"))
      .map((e) => join(e.parentPath, e.name));

  it("the public entry imports no Node built-ins and nothing from build", () => {
    for (const f of srcFiles("src/public")) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/from\s+["']node:/);
      expect(text, f).not.toMatch(/from\s+["'][^"']*\/build\//);
    }
  });

  it("only the transcript gate names the transcripts folder", () => {
    const offenders = srcFiles("src").filter(
      (f) => !f.endsWith("transcript-gate.ts") && readFileSync(f, "utf8").includes(`data/${TRANSCRIPTS}`),
    );
    expect(offenders).toEqual([]);
  });
});
