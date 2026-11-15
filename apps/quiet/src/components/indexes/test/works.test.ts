/**
 * C2.1: the works index (מראי מקומות) and the work pages on the mini corpus layer, with the
 * reference-order layout from the aggregate works keyed by corpus work id.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEntryDataFrom, type EntryData } from "../entries.ts";
import { sefariaIndexHref, workPage, workPageIds, worksIndex } from "../works.ts";
import { buildMiniCorpus, type MiniCorpus } from "./mini.ts";

let mini: MiniCorpus;
let d: EntryData;

beforeAll(() => {
  mini = buildMiniCorpus();
  d = loadEntryDataFrom(mini.dir);
}, 120_000);

afterAll(() => mini?.dispose());

describe("works index", () => {
  it("lists every work once, in the layer's shelf order, generic labels in the last block", () => {
    for (const ed of ["yi", "en"] as const) {
      const blocks = worksIndex(d, ed);
      const lines = blocks.flatMap((b) => b.works);
      expect(lines.map((l) => l.id).sort()).toEqual(d.layer.works.map((w) => w.id).sort());
      const general = blocks.find((b) => b.group === "general")!;
      expect(blocks.at(-1)).toBe(general);
      expect(general.works.map((w) => w.id).sort()).toEqual(d.layer.works.filter((w) => w.generic).map((w) => w.id).sort());
      // inside a block the layer's order is kept
      const pos = new Map(d.layer.works.map((w, i) => [w.id, i]));
      for (const b of blocks) {
        const p = b.works.map((w) => pos.get(w.id)!);
        expect(p).toEqual([...p].sort((a, c) => a - c));
      }
      expect(blocks[0]!.group).toBe("torah");
    }
  });

  it("nests a family's child works under it (the Rashi tree, the tractates under Talmud Bavli)", () => {
    const lines = worksIndex(d, "en").flatMap((b) => b.works);
    const at = (id: string) => lines.findIndex((l) => l.id === id);
    expect(lines[at("rashi-on-the-torah")]!.depth).toBe(1);
    expect(lines[at("rashi-on-bereishis")]!.depth).toBe(2);
    expect(at("rashi")).toBeLessThan(at("rashi-on-the-torah"));
    expect(at("rashi-on-the-torah")).toBeLessThan(at("rashi-on-bereishis"));
    expect(lines[at("berachos")]!.depth).toBe(1);
  });

  it("links a work with a page, lists the shiurim of any other, and has a page for no generic work", () => {
    for (const l of worksIndex(d, "yi").flatMap((b) => b.works)) {
      const w = d.layer.work(l.id)!;
      if (w.pages.quiet) {
        expect(l.href).toBe(`/yi/sources/${w.id}/`);
        expect(w.generic).toBe(false);
      } else {
        expect(l.href).toBeNull();
        expect(l.cites.map((c) => c.shiurId)).toEqual(w.shiurIds);
      }
    }
    const ids = workPageIds(d);
    expect(ids.sort()).toEqual(d.layer.works.filter((w) => w.pages.quiet).map((w) => w.id).sort());
    for (const id of ids) expect(d.layer.work(id)!.generic).toBe(false);
    expect(ids).toEqual(expect.arrayContaining(["rashi", "talmud-bavli", "ramban"]));
    expect(ids).not.toContain("midrash");
  });
});

describe("work pages", () => {
  it("have the headword, the author linked to his entry in names, Sefaria by sefariaIndexTitle", () => {
    const tanya = workPage(d, "en", d.layer.work("tanya")!);
    expect(tanya.head.title.text).toBe(d.layer.work("tanya")!.titleEn);
    const author = d.layer.person("baal-hatanya")!;
    expect(tanya.author?.label.text).toBe(author.nameEn);
    expect(tanya.author?.href).toBe(author.pages.quiet ? "/en/people/baal-hatanya/" : "/en/people/#baal-hatanya");
    const bereishis = workPage(d, "yi", d.layer.work("bereishis")!);
    expect(bereishis.head.title.text).toBe(d.layer.work("bereishis")!.titleHe);
    expect(bereishis.sefaria?.href).toBe("https://www.sefaria.org/Genesis");
    expect(sefariaIndexHref("Shir HaShirim")).toBe("https://www.sefaria.org/Shir_HaShirim");
    const noSefaria = d.layer.works.find((w) => w.pages.quiet && w.sefariaIndexTitle === null);
    if (noSefaria) expect(workPage(d, "en", noSefaria).sefaria).toBeNull();
  });

  it("prints an author who is not in the names index as plain text (no dead anchor)", () => {
    const unlisted: EntryData = {
      ...d,
      layer: { ...d.layer, person: (id: string) => { const p = d.layer.person(id); return p && { ...p, listed: { quiet: false, live: false } }; } },
    };
    const page = workPage(unlisted, "en", d.layer.work("tanya")!);
    expect(page.author?.label.text).toBe(d.layer.person("baal-hatanya")!.nameEn);
    expect(page.author?.href).toBeNull();
  });

  it("keeps the reference-order layout, filed by corpus work id, citing visible shiurim only", () => {
    const page = workPage(d, "en", d.layer.work("bereishis")!);
    expect(page.refs.length).toBeGreaterThan(10);
    const cited = page.refs.flatMap((r) => r.mentions.map((m) => m.cite.shiurId));
    for (const id of cited) expect(d.visible(id), id).toBe(true);
    // every visible shiur of the work is on the page, by place or in the rest
    const shown = new Set([...cited, ...page.otherRefs.map((m) => m.cite.shiurId), ...page.shiurim.map((c) => c.shiurId)]);
    for (const id of d.layer.work("bereishis")!.shiurIds) expect(shown.has(id), id).toBe(true);
    // a mention with a time links to the shiur at that moment
    expect(page.refs.some((r) => r.mentions.some((m) => /#t=\d+$/.test(m.cite.href)))).toBe(true);
  });

  it("lists a family hub's child works in data order with counts, then the shiurim citing the family", () => {
    const rashi = d.layer.work("rashi")!;
    const page = workPage(d, "en", rashi);
    expect(page.children.map((c) => c.id)).toEqual(["rashi-on-tehillim", "rashi-on-rosh-hashanah", "rashi-on-the-torah", "rashi-on-bereishis", "rashi-on-vayikra"].filter((id) => d.layer.work(id)));
    expect(page.children.find((c) => c.id === "rashi-on-bereishis")!.depth).toBe(1);
    expect(page.children.find((c) => c.id === "rashi-on-bereishis")!.href).toBe("/en/sources/rashi-on-bereishis/");
    expect(page.children.find((c) => c.id === "rashi-on-tehillim")!.href).toBe("/en/sources/#rashi-on-tehillim");
    const shown = new Set([...page.refs.flatMap((r) => r.mentions.map((m) => m.cite.shiurId)), ...page.otherRefs.map((m) => m.cite.shiurId), ...page.shiurim.map((c) => c.shiurId)]);
    for (const id of rashi.shiurIds) expect(shown.has(id)).toBe(true);
    const bavli = workPage(d, "en", d.layer.work("talmud-bavli")!);
    expect(bavli.children.map((c) => c.id)).toContain("berachos");
  });

  it("points to the same subject through the author or sameAs, never a matching slug", () => {
    const tehillim = d.layer.work("tehillim")!;
    const page = workPage(d, "en", tehillim);
    expect(page.seeAlso.map((s) => s.href)).toContain(`/en/inyanim/${tehillim.sameAsTopic}/`);
    const slug = d.layer.works.find((w) => w.sameIdPerson !== null && w.sameAsTopic === null && w.authorPersonId !== w.sameIdPerson && w.pages.quiet);
    if (slug) expect(workPage(d, "en", slug).seeAlso).toEqual([]);
  });
});
