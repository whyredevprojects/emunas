/**
 * The shiur page's view model (W3.2): the previous/next line and the report link.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PublicShiur } from "@emunas/corpus/public";
import { describe, expect, it } from "vitest";
import { shiurTables } from "../src/components/shiur/strings.ts";
import { EDS } from "../src/lib/edition.ts";
import { prevNext, reportHref, type RowLookup } from "../src/components/shiur/view.ts";

const golden = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "corpus", "test", "fixtures", "golden");
const load = (id: string) => JSON.parse(readFileSync(join(golden, `${id}.json`), "utf8")) as PublicShiur;

describe("shiur page strings", () => {
  it("have the same keys and placeholders in every edition", () => {
    const en = shiurTables.en;
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const ed of EDS) {
      const table = shiurTables[ed];
      expect(Object.keys(table).sort(), ed).toEqual(Object.keys(en).sort());
      for (const [k, v] of Object.entries(en)) {
        const y = table[k as keyof typeof en];
        expect(ph(String(y)), `${ed} ${k}`).toEqual(ph(String(v)));
        if (ed !== "en") expect(/[א-ת]/.test(String(y)), `${ed} ${k}`).toBe(true);
      }
    }
  });

  it("never mention a transcript", () => {
    for (const ed of EDS) for (const v of Object.values(shiurTables[ed])) expect(String(v)).not.toMatch(/transcri|טראנסקריפּ|תמלול|תמליל/i);
  });
});

describe("prevNext", () => {
  const rows = new Map(
    ["a", "b", "c", "d"].map((id, i) => [id, { id, lang: i % 2 ? "en" : "yi", catalog: { titleOriginal: `Title ${id}` } }]),
  );
  const lookup = ((id: string) => rows.get(id)) as unknown as RowLookup;
  const shiur = load("yi-tanya-1-01");
  const neighbours = {
    section: { of: "pocket-guide-2012:tanya-1", pos: 2, count: 3, prev: "a", next: "b" },
    series: { of: "tanya-yi", pos: 1, count: 4, prev: null, next: "c" },
    sameOccasion: ["d"],
  };

  it("follows the series order when the shiur is in a series", () => {
    expect(shiur.series).not.toBeNull();
    const v = prevNext("en", shiur, neighbours, lookup, () => ({ text: "Tanya", lang: "en", dir: "ltr", fallback: false }))!;
    expect(v).toMatchObject({ of: "series", label: "Tanya", labelAttrs: { lang: "en", dir: "ltr" }, href: `/en/series/${shiur.series!.id}/`, prev: null });
    expect(v.next).toEqual({ id: "c", href: "/en/shiur/c/", title: "Title c", lang: "yi" });
  });

  it("follows the section order when the shiur is in no series", () => {
    const v = prevNext("en", { ...shiur, series: null }, { ...neighbours, series: null }, lookup)!;
    expect(v).toMatchObject({ of: "section", href: "/en/section/tanya-1/", label: shiur.catalog.sectionTitle, labelAttrs: null });
    expect(v.prev).toEqual({ id: "a", href: "/en/shiur/a/", title: "Title a", lang: "yi" });
    expect(v.next?.id).toBe("b");
  });

  it("keeps one side at the end of the order and drops a neighbour it cannot find", () => {
    const v = prevNext("yi", { ...shiur, series: null }, { ...neighbours, series: null, section: { ...neighbours.section, prev: "missing", next: null } }, lookup)!;
    expect(v.prev).toBeNull();
    expect(v.next).toBeNull();
    expect(prevNext("yi", shiur, undefined, lookup)).toBeNull();
  });

  it("keeps the edition in the links (Hebrew too)", () => {
    const v = prevNext("he", { ...shiur, series: null }, { ...neighbours, series: null }, lookup)!;
    expect(v.href).toBe("/he/section/tanya-1/");
    expect(v.prev?.href).toBe("/he/shiur/a/");
  });

  it("has an empty label for a series without a title (the component prints a fallback)", () => {
    expect(prevNext("en", shiur, neighbours, lookup)?.label).toBe("");
  });
});

describe("reportHref", () => {
  it("builds a mailto that pre-fills the shiur id, or nothing without a valid address", () => {
    const href = reportHref("errors@example.org", "Error report: x-1", "Shiur: x-1\n");
    expect(href).toBe("mailto:errors@example.org?subject=Error%20report%3A%20x-1&body=Shiur%3A%20x-1%0A");
    expect(reportHref(undefined, "s", "b")).toBeNull();
    expect(reportHref("  ", "s", "b")).toBeNull();
    expect(reportHref("not an address", "s", "b")).toBeNull();
  });
});
