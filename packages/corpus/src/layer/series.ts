/**
 * series/<id>.json (Quiet C4.7, Live C.6): the synthesis of a series that has at least one visible
 * part, with the arc cut to visible parts and the list of parts that are not visible. A series
 * without a synthesis file (or with no visible part) gets no file and stays a plain list.
 */
import type { LayerSeries } from "../public/corpus-layer.ts";
import type { LayerContext } from "./context.ts";

export function buildSeries(ctx: LayerContext): Map<string, LayerSeries> {
  const out = new Map<string, LayerSeries>();
  const catalog = new Map(ctx.index.series.map((s) => [s.id, s.shiurIds]));
  for (const id of [...ctx.input.series.keys()].sort()) {
    const s = ctx.input.series.get(id)!;
    const seen = new Set<string>();
    const arc: LayerSeries["arc"] = [];
    for (const a of [...s.arc].sort((x, y) => x.part - y.part)) {
      if (!ctx.V.has(a.shiurId) || seen.has(a.shiurId)) continue;
      seen.add(a.shiurId);
      arc.push({ shiurId: a.shiurId, part: a.part, oneLiner: ctx.text("series", id, `arc.${a.shiurId}.oneLiner`, a.oneLiner) });
    }
    if (arc.length === 0) continue;
    const partOf = new Map(s.arc.map((a) => [a.shiurId, a.part]));
    const parts = catalog.get(id) ?? s.arc.map((a) => a.shiurId);
    const missing: LayerSeries["missing"] = [];
    parts.forEach((shiurId, i) => {
      if (!seen.has(shiurId)) missing.push(partOf.get(shiurId) ?? i + 1);
    });
    missing.sort((a, b) => a - b);
    out.set(id, {
      seriesId: id,
      title: ctx.text("series", id, "title", s.title),
      overview: ctx.text("series", id, "overview", s.overview),
      keyThemes: s.keyThemes.map((k, i) => ctx.text("series", id, `keyThemes.${i}`, k)),
      arc,
      missing,
      reviewed: s.reviewStatus === "reviewed",
    });
  }
  return out;
}
