/**
 * C2.2 acceptance on built pages: runs `corpus:build` (the repo's `data/` when present, else the
 * corpus package's mini fixture) into a temporary `.corpus/`, builds the Quiet site against it and
 * checks the static HTML of the topic index and the calendar's cross-line:
 *
 * - one topic page per edition for every topic the layer gives a Quiet page (207 at full corpus,
 *   or the layer's count), an `all/` page for each gateway, and the tree page;
 * - the grade rows on each topic's list (the entry page, or `all/` for a gateway) are exactly the
 *   visible recount from the layer's per-shiur refs (the topic or a descendant, at shiur or section
 *   level), each shiur once, in catalog order within each grade;
 * - no section by another speaker is linked, and no shiur outside the visible set (needs_review,
 *   catalog-only) is linked from any topic page;
 * - each calendar parsha/zman page carries the cross-line exactly when occasion-topics.json links
 *   it to a topic with shiurim said at other times, with that count;
 * - one AI label and one report link per topic page, the index label once on the tree page; every
 *   internal link resolves (names and sources links: to an entry the layer gives a Quiet page);
 *   nothing from transcripts.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { OccasionsFile } from "@emunas/corpus/aggregate";
import type {
  CorpusIndex,
  LayerInfo,
  LayerOccasionTopic,
  LayerPerson,
  LayerShiurRefs,
  LayerTopicDetail,
  LayerTopicNode,
  LayerWork,
  PublicShiur,
} from "@emunas/corpus/public";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { astroBuild } from "../../../../test/astro-build.ts";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..", "..", "..", "..");
const repo = join(app, "..", "..");
const EDS = ["yi", "en"] as const;

let work = "";
let corpus = "";
let dist = "";
let useReal = false;

const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "quiet-topics-site-"));
  corpus = join(work, ".corpus");
  dist = join(work, "dist");
  const realData = join(repo, "data");
  const mini = join(repo, "packages", "corpus", "test", "fixtures", "mini");
  useReal = existsSync(join(realData, "derived", "corpus", "topics.json")) && existsSync(join(realData, "derived", "ingest.json"));
  const args = [
    require.resolve("tsx/cli"),
    join(repo, "packages", "corpus", "src", "cli.ts"),
    "--data-dir",
    useReal ? realData : join(mini, "data"),
    "--out",
    corpus,
    ...(useReal ? [] : ["--policy-dir", join(mini, "site-policy")]),
  ];
  const c = spawnSync(process.execPath, args, { cwd: repo, encoding: "utf8", env: { ...process.env, INIT_CWD: repo, EMUNAS_DEPLOY: "" } });
  if (c.status !== 0) throw new Error(`corpus:build failed:\n${c.stdout}\n${c.stderr}`);
  const b = astroBuild(app, dist, { EMUNAS_CORPUS_DIR: corpus });
  if (b.status !== 0) throw new Error(`astro build failed:\n${b.stdout.slice(-4000)}\n${b.stderr.slice(-4000)}`);
}, 300_000);

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

const layerFile = <T,>(name: string): T => readJson<T>(join(corpus, "layer", name));
const page = (path: string): string => readFileSync(join(dist, path, "index.html"), "utf8");
const exists = (path: string): boolean => existsSync(join(dist, path, "index.html"));
const mainOf = (html: string): string => html.slice(html.indexOf("<main"), html.indexOf("</main>"));
const hrefsIn = (html: string): string[] => [...html.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
const dirs = (path: string): string[] =>
  existsSync(join(dist, path)) ? readdirSync(join(dist, path)).filter((n) => statSync(join(dist, path, n)).isDirectory()).sort() : [];

/** Grade → shiur ids in page order (rows of the topic's grade sections). */
function gradeRows(html: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of html.matchAll(/<section class="grade topic-grade grade-(\w+)"[\s\S]*?<\/section>/g)) {
    out[m[1]!] = [...m[0].matchAll(/<li class="topic-row[^"]*" data-shiur="([^"]+)"/g)].map((x) => x[1]!);
  }
  return out;
}

function tree(): { topics: LayerTopicNode[]; detail: Map<string, LayerTopicDetail>; children: Map<string, string[]> } {
  const f = layerFile<{ tree: LayerTopicNode[]; detail: LayerTopicDetail[] }>("topics.json");
  const children = new Map<string, string[]>();
  for (const t of f.tree) if (t.parentId) children.set(t.parentId, [...(children.get(t.parentId) ?? []), t.id]);
  return { topics: f.tree, detail: new Map(f.detail.map((d) => [d.id, d])), children };
}

