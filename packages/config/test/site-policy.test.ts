import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./helpers.ts";

const read = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(repoRoot, "site-policy", name), "utf8"));

describe("site-policy", () => {
  it("ships an empty transcript eligibility list (integration-plan §0.3)", () => {
    expect(read("transcript-eligibility.json")).toStrictEqual({ policyVersion: 1, eligible: {} });
  });

  it("ships the default publish policy", () => {
    const policy = read("publish-policy.json") as Record<string, unknown>;
    expect(policy).toStrictEqual({
      policyVersion: 1,
      confidence: { dropBelow: 0.6, softBelow: 0.75 },
      categoryVisibility: {
        current: { ownSection: true, generalBrowse: false, todayDefaults: false, exploreDefaults: false },
        simcha: { ownSection: true, generalBrowse: false, todayDefaults: false, exploreDefaults: false },
      },
      suppress: [],
      allowVerbatim: [],
    });
  });

  it("ships an empty verbatim allow-list", () => {
    expect(read("verbatim-allow.json")).toStrictEqual([]);
  });

  it("keeps the audio/transcript remark allow-list small, reviewed and phrase-specific", () => {
    const list = read("meta-comment-allow.json") as Record<string, unknown>[];
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeLessThanOrEqual(12);
    for (const e of list) {
      expect(Object.keys(e).sort()).toEqual(["file", "phrase", "reason", "reviewedAt", "reviewedBy"]);
      expect(String(e["phrase"]).split(/\s+/).length, String(e["phrase"])).toBeGreaterThanOrEqual(3);
      expect(String(e["reviewedAt"])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
