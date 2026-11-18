/**
 * site-policy/corpus-policy.json (corpus-wave-plan §2): defaults in code, the shipped file equals
 * them, a missing file means the defaults and an invalid file is fatal.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CorpusPolicyError,
  DEFAULT_CORPUS_POLICY,
  corpusPolicyHash,
  familyRegExp,
  loadCorpusPolicy,
  parseCorpusPolicy,
} from "../../../src/layer/policy.ts";
import { REAL_POLICY, readJson, tmp } from "../../helpers.ts";

function policyDir(content: unknown): string {
  const d = join(tmp(), "site-policy");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "corpus-policy.json"), typeof content === "string" ? content : JSON.stringify(content));
  return d;
}

describe("corpus policy", () => {
  it("the shipped file holds exactly the defaults and round-trips", () => {
    const file = readJson(join(REAL_POLICY, "corpus-policy.json"));
    expect(file).toStrictEqual(DEFAULT_CORPUS_POLICY);
    expect(loadCorpusPolicy(REAL_POLICY)).toStrictEqual(DEFAULT_CORPUS_POLICY);
    expect(parseCorpusPolicy(JSON.parse(JSON.stringify(DEFAULT_CORPUS_POLICY)))).toStrictEqual(DEFAULT_CORPUS_POLICY);
  });

  it("the defaults are the plan §2 decisions", () => {
    const p = DEFAULT_CORPUS_POLICY;
    expect(p.search.asrVariants).toBe(false);
    expect(p.people.other).toEqual({ pages: false, quietLineMinShiurim: 3, liveListed: false });
    expect(p.people.excludeIds).toEqual([]);
    expect(p.threads).toEqual({ pageMinShiurim: 3, twoMember: "inline-line", timelineMinDated: 3 });
    expect(p.visibility.followCategoryVisibility).toBe(true);
    expect(p.featured).toEqual({ maxOtherSpeakerShare: 0.5, excludeTopicIds: [] });
    expect(p.live.threadPagesIndexable).toBe(false);
    expect(p.unknownVersion).toBe("warn");
    expect(p.occasionTopic.minShare).toBe(0.5);
    // No backwards compatibility: no legacy-page or redirect switches.
    expect(Object.keys(p).sort()).toEqual(
      ["featured", "live", "occasionTopic", "people", "policyVersion", "search", "thresholds", "threads", "unknownVersion", "visibility"].sort(),
    );
  });

  it("a missing file means the defaults (a fresh copy each time)", () => {
    const d = join(tmp(), "empty");
    mkdirSync(d);
    const a = loadCorpusPolicy(d);
    expect(a).toStrictEqual(DEFAULT_CORPUS_POLICY);
    a.people.excludeIds.push("x");
    expect(DEFAULT_CORPUS_POLICY.people.excludeIds).toEqual([]);
  });

  it("a partial file is merged over the defaults", () => {
    const p = loadCorpusPolicy(policyDir({ policyVersion: 1, people: { excludeIds: ["some-person"] }, unknownVersion: "fail" }));
    expect(p.people.excludeIds).toEqual(["some-person"]);
    expect(p.people.excludeFamily).toBe(true);
    expect(p.unknownVersion).toBe("fail");
    expect(p.thresholds).toStrictEqual(DEFAULT_CORPUS_POLICY.thresholds);
  });

  const invalid: [string, unknown][] = [
    ["not JSON", "{"],
    ["no policyVersion", { search: { asrVariants: false } }],
    ["asrVariants true (D1)", { policyVersion: 1, search: { asrVariants: true } }],
    ["unknown top-level key", { policyVersion: 1, thresholdz: {} }],
    ["unknown nested key", { policyVersion: 1, people: { other: { page: false } } }],
    ["wrong type", { policyVersion: 1, featured: { maxOtherSpeakerShare: "half" } }],
    ["share out of range", { policyVersion: 1, occasionTopic: { minShare: 2 } }],
    ["bad id in excludeIds", { policyVersion: 1, people: { excludeIds: ["Not An Id"] } }],
    ["bad regex", { policyVersion: 1, people: { familyPattern: "(" } }],
    ["the retired redirect switch", { policyVersion: 1, quiet: { redirects: { maxRules: 100 } } }],
    ["the retired legacy-pages switch", { policyVersion: 1, legacyEntityPages: "redirect" }],
    ["unknown version mode", { policyVersion: 1, unknownVersion: "ignore" }],
  ];
  it.each(invalid)("an invalid file is fatal: %s", (_name, content) => {
    expect(() => loadCorpusPolicy(policyDir(content))).toThrow(CorpusPolicyError);
  });

  it("asrVariants: true names the reason", () => {
    expect(() => parseCorpusPolicy({ policyVersion: 1, search: { asrVariants: true } })).toThrow(/asrVariants/);
  });

  it("the family rule matches the entity's own fields, not a list (D5)", () => {
    const re = familyRegExp(DEFAULT_CORPUS_POLICY);
    expect(re.test("the Mashgiach's father")).toBe(true);
    expect(re.test("Reb Eliyahu Shalom (the Mashgiach's father)")).toBe(true);
    expect(re.test("R' Motel, the Mashgiach's son-in-law")).toBe(true);
    expect(re.test("the Mashgiachs father-in-law")).toBe(true);
    expect(re.test("Rav Yosef")).toBe(false);
    expect(re.test("the Mashgiach")).toBe(false);
    // The data no longer says "the Rav" for him; the old form is not matched.
    expect(re.test("the Rav's father")).toBe(false);
  });

  it("the policy hash is stable and changes with the policy", () => {
    const h = corpusPolicyHash(DEFAULT_CORPUS_POLICY);
    expect(h).toMatch(/^[0-9a-f]{12}$/);
    expect(corpusPolicyHash(structuredClone(DEFAULT_CORPUS_POLICY))).toBe(h);
    expect(corpusPolicyHash(parseCorpusPolicy({ policyVersion: 1, unknownVersion: "fail" }))).not.toBe(h);
  });
});