function descendants(children: Map<string, string[]>, id: string): Set<string> {
  const out = new Set([id]);
  const stack = [id];
  while (stack.length > 0) {
    for (const c of children.get(stack.pop()!) ?? []) {
      if (out.has(c)) continue;
      out.add(c);
      stack.push(c);
    }
  }
  return out;
}

describe("topic pages", () => {
  it("one per topic with a Quiet page, in both editions, plus all/ for each gateway and the tree page", () => {
    const { topics } = tree();
    const info = layerFile<LayerInfo>("layer.json");
    const want = topics.filter((t) => t.pages.quiet).map((t) => t.id).sort();
    expect(want.length).toBe(info.counts.pages.quiet.topics);
    if (useReal) expect(want.length).toBeGreaterThanOrEqual(200);
    for (const ed of EDS) {
      expect(exists(`${ed}/inyanim`), `${ed} tree`).toBe(true);
      expect(dirs(`${ed}/inyanim`)).toEqual(want);
      for (const t of topics.filter((x) => x.pages.quiet)) {
        expect(dirs(`${ed}/inyanim/${t.id}`), t.id).toEqual(t.gateway ? ["all"] : []);
      }
    }
  });

  it("list exactly the visible recount in the three grades, each shiur once, in catalog order", () => {
    const { topics, children } = tree();
    const index = readJson<CorpusIndex>(join(corpus, "index.json"));
    const order = new Map(index.shiurim.map((r, i) => [r.id, i]));
    const refs = new Map<string, LayerShiurRefs>();
    for (const f of readdirSync(join(corpus, "layer", "shiur"))) {
      const r = readJson<LayerShiurRefs>(join(corpus, "layer", "shiur", f));
      refs.set(r.shiurId, r);
    }
    expect(refs.size).toBe(layerFile<LayerInfo>("layer.json").counts.visibleShiurim);
    let rows = 0;
    for (const t of topics.filter((x) => x.pages.quiet)) {
      const d = descendants(children, t.id);
      const shiurLevel = new Set([...refs.values()].filter((r) => r.topics.some((x) => d.has(x.id))).map((r) => r.shiurId));
      const sectionOnly = new Set(
        [...refs.values()].filter((r) => !shiurLevel.has(r.shiurId) && r.chapters.some((c) => c.topicIds.some((x) => d.has(x)))).map((r) => r.shiurId),
      );
      for (const ed of EDS) {
        const html = mainOf(page(t.gateway ? `${ed}/inyanim/${t.id}/all` : `${ed}/inyanim/${t.id}`));
        const g = gradeRows(html);
        const all = [...(g["main"] ?? []), ...(g["discussed"] ?? []), ...(g["touched"] ?? [])];
        expect(new Set(all).size, `${ed} ${t.id}`).toBe(all.length);
        expect(all.length, `${ed} ${t.id}`).toBe(t.count);
        expect([...(g["main"] ?? []), ...(g["discussed"] ?? [])].sort(), `${ed} ${t.id}`).toEqual([...shiurLevel].sort());
        expect([...(g["touched"] ?? [])].sort(), `${ed} ${t.id}`).toEqual([...sectionOnly].sort());
        for (const list of Object.values(g)) {
          const pos = list.map((id) => order.get(id)!);
          expect(pos, `${ed} ${t.id}`).toEqual([...pos].sort((a, b) => a - b));
        }
        rows += all.length;
        if (t.gateway) {
          // the entry page of a gateway is a gateway: no grades, a link to the full list
          const entry = mainOf(page(`${ed}/inyanim/${t.id}`));
          expect(entry, t.id).not.toContain("topic-grade");
          expect(hrefsIn(entry), t.id).toContain(`/${ed}/inyanim/${t.id}/all/`);
        }
      }
    }
    expect(rows).toBeGreaterThan(0);
  });

  it("link no section by another speaker and no shiur outside the visible set", () => {
    const index = readJson<CorpusIndex>(join(corpus, "index.json"));
    const status = new Map(index.shiurim.map((r) => [r.id, r.status]));
    const visible = new Set(readdirSync(join(corpus, "layer", "shiur")).map((f) => f.replace(/\.json$/, "")));
    const chapters = new Map<string, Map<number, { kind: string; t: number }>>();
    const chapterOf = (id: string, idx: number): { kind: string; t: number } | undefined => {
      let m = chapters.get(id);
      if (!m) {
        const s = readJson<PublicShiur>(join(corpus, "shiurim", `${id}.json`));
        m = new Map((s.notes?.chapters ?? []).map((c) => [c.idx, { kind: c.kind, t: c.t }]));
        chapters.set(id, m);
      }
      return m.get(idx);
    };
    let sections = 0;
    for (const ed of EDS) {
      for (const dir of dirs(`${ed}/inyanim`)) {
        for (const path of [`${ed}/inyanim/${dir}`, `${ed}/inyanim/${dir}/all`]) {
          if (!exists(path)) continue;
          const html = mainOf(page(path));
          for (const href of hrefsIn(html)) {
            const m = /^\/(yi|en)\/shiur\/([^/]+)\/(?:#t=[\d.]+)?$/.exec(href);
            if (!m) continue;
            expect(visible.has(m[2]!), `${path} → ${href}`).toBe(true);
            expect(status.get(m[2]!), `${path} → ${href}`).toBe("full");
          }
          // a part link points at the start of its section, which is never another speaker's
          for (const [, id, t, idx] of html.matchAll(/<a class="part-link" href="\/(?:yi|en)\/shiur\/([^/]+)\/#t=([\d.]+)" data-section="(\d+)"/g)) {
            sections++;
            const ch = chapterOf(id!, Number(idx));
            expect(ch, `${path} → ${id} s${idx}`).toBeDefined();
            expect(ch!.kind, `${path} → ${id} s${idx}`).not.toBe("other_speaker");
            expect(Number(t), `${path} → ${id} s${idx}`).toBeCloseTo(ch!.t, 2);
          }
        }
      }
    }
    expect(sections).toBeGreaterThan(0);
  });

  it("begin here: at most ten shiurim, all among the layer's hubs", () => {
    const { topics, detail } = tree();
    for (const t of topics.filter((x) => x.pages.quiet)) {
      const html = mainOf(page(`en/inyanim/${t.id}`));
      const hubs = /<section class="topic-section topic-hubs"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
      const ids = [...hubs.matchAll(/data-shiur="([^"]+)"/g)].map((m) => m[1]!);
      expect(ids.length, t.id).toBeLessThanOrEqual(10);
      for (const id of ids) expect(detail.get(t.id)!.hubs, t.id).toContain(id);
      expect(ids.length, t.id).toBe(Math.min(10, detail.get(t.id)!.hubs.length));
    }
  });

  it("carry one AI label and one report link each; the tree page its index label once", () => {
    for (const ed of EDS) {
      const treeHtml = mainOf(page(`${ed}/inyanim`));
      expect(treeHtml.match(/class="corpus-label corpus-label-index"/g) ?? [], ed).toHaveLength(1);
      expect((treeHtml.match(/<h1\b/g) ?? []).length).toBe(1);
      for (const dir of dirs(`${ed}/inyanim`)) {
        for (const path of [`${ed}/inyanim/${dir}`, `${ed}/inyanim/${dir}/all`]) {
          if (!exists(path)) continue;
          const html = mainOf(page(path));
          expect(html.match(/class="corpus-label"/g) ?? [], path).toHaveLength(1);
          expect(html.match(/data-report-kind="topic"/g) ?? [], path).toHaveLength(1);
          expect(html, path).toContain(`data-report-id="${dir}"`);
          expect((html.match(/<h1\b/g) ?? []).length, path).toBe(1);
        }
      }
    }
  });

  it("every internal link on the topic pages resolves, and nothing comes from transcripts", () => {
    const broken: string[] = [];
    const peoplePages = new Set(layerFile<{ people: LayerPerson[] }>("people.json").people.filter((x) => x.pages.quiet).map((x) => x.id));
    const workPages = new Set(layerFile<{ works: LayerWork[] }>("works.json").works.filter((x) => x.pages.quiet).map((x) => x.id));
    for (const ed of EDS) {
      for (const dir of ["", ...dirs(`${ed}/inyanim`)]) {
        for (const path of [`${ed}/inyanim/${dir}`.replace(/\/$/, ""), `${ed}/inyanim/${dir}/all`]) {
          if (!exists(path)) continue;
          const html = page(path);
          for (const banned of ["transcripts/", "heardAs", "asrNotes", "asrVariants", "transcriptKey", "startSeg"]) {
            expect(html.includes(banned), `${path}: ${banned}`).toBe(false);
          }
          for (const href of hrefsIn(mainOf(html))) {
            if (!href.startsWith("/")) {
              if (!href.startsWith("mailto:")) broken.push(`${path} → ${href}`);
              continue;
            }
            const p = href.replace(/#.*$/, "");
            // Names and sources pages are built by their own package (C2.1) from the same layer page
            // flags: a link there must name an entry the layer gives a Quiet page.
            const entry = /^\/(?:yi|en)\/(people|sources)\/([^/]+)\/$/.exec(p);
            if (entry) {
              if (!(entry[1] === "people" ? peoplePages : workPages).has(entry[2]!)) broken.push(`${path} → ${href}`);
              continue;
            }
            if (!exists(p.replace(/^\//, ""))) broken.push(`${path} → ${href}`);
          }
        }
      }
    }
    expect(broken.slice(0, 20)).toEqual([]);
  });
});

describe("the calendar cross-line", () => {
  it("appears exactly where occasion-topics links the occasion, with the count of shiurim said at other times", () => {
    const { topics, detail } = tree();
    const byId = new Map(topics.map((t) => [t.id, t]));
    const occ = readJson<OccasionsFile>(join(corpus, "occasions.json"));
    const links = layerFile<{ occasions: LayerOccasionTopic[] }>("occasion-topics.json").occasions;
    const placed = new Map<string, Set<string>>();
    for (const p of occ.parshiyos) placed.set(`parsha:${p.key}`, new Set(p.shiurim.map((s) => s.id)));
    for (const z of occ.zmanim) placed.set(`zman:${z.key}`, new Set([...z.shiurim, ...z.subs.flatMap((s) => s.shiurim)].map((s) => s.id)));
    let lines = 0;
    for (const ed of EDS) {
      for (const [kind, list] of [["parsha", occ.parshiyos], ["zman", occ.zmanim]] as const) {
        for (const o of list) {
          const html = mainOf(page(`${ed}/calendar/${kind}/${o.key}`));
          const m = /data-topic-line="([^"]+)" data-count="(\d+)"/.exec(html);
          const link = links.find((l) => l.kind === kind && l.key === o.key);
          let want: { topic: string; count: number } | null = null;
          if (link) {
            const t = byId.get(link.topicId)!;
            const g = detail.get(t.id)!.grades;
            const ids = new Set([...g.main, ...g.discussed, ...g.touched].map((r) => r.shiurId));
            const own = links.filter((l) => l.topicId === t.id).map((l) => placed.get(`${l.kind}:${l.key}`) ?? new Set<string>());
            const count = [...ids].filter((id) => !own.some((s) => s.has(id))).length;
            if (t.pages.quiet && count > 0) want = { topic: t.id, count };
          }
          if (!want) {
            expect(m, `${ed} ${kind}:${o.key}`).toBeNull();
            continue;
          }
          lines++;
          expect(m, `${ed} ${kind}:${o.key}`).not.toBeNull();
          expect({ topic: m![1], count: Number(m![2]) }, `${ed} ${kind}:${o.key}`).toEqual(want);
          expect(hrefsIn(html), `${ed} ${kind}:${o.key}`).toContain(`/${ed}/inyanim/${want.topic}/`);
        }
      }
    }
    expect(lines).toBeGreaterThan(0);
  });

  it("topic pages mark the rows the catalog places on the topic's own days", () => {
    const { topics } = tree();
    const occ = readJson<OccasionsFile>(join(corpus, "occasions.json"));
    const links = layerFile<{ occasions: LayerOccasionTopic[] }>("occasion-topics.json").occasions;
    const placed = new Map<string, Set<string>>();
    for (const p of occ.parshiyos) placed.set(`parsha:${p.key}`, new Set(p.shiurim.map((s) => s.id)));
    for (const z of occ.zmanim) placed.set(`zman:${z.key}`, new Set([...z.shiurim, ...z.subs.flatMap((s) => s.shiurim)].map((s) => s.id)));
    let marked = 0;
    for (const t of topics.filter((x) => x.pages.quiet && links.some((l) => l.topicId === x.id))) {
      const own = links.filter((l) => l.topicId === t.id).map((l) => placed.get(`${l.kind}:${l.key}`) ?? new Set<string>());
      const html = mainOf(page(t.gateway ? `en/inyanim/${t.id}/all` : `en/inyanim/${t.id}`));
      for (const m of html.matchAll(/<li class="topic-row[^"]*" data-shiur="([^"]+)"( data-on-occasion="[^"]+")?/g)) {
        const on = own.some((s) => s.has(m[1]!));
        expect(m[2] !== undefined, `${t.id} ${m[1]}`).toBe(on);
        if (on) marked++;
      }
    }
    expect(marked).toBeGreaterThan(0);
  });
});
