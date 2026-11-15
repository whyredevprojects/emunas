/**
 * C2.3: series introductions (Quiet C4.7) in the series page model and its components.
 *
 * - The mini corpus has no series synthesis, so the model rules are pinned with a synthetic one on
 *   the mini catalog: the catalog name stays the title, the generated title is a subtitle, arc
 *   one-liners replace the parts' lines, a part without an arc line keeps its row as "notes not
 *   prepared yet", and a series with no synthesis (or none of whose parts is in it) gets no intro.
 * - On the real data (corpus:build into a temp dir, read through the Quiet layer reader):
 *   tanya-yi shows its missing part's row; shabbos-tefilah-en has no synthesis and no page.
 * - Components: the intro renders the subtitle, overview and plain key themes (no links); the
 *   table prints "notes not prepared yet" in a part's notes cell.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { corpusLabel } from "@emunas/i18n";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findLayerDir, loadQuietLayer, type QuietLayer } from "../../corpus/layer.ts";
import CatalogTable from "../CatalogTable.astro";
import SeriesIntro from "../SeriesIntro.astro";
import { loadCatalogCorpus, type CatalogCorpus } from "../corpus.ts";
import { seriesModel, seriesSummaries, type SeriesSynthesis } from "../model.ts";
import { catalogEn, catalogYi } from "../strings.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../../../..");
const corpusPkg = join(repo, "packages/corpus");

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** `corpus:build` into a temp dir (app code may not import @emunas/corpus/build; the CLI is the public way in). */
function corpusBuild(prefix: string, extra: string[] = []): string {
  const out = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(out);
  const tsx = join(repo, "node_modules", ".bin", "tsx");
  const r = spawnSync(tsx, [join(corpusPkg, "src", "cli.ts"), ...extra, "--out", out], {
    cwd: repo,
    env: { ...process.env, INIT_CWD: repo, EMUNAS_DEPLOY: "" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`corpus:build failed:\n${r.stdout}\n${r.stderr}`);
  return out;
}

let mini: CatalogCorpus;
beforeAll(() => {
  mini = loadCatalogCorpus(
    corpusBuild("quiet-series-mini-", [
      "--data-dir",
      join(corpusPkg, "test/fixtures/mini/data"),
      "--policy-dir",
      join(corpusPkg, "test/fixtures/mini/site-policy"),
      "--media-origin",
      "https://media.example.org",
    ]),
  );
}, 120_000);

const SYNTH: SeriesSynthesis = {
  title: { en: "Tanya: The Two Souls", yi: "תניא: די צוויי נפשות" },
  overview: { en: "The Rav learns through the first part of the Tanya.", yi: "דער משגיח לערנט דורך דעם ערשטן חלק." },
  keyThemes: [{ en: "The two souls", yi: "די צוויי נפשות" }, { en: "  ", yi: "" }, { en: "The beinoni", yi: "דער בינוני" }],
  arc: [
    { shiurId: "yi-tanya-1-01", oneLiner: { en: "Opening the Tanya.", yi: "עפענען דעם תניא." } },
    { shiurId: "yi-tanya-1-10", oneLiner: { en: "", yi: "" } },
    { shiurId: "yi-tanya-1-29", oneLiner: { en: "The beinoni.", yi: "דער בינוני." } },
    { shiurId: "not-in-this-series", oneLiner: { en: "Elsewhere.", yi: "ערגעץ אנדערש." } },
  ],
  reviewed: false,
};

describe("series strings", () => {
  it("have the intro keys in both editions", () => {
    for (const k of ["series.intro", "series.keyThemes"] as const) {
      expect(catalogEn[k].trim()).not.toBe("");
      expect(/[א-ת]/.test(String(catalogYi[k]))).toBe(true);
    }
  });
});

describe("series model with a synthesis (mini catalog)", () => {
  it("keeps the catalog name as the title and puts the generated title in the intro", () => {
    const m = seriesModel(mini, "tanya-yi", "en", SYNTH)!;
    expect(m.title).toBe(mini.series.series.find((s) => s.id === "tanya-yi")!.title.en);
    expect(m.intro).toEqual({
      subtitle: "Tanya: The Two Souls",
      overview: "The Rav learns through the first part of the Tanya.",
      keyThemes: ["The two souls", "The beinoni"],
      reviewed: false,
    });
    expect(seriesModel(mini, "tanya-yi", "yi", SYNTH)!.intro!.subtitle).toBe("תניא: די צוויי נפשות");
  });

  it("uses arc one-liners as the parts' lines and keeps the parts without notes as rows", () => {
    const plain = seriesModel(mini, "tanya-yi", "en")!;
    const m = seriesModel(mini, "tanya-yi", "en", SYNTH)!;
    expect(m.rows.map((r) => r.part)).toEqual([1, 2, 3, 4]);
    expect(m.rows.map((r) => r.id)).toEqual(plain.rows.map((r) => r.id));
    const byId = new Map(m.rows.map((r) => [r.id, r]));
    expect(byId.get("yi-tanya-1-01")!.oneLiner).toBe("Opening the Tanya.");
    // a blank arc line falls back to the part's own summary
    expect(byId.get("yi-tanya-1-10")!.oneLiner).toBe(plain.rows.find((r) => r.id === "yi-tanya-1-10")!.oneLiner);
    expect(byId.get("yi-tanya-1-29")!.oneLiner).toBe("The beinoni.");
    expect(byId.get("yi-tanya-2-02")).toMatchObject({ oneLiner: null, notPrepared: true, part: 4 });
    expect(m.rows.filter((r) => r.notPrepared).map((r) => r.id)).toEqual(["yi-tanya-2-02"]);
    expect(m.anyNotes).toBe(true);
    // groups carry the same rows
    expect(m.groups!.flatMap((g) => g.rows).find((r) => r.id === "yi-tanya-2-02")!.notPrepared).toBe(true);
  });

  it("shows no synthesis UI without a synthesis, or when the synthesis names no part of the set", () => {
    const plain = seriesModel(mini, "tanya-yi", "en", null)!;
    expect(plain.intro).toBeNull();
    expect(plain.rows.every((r) => !r.notPrepared)).toBe(true);
    const foreign = seriesModel(mini, "tanya-yi", "en", { ...SYNTH, arc: [{ shiurId: "elsewhere", oneLiner: { en: "x", yi: "x" } }] })!;
    expect(foreign.intro).toBeNull();
    expect(foreign.rows.every((r) => !r.notPrepared)).toBe(true);
    expect(seriesModel(mini, "tanya-yi", "en", { arc: null })!.intro).toBeNull();
  });

  it("reads a synthesis defensively and passes on the reviewed flag", () => {
    const odd = { title: null, overview: { en: 3 }, keyThemes: null, arc: [{ shiurId: "yi-tanya-1-01" }], reviewed: true } as unknown as SeriesSynthesis;
    const m = seriesModel(mini, "tanya-yi", "en", odd)!;
    expect(m.intro).toEqual({ subtitle: null, overview: null, keyThemes: [], reviewed: true });
    expect(m.rows.find((r) => r.id === "yi-tanya-1-01")!.notPrepared).toBe(false);
  });

  it("pairs nothing: no sibling, no other-language series", () => {
    const m = seriesModel(mini, "tanya-yi", "en", SYNTH)!;
    expect("sibling" in m).toBe(false);
    expect("sibling" in m.entry).toBe(false);
    expect(JSON.stringify(m)).not.toContain("tanya-en");
  });
});

describe("series introductions on the real data", () => {
  let real: CatalogCorpus;
  let layer: QuietLayer;
  beforeAll(() => {
    const out = corpusBuild("quiet-series-real-");
    real = loadCatalogCorpus(out);
    layer = loadQuietLayer(findLayerDir(out));
  }, 180_000);

  it("tanya-yi has its introduction and keeps the part without notes as a row", () => {
    const synth = layer.series("tanya-yi");
    expect(synth).not.toBeNull();
    for (const ed of ["yi", "en"] as const) {
      const m = seriesModel(real, "tanya-yi", ed, synth)!;
      expect(m.intro?.overview).toBeTruthy();
      expect(m.intro!.keyThemes.length).toBeGreaterThan(0);
      const missing = m.rows.filter((r) => r.notPrepared);
      expect(missing.map((r) => r.part)).toEqual(synth!.missing);
      expect(missing.length).toBeGreaterThan(0);
      for (const r of missing) expect(r.oneLiner).toBeNull();
      const arc = new Map(synth!.arc.map((a) => [a.shiurId, a.oneLiner[ed]]));
      for (const r of m.rows) if (!r.notPrepared && arc.get(r.id)) expect(r.oneLiner).toBe(arc.get(r.id));
    }
  });

  it("shabbos-tefilah-en has no synthesis and no page; every other series without one stays plain", () => {
    expect(layer.series("shabbos-tefilah-en")).toBeNull();
    expect(seriesSummaries(real, "en").map((s) => s.id)).not.toContain("shabbos-tefilah-en");
    for (const s of seriesSummaries(real, "en")) {
      const synth = layer.series(s.id);
      const m = seriesModel(real, s.id, "en", synth)!;
      if (synth === null) expect(m.intro, s.id).toBeNull();
    }
  });
});

describe("series components", () => {
  let container: AstroContainer;
  beforeAll(async () => {
    container = await AstroContainer.create();
  });

  it("the intro prints the subtitle, overview and key themes as plain text", async () => {
    const html = await container.renderToString(SeriesIntro, {
      props: { ed: "en", intro: { subtitle: "Tanya: The Two Souls", overview: "An overview.", keyThemes: ["One", "Two"], reviewed: false } },
    });
    expect(html).toContain("data-series-intro");
    expect(html).toContain('class="series-subtitle" lang="en"');
    expect(html).toContain("An overview.");
    expect(html).toContain("Key themes");
    expect(html).toMatch(/<li[^>]*>One<\/li>/);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("data-reviewed");
  });

  it("the intro leaves out what is blank", async () => {
    const html = await container.renderToString(SeriesIntro, { props: { ed: "yi", intro: { subtitle: null, overview: null, keyThemes: [], reviewed: true } } });
    expect(html).not.toContain("series-subtitle");
    expect(html).not.toContain("series-themes");
    expect(html).toContain('data-reviewed="true"');
  });

  it("the table says 'notes not prepared yet' for a part without notes", async () => {
    const m = seriesModel(mini, "tanya-yi", "yi", SYNTH)!;
    const html = await container.renderToString(CatalogTable, {
      props: { ed: "yi", rows: m.rows, caption: "x", number: "part", partsOf: m.count, notes: true },
    });
    const row = html.slice(html.indexOf('id="row-yi-tanya-2-02"'));
    expect(row.slice(0, row.indexOf("</tr>"))).toContain(corpusLabel("notesNotPrepared", "yi"));
    expect(html.split(corpusLabel("notesNotPrepared", "yi")).length - 1).toBe(1);
    expect(html).toContain("עפענען דעם תניא.");
  });
});
