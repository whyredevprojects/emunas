/**
 * C2.2: the topic-index models on the mini corpus of @emunas/corpus (built here with the corpus
 * build, layer included): the tree, topic pages (place, see also, definition, hubs, gateway), the
 * three grades (each shiur once, catalog order, sums equal to the visible count), the occasion marks
 * and the calendar cross-line. Then the defensive behaviour on odd records.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IndexRow, LayerTopicDetail, LayerTopicNode } from "@emunas/corpus/public";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCalendarData } from "../../calendar/data.ts";
import type { CalendarData } from "../../calendar/model.ts";
import { findLayerDir, loadQuietLayer, type QuietLayer } from "../../corpus/layer.ts";
import { topicsSourceOf } from "../data.ts";
import {
  MAX_HUBS,
  ancestors,
  calendarCrossLine,
  catalogOrder,
  compareTopics,
  family,
  gradeTotal,
  hebrewLabel,
  placedOn,
  topicGrades,
  topicHref,
  topicName,
  topicPage,
  topicPageIds,
  topicShiurIds,
  topicTree,
  type TopicsSource,
} from "../model.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../../../..");
const corpusPkg = join(repo, "packages/corpus");

let work = "";
let corpus = "";
let layer: QuietLayer;
let cal: CalendarData;
let src: TopicsSource;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "quiet-topics-"));
  corpus = join(work, "corpus");
  const tsx = join(repo, "node_modules", ".bin", "tsx");
  const r = spawnSync(
    tsx,
    [
      join(corpusPkg, "src", "cli.ts"),
      "--data-dir",
      join(corpusPkg, "test/fixtures/mini/data"),
      "--policy-dir",
      join(corpusPkg, "test/fixtures/mini/site-policy"),
      "--out",
      corpus,
      "--media-origin",
      "https://media.example.org",
    ],
    { cwd: repo, env: { ...process.env, INIT_CWD: repo, EMUNAS_DEPLOY: "" }, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`corpus:build failed:\n${r.stdout}\n${r.stderr}`);
  layer = loadQuietLayer(findLayerDir(corpus));
  cal = readCalendarData(corpus);
  src = topicsSourceOf(layer, cal, corpus);
}, 120_000);

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

const descendants = (id: string): Set<string> => {
  const f = family(src.topics);
  const out = new Set([id]);
  const walk = (x: string) => {
    for (const c of f.children.get(x) ?? []) {
      if (!out.has(c.id)) {
        out.add(c.id);
        walk(c.id);
      }
    }
  };
  walk(id);
  return out;
};

describe("the tree", () => {
  it("has every listed gate as a heading, its topics beneath, deeper topics run in", () => {
    expect(layer.enabled).toBe(true);
    for (const ed of ["yi", "en"] as const) {
      const gates = topicTree(ed, src);
      const roots = src.topics.filter((t) => t.parentId === null && t.count > 0);
      expect(gates.map((g) => g.id).sort()).toEqual(roots.map((r) => r.id).sort());
      expect(gates.length).toBe(17);
      const listed = new Set<string>();
      for (const g of gates) {
        listed.add(g.id);
        for (const t of g.topics) {
          listed.add(t.id);
          expect(layer.topic(t.id)!.parentId).toBe(g.id);
          for (const s of t.sub) {
            listed.add(s.id);
            expect(ancestors(src.topics, s.id).map((a) => a.id)).toContain(t.id);
          }
        }
      }
      // every topic with a visible shiur is in the tree exactly once; topics without one are not
      expect([...listed].sort()).toEqual(src.topics.filter((t) => t.count > 0).map((t) => t.id).sort());
      expect(src.topics.some((t) => t.count === 0)).toBe(true);
    }
  });

  it("puts the Hebrew headword first in both editions, English beside it in the English edition", () => {
    const emunah = layer.topic("emunah")!;
    expect(topicName("yi", emunah)).toEqual({ title: { text: "אמונה", lang: "he", dir: "rtl" }, alt: null });
    expect(topicName("en", emunah)).toEqual({ title: { text: "אמונה", lang: "he", dir: "rtl" }, alt: { text: "Emunah", lang: "en", dir: "ltr" } });
    // a topic without a Hebrew label falls back to the Yiddish, then the English
    expect(hebrewLabel({ label: { en: "Technology", yi: "טעכנאלאגיע" } })).toBe("טעכנאלאגיע");
    expect(hebrewLabel({ label: { en: "Technology", yi: "" } })).toBe("Technology");
  });

  it("sorts by the English label in the English edition and by the Hebrew in the Yiddish edition", () => {
    const en = topicTree("en", src).map((g) => layer.topic(g.id)!.label.en);
    expect(en).toEqual([...en].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
    const yi = topicTree("yi", src).map((g) => hebrewLabel(layer.topic(g.id)!));
    expect(yi).toEqual([...yi].sort((a, b) => a.localeCompare(b, "he", { sensitivity: "base" })));
    const emunah = topicTree("en", src).find((g) => g.id === "emunah")!;
    const labels = emunah.topics.map((t) => layer.topic(t.id)!.label.en);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
    expect(compareTopics("en")(layer.topic("emunah")!, layer.topic("emunah")!)).toBe(0);
  });

  it("links each entry with a page to /{ed}/inyanim/{id}/ and gives the visible count", () => {
    const g = topicTree("en", src)[0]!;
    expect(g.href).toBe(`/en/inyanim/${g.id}/`);
    expect(g.count).toBe(layer.topic(g.id)!.count);
  });
});

describe("topic pages", () => {
  it("are built for every topic with a Quiet page; all/ pages for the gateways", () => {
    const { pages, all } = topicPageIds(src);
    expect(pages.sort()).toEqual(src.topics.filter((t) => t.pages.quiet).map((t) => t.id).sort());
    expect(all.sort()).toEqual(src.topics.filter((t) => t.pages.quiet && t.gateway).map((t) => t.id).sort());
    // every gate is a gateway (level 1), so it has an all/ page
    for (const t of src.topics.filter((x) => x.level === 1 && x.pages.quiet)) expect(all).toContain(t.id);
  });

  it("give the place in the tree, the description, and see-also links to parent, children and siblings", () => {
    const p = topicPage("en", src, "hashgacha-pratis")!;
    expect(p.path.map((a) => a.id)).toEqual(["emunah"]);
    expect(p.path[0]!.href).toBe("/en/inyanim/emunah/");
    expect(p.description).toBe(layer.topicDetail("hashgacha-pratis")!.description!.en);
    expect(topicPage("yi", src, "hashgacha-pratis")!.description).toBe(layer.topicDetail("hashgacha-pratis")!.description!.yi);
    const rels = p.seeAlso.map((s) => s.rel);
    expect(rels[0]).toBe("parent");
    expect(p.seeAlso[0]!.href).toBe("/en/inyanim/emunah/");
    const siblings = family(src.topics).children.get("emunah")!.filter((t) => t.id !== "hashgacha-pratis" && t.count > 0);
    expect(p.seeAlso.filter((s) => s.rel === "sibling").map((s) => s.href).sort()).toEqual(siblings.map((s) => topicHref("en", s.id)).sort());
    expect(p.gateway).toBe(false);
  });

  it("leave the description out when there is none (level 3)", () => {
    const leaf = src.topics.find((t) => t.level === 3 && t.pages.quiet && layer.topicDetail(t.id)!.description === null)!;
    expect(leaf).toBeDefined();
    expect(topicPage("en", src, leaf.id)!.description).toBeNull();
    expect(topicPage("en", src, leaf.id)!.path.map((a) => a.id)).toEqual(ancestors(src.topics, leaf.id).map((a) => a.id));
    expect(topicPage("en", src, leaf.id)!.path).toHaveLength(2);
  });

  it("print the glossary definition when a concept shares the topic (sameAs.conceptId)", () => {
    const t = src.topics.find((x) => x.sameAs?.conceptId && layer.concept(x.sameAs.conceptId) && x.pages.quiet)!;
    const c = layer.concept(t.sameAs!.conceptId!)!;
    expect(topicPage("en", src, t.id)!.definition).toBe(c.definition.en);
    expect(topicPage("yi", src, t.id)!.definition).toBe(c.definition.yi);
    const plain = src.topics.find((x) => x.sameAs === null && x.pages.quiet)!;
    expect(topicPage("en", src, plain.id)!.definition).toBeNull();
  });

  it("point to the same subject in the names and sources indexes only where that entry has a page", () => {
    for (const t of src.topics.filter((x) => x.pages.quiet && (x.sameAs?.personId || x.sameAs?.workId))) {
      const p = topicPage("en", src, t.id)!;
      const person = p.seeAlso.filter((s) => s.rel === "person");
      const work = p.seeAlso.filter((s) => s.rel === "work");
      expect(person.length, t.id).toBe(t.sameAs?.personId && layer.hasPage("person", t.sameAs.personId) ? 1 : 0);
      expect(work.length, t.id).toBe(t.sameAs?.workId && layer.hasPage("work", t.sameAs.workId) ? 1 : 0);
      for (const s of person) expect(s.href).toBe(`/en/people/${t.sameAs!.personId}/`);
      for (const s of work) expect(s.href).toBe(`/en/sources/${t.sameAs!.workId}/`);
    }
  });

  it("begin here: the layer's hubs the catalog knows, at most ten", () => {
    for (const t of src.topics.filter((x) => x.pages.quiet)) {
      const p = topicPage("en", src, t.id)!;
      const hubs = layer.topicDetail(t.id)!.hubs.filter((h) => src.rows.has(h)).slice(0, MAX_HUBS);
      expect(p.hubs, t.id).toEqual(hubs);
      expect(p.hubs.length).toBeLessThanOrEqual(MAX_HUBS);
    }
  });

  it("gateway: children with their descriptions; see-also does not repeat the children", () => {
    const p = topicPage("en", src, "emunah")!;
    expect(p.gateway).toBe(true);
    const kids = family(src.topics).children.get("emunah")!.filter((t) => t.count > 0);
    expect(p.children.map((c) => c.id).sort()).toEqual(kids.map((k) => k.id).sort());
    for (const c of p.children) expect(c.description).toBe(layer.topicDetail(c.id)!.description?.en ?? null);
    expect(p.seeAlso.some((s) => s.rel === "child")).toBe(false);
    // a non-gateway topic lists its children in see-also
    const withKids = src.topics.find((t) => !t.gateway && t.pages.quiet && (family(src.topics).children.get(t.id) ?? []).some((k) => k.count > 0))!;
    expect(topicPage("en", src, withKids.id)!.seeAlso.some((s) => s.rel === "child")).toBe(true);
  });

  it("returns null for a topic the layer does not have", () => {
    expect(topicPage("en", src, "no-such-topic")).toBeNull();
  });
});

describe("the three grades", () => {
  it("each shiur once, the counts summing to the topic's visible count, every shiur in the visible set", () => {
    for (const t of src.topics) {
      const g = topicGrades("en", src, layer.topicDetail(t.id));
      const ids = [...g.main, ...g.discussed, ...g.touched].map((r) => r.shiurId);
      expect(new Set(ids).size, t.id).toBe(ids.length);
      expect(gradeTotal(g), t.id).toBe(t.count);
      for (const id of ids) expect(layer.shiurRefs(id), `${t.id} ${id}`).not.toBeNull();
    }
  });

  it("recounts: a shiur is in a topic's grades exactly when its refs carry the topic or a descendant", () => {
    const visible = cal.index.shiurim.map((r) => r.id).filter((id) => layer.shiurRefs(id) !== null);
    expect(visible.length).toBe(layer.visibleShiurim);
    for (const t of src.topics) {
      const d = descendants(t.id);
      const want = visible.filter((id) => {
        const refs = layer.shiurRefs(id)!;
        return refs.topics.some((x) => d.has(x.id)) || refs.chapters.some((c) => c.topicIds.some((x) => d.has(x)));
      });
      expect([...topicShiurIds(layer.topicDetail(t.id), src.rows)].sort(), t.id).toEqual(want.sort());
      // main/discussed are shiur-level tags; touched only section-level
      const g = topicGrades("en", src, layer.topicDetail(t.id));
      for (const r of [...g.main, ...g.discussed]) expect(layer.shiurRefs(r.shiurId)!.topics.some((x) => d.has(x.id)), r.shiurId).toBe(true);
      for (const r of g.touched) expect(layer.shiurRefs(r.shiurId)!.topics.some((x) => d.has(x.id)), r.shiurId).toBe(false);
    }
  });

  it("are in catalog order within each grade, with language and year on every row", () => {
    const order = catalogOrder(src.rows);
    for (const t of src.topics) {
      const g = topicGrades("yi", src, layer.topicDetail(t.id));
      for (const list of [g.main, g.discussed, g.touched]) {
        const pos = list.map((r) => order.get(r.shiurId)!);
        expect(pos, t.id).toEqual([...pos].sort((a, b) => a - b));
        for (const r of list) {
          expect(r.lang).toBe(src.rows.get(r.shiurId)!.lang);
          expect(r.years).toEqual([...src.rows.get(r.shiurId)!.years].sort((a, b) => a - b));
          expect(r.href).toBe(`/yi/shiur/${r.shiurId}/`);
        }
      }
    }
  });

  it("touched rows link each tagged part at its section, with the part's title", () => {
    const t = src.topics.find((x) => layer.topicDetail(x.id)!.grades.touched.length > 0)!;
    const g = topicGrades("en", src, layer.topicDetail(t.id));
    const row = g.touched[0]!;
    const raw = layer.topicDetail(t.id)!.grades.touched.find((x) => x.shiurId === row.shiurId)!;
    expect(row.parts.map((p) => p.idx)).toEqual(raw.chapters.map((c) => c.idx));
    for (const p of row.parts) {
      expect(p.href).toBe(`/en/shiur/${row.shiurId}/#s${p.idx}`);
      expect(p.time).toMatch(/^\d+:\d\d(:\d\d)?$/);
      expect(p.title).toBe(src.chapterTitle(row.shiurId, p.idx)?.en ?? null);
    }
    expect(row.parts.some((p) => p.title !== null)).toBe(true);
  });

  it("mark the rows the catalog places on one of the topic's occasions", () => {
    const placed = placedOn(cal.occasions);
    const chanukah = topicGrades("en", src, layer.topicDetail("chanukah"));
    const all = [...chanukah.main, ...chanukah.discussed, ...chanukah.touched];
    const onDays = new Set([...(placed.get("zman:chanukah") ?? []), ...(placed.get("zman:shabbos-chanukah") ?? [])]);
    expect(all.some((r) => onDays.has(r.shiurId))).toBe(true);
    for (const r of all) {
      expect(r.onOccasion !== null, r.shiurId).toBe(onDays.has(r.shiurId));
      if (r.onOccasion) expect(r.onOccasion.href).toBe(`/en/calendar/zman/${r.onOccasion.key}/`);
    }
    // a topic without occasions marks nothing
    const emunah = topicGrades("en", src, layer.topicDetail("emunah"));
    expect([...emunah.main, ...emunah.discussed, ...emunah.touched].every((r) => r.onOccasion === null)).toBe(true);
  });

  it("drop rows the catalog does not know and repeated shiurim, and survive missing lists", () => {
    const rows = new Map<string, IndexRow>([...src.rows].slice(0, 3));
    const [a, b, c] = [...rows.keys()] as [string, string, string];
    const detail = {
      id: "x",
      description: null,
      hubs: [],
      grades: {
        main: [{ shiurId: b, salience: 0.9 }, { shiurId: "ghost", salience: 0.9 }, { shiurId: a, salience: 0.8 }],
        discussed: [{ shiurId: a, salience: 0.3 }],
        touched: [{ shiurId: c, chapters: [{ idx: 1, t: 61 }, { idx: -1, t: 3 }, { idx: 2, t: Number.NaN }] }, { shiurId: b, chapters: [] }],
      },
      children: [],
      coTopics: [],
      threadIds: [],
      storyIds: [],
      occasions: [],
    } satisfies LayerTopicDetail;
    const g = topicGrades("en", { ...src, rows }, detail);
    expect(g.main.map((r) => r.shiurId)).toEqual([a, b]);
    expect(g.discussed).toEqual([]);
    expect(g.touched.map((r) => r.shiurId)).toEqual([c]);
    expect(g.touched[0]!.parts.map((p) => p.idx)).toEqual([1]);
    expect(gradeTotal(topicGrades("en", src, undefined))).toBe(0);
    expect(gradeTotal(topicGrades("en", src, { ...detail, grades: {} as LayerTopicDetail["grades"] }))).toBe(0);
  });
});

describe("the calendar cross-line", () => {
  it("counts the topic's shiurim said at other times, for each linked occasion with a page", () => {
    const placed = placedOn(cal.occasions);
    let lines = 0;
    for (const o of layer.occasionTopics) {
      const line = calendarCrossLine("en", src, o.kind, o.key);
      const node = layer.topic(o.topicId)!;
      const ids = topicShiurIds(layer.topicDetail(node.id), src.rows);
      const own = layer.occasionTopics.filter((x) => x.topicId === node.id).map((x) => placed.get(`${x.kind}:${x.key}`) ?? new Set());
      const others = [...ids].filter((id) => !own.some((s) => s.has(id))).length;
      if (!node.pages.quiet || others === 0) {
        expect(line, `${o.kind}:${o.key}`).toBeNull();
        continue;
      }
      lines++;
      expect(line).toEqual({ topicId: node.id, topic: topicName("en", node), href: `/en/inyanim/${node.id}/`, count: others });
    }
    expect(lines).toBeGreaterThan(5);
    expect(calendarCrossLine("en", src, "zman", "chanukah")!.count).toBeLessThan(layer.topic("chanukah")!.count);
  });

  it("is null for an occasion without a topic", () => {
    const linked = new Set(layer.occasionTopics.map((o) => `${o.kind}:${o.key}`));
    const free = cal.occasions.parshiyos.find((p) => !linked.has(`parsha:${p.key}`))!;
    expect(calendarCrossLine("en", src, "parsha", free.key)).toBeNull();
    expect(calendarCrossLine("en", { ...src, occasions: null }, "zman", "no-such-zman")).toBeNull();
  });
});

describe("defensive tree", () => {
  const node = (id: string, parentId: string | null, count = 1, en = id): LayerTopicNode => ({
    id,
    parentId,
    level: parentId === null ? 1 : 2,
    label: { en, yi: "", he: `ה${id}` },
    count,
    sameAs: null,
    reviewed: false,
    pages: { quiet: count > 0, live: count > 0 },
    gateway: parentId === null,
  });

  it("treats a topic whose parent is missing as a gate, and cuts cycles", () => {
    const topics = [node("a", null), node("b", "missing"), node("c", "d"), node("d", "c"), node("e", "a", 0)];
    const f = family(topics);
    expect(f.roots.map((r) => r.id)).toEqual(["a", "b"]);
    expect(ancestors(topics, "c").map((x) => x.id)).toEqual(["d"]);
    const gates = topicTree("en", { topics, hasPage: () => true });
    expect(gates.map((g) => g.id)).toEqual(["a", "b"]);
    expect(gates[0]!.topics).toEqual([]); // e has no visible shiur
  });
});
