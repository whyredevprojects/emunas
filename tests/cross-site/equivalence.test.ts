/**
 * Cross-site equivalence (integration-plan §2.2, W5.1), on the real builds of both sites:
 *
 * 1. Link level (no browser): for a shiur, a section, a time, a series, a parsha, a zman, a work, a
 *    person and a concept, `links.quiet.*` and `links.live.*` both resolve in the built outputs, and
 *    `links.equivalent` maps each to the other. Every cross-site link in both outputs resolves
 *    (`scanCrossLinks`), and planted broken links are caught.
 * 2. Browser (Chrome via playwright-core; both test hosts routed to the build outputs): each pair of
 *    equivalent pages shows the same thing (same catalog title, same chapter start, same time,
 *    same series, and the same shiurim for occasions, works, people and concepts); "Open in the
 *    listening app" and "In the Library" land on the matching page of the other site.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT_FALLBACK, pickText, type LocalizedText } from "@emunas/i18n";
import { EDS, type Ed, type Links } from "@emunas/links";
import {
  checkLiveUrl,
  checkQuietUrl,
  LIVE,
  missingOutputs,
  QUIET,
  quietFile,
  readCorpusFacts,
  scanCrossLinks,
  siteLinks,
  sitePaths,
  type CorpusFacts,
} from "./sites.ts";

const paths = sitePaths();
const missing = missingOutputs(paths);
if (missing && process.env["CI"]) throw new Error(missing);

interface Chapter {
  idx: number;
  t: number;
  end: number;
  title: LocalizedText;
}
interface ShiurFile {
  id: string;
  lang: Ed;
  catalog: { titleOriginal: string };
  recordings: { id: string; offset: number; duration: number }[];
  notes?: { chapters: Chapter[] };
}

interface Samples {
  shiur: ShiurFile & { notes: { chapters: Chapter[] } };
  series: { id: string; title: LocalizedText };
  parsha: { key: string; en: string; yi: string; he?: string };
  zman: { key: string; en: string; yi: string; he?: string };
  work: string;
  person: string;
  concept: { id: string; he: string };
  topic: { id: string; label: { en?: string; yi?: string; he?: string } };
  story: { id: string; title: LocalizedText };
}

let facts: CorpusFacts;
let links: Links;
let s: Samples;

function shiurFile(id: string): ShiurFile {
  return JSON.parse(readFileSync(join(paths.corpus, "shiurim", `${id}.json`), "utf8")) as ShiurFile;
}

const liveHas = (rel: string) => existsSync(join(paths.liveClient, "data", rel));

function pickSamples(f: CorpusFacts): Samples {
  // A Yiddish full shiur with one recording and at least three chapters (the canonical sample first).
  const ids = ["yi-parshas-hashavua-brshys-01", ...f.index.filter((r) => r.status === "full").map((r) => r.id)];
  let shiur: Samples["shiur"] | null = null;
  for (const id of ids) {
    if (!existsSync(join(paths.corpus, "shiurim", `${id}.json`))) continue;
    const x = shiurFile(id);
    if (x.notes && x.notes.chapters.length >= 3 && x.recordings.length === 1 && liveHas(`shiur/${id}.json`)) {
      shiur = x as Samples["shiur"];
      break;
    }
  }
  if (!shiur) throw new Error("no full shiur with three chapters");
  const series = f.series.filter((x) => x.count >= 3 && liveHas(`series/${x.id}.json`)).sort((a, b) => b.count - a.count)[0];
  if (!series) throw new Error("no series");
  const top = (xs: { key: string; count: number; en: string; yi: string }[]) => [...xs].sort((a, b) => b.count - a.count)[0]!;
  // Corpus entities (by corpus id, from the layer): a page on both sites, most shiurim first.
  const both = (x: { pages?: { quiet?: boolean; live?: boolean } }) => x.pages?.quiet === true && x.pages.live === true;
  const largest = <T extends { id: string }>(xs: T[], size: (x: T) => number, what: string): T => {
    const hit = [...xs].sort((a, b) => size(b) - size(a) || a.id.localeCompare(b.id))[0];
    if (!hit) throw new Error(`no ${what} with a page on both sites`);
    return hit;
  };
  const L = f.layer;
  const topic = largest(
    L.topics.filter((t) => both(t) && t.gateway !== true && liveHas(`topic/${t.id}.json`)),
    (t) => t.count,
    "topic",
  );
  const concept = largest(
    L.concepts.filter((c) => both(c) && !c.mergedIntoTopic && c.passim !== true && liveHas(`entity/c/${c.id}.json`)),
    (c) => c.shiurIds?.length ?? 0,
    "concept",
  );
  const story = largest(
    L.stories.filter((x) => both(x) && liveHas(`story/${x.id}.json`)),
    (x) => x.tellings?.length ?? 0,
    "story",
  );
  return {
    shiur,
    series: { id: series.id, title: series.title },
    parsha: top(f.occasions.parshiyos),
    zman: top(f.occasions.zmanim),
    work: largest(L.works.filter((w) => both(w) && liveHas(`work/${w.id}.json`)), (w) => w.count ?? 0, "work").id,
    person: largest(L.people.filter((x) => both(x) && liveHas(`entity/p/${x.id}.json`)), (x) => x.count ?? 0, "person").id,
    concept: { id: concept.id, he: concept.canonicalHe ?? "" },
    topic: { id: topic.id, label: topic.label },
    story: { id: story.id, title: story.title },
  };
}

describe.skipIf(missing !== null)("cross-site links (built outputs)", () => {
  beforeAll(() => {
    facts = readCorpusFacts(paths.corpus);
    links = siteLinks(facts.data);
    s = pickSamples(facts);
  });

  /** [label, quiet URL, live URL] for every row of the §2.2 table, both editions. */
  const pairs = (ed: Ed): [string, string, string][] => {
    const ch = s.shiur.notes.chapters[2]!;
    const t = Math.round((ch.t + ch.end) / 2);
    return [
      ["home", links.quiet.home(ed), links.live.home(ed)],
      ["shiur", links.quiet.shiur(ed, s.shiur.id), links.live.shiur(ed, s.shiur.id)],
      ["section", links.quiet.shiur(ed, s.shiur.id, { t: ch.t }), links.live.shiur(ed, s.shiur.id, { t: ch.t, m: `${s.shiur.id}~s${ch.idx}` })],
      ["time", links.quiet.shiur(ed, s.shiur.id, { t }), links.live.shiur(ed, s.shiur.id, { t })],
      ["series", links.quiet.series(ed, s.series.id), links.live.series(ed, s.series.id)],
      ["parsha", links.quiet.parsha(ed, s.parsha.key), links.live.occasion(ed, s.parsha.key)],
      ["zman", links.quiet.zman(ed, s.zman.key), links.live.occasion(ed, s.zman.key)],
      ["work", links.quiet.work(ed, s.work), links.live.work(ed, s.work)],
      ["person", links.quiet.person(ed, s.person), links.live.person(ed, s.person)],
      ["concept", links.quiet.glossaryEntry(ed, s.concept.id), links.live.concept(ed, s.concept.id)],
      ["topic", links.quiet.topic(ed, s.topic.id), links.live.topic(ed, s.topic.id)],
      ["story", links.quiet.story(ed, s.story.id), links.live.story(ed, s.story.id)],
    ];
  };

  it("both sides of every equivalence row resolve in the builds", () => {
    for (const ed of EDS) {
      for (const [label, q, l] of pairs(ed)) {
        expect(checkQuietUrl(paths.quietDist, q), `${ed} ${label}: ${q}`).toBeNull();
        expect(checkLiveUrl(paths.liveClient, l), `${ed} ${label}: ${l}`).toBeNull();
      }
    }
  });

  it("links.equivalent maps each side to the other", () => {
    for (const ed of EDS) {
      for (const [label, q, l] of pairs(ed)) {
        const toLive = links.equivalent(q);
        const toQuiet = links.equivalent(l);
        expect(toLive, `${ed} ${label}`).not.toBeNull();
        expect(toQuiet, `${ed} ${label}`).not.toBeNull();
        // Paths must match exactly; the section row is Quiet's #t={chapter start}, Live's ?t= plus ?m=.
        expect(new URL(toLive!).pathname, `${ed} ${label} quiet→live`).toBe(new URL(l).pathname);
        expect(new URL(toQuiet!).pathname, `${ed} ${label} live→quiet`).toBe(new URL(q).pathname);
        if (label === "time") {
          expect(new URL(toLive!).searchParams.get("t")).toBe(new URL(l).searchParams.get("t"));
          expect(new URL(toQuiet!).hash).toBe(new URL(q).hash);
        }
        if (label === "section") {
          expect(new URL(toQuiet!).hash, `${ed} section live→quiet`).toBe(new URL(q).hash);
          expect(new URL(toLive!).searchParams.get("t")).toBe(new URL(l).searchParams.get("t"));
        }
        expect(checkLiveUrl(paths.liveClient, toLive!), `${ed} ${label}`).toBeNull();
        expect(checkQuietUrl(paths.quietDist, toQuiet!), `${ed} ${label}`).toBeNull();
      }
    }
  });

  it("every cross-site link in both outputs resolves", () => {
    const { checked, findings } = scanCrossLinks(paths);
    expect(checked).toBeGreaterThan(1000);
    expect(findings.slice(0, 20)).toEqual([]);
  });

  it("planted broken cross-links are caught (self-test)", () => {
    const bad = [
      `${LIVE}/en/s/no-such-shiur`,
      `${LIVE}/en/p/no-such-person`,
      `${LIVE}/en/seforim/no-such-work`,
      `${LIVE}/en/series/no-such-series`,
      `${LIVE}/en/nowhere`,
      `${LIVE}/de/`,
    ];
    for (const u of bad) expect(checkLiveUrl(paths.liveClient, u), u).not.toBeNull();
    const badQuiet = [
      `${QUIET}/en/shiur/no-such-shiur/`,
      `${QUIET}/en/shiur/${s.shiur.id}/#no-such-anchor`,
      `${QUIET}/en/people/no-such-person/`,
      `${QUIET}/de/`,
    ];
    for (const u of badQuiet) expect(checkQuietUrl(paths.quietDist, u), u).not.toBeNull();
    // and the good twins pass
    expect(checkLiveUrl(paths.liveClient, `${LIVE}/en/s/${s.shiur.id}?t=12`)).toBeNull();
    expect(checkQuietUrl(paths.quietDist, `${QUIET}/en/shiur/${s.shiur.id}/#main`)).toBeNull();
    expect(checkQuietUrl(paths.quietDist, `${QUIET}/en/shiur/${s.shiur.id}/#t=12`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Browser

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

function chromePath(): string {
  let pw: string | undefined;
  try {
    pw = chromium.executablePath();
  } catch {
    pw = undefined;
  }
  const found = [process.env["CHROME_PATH"], pw, "/usr/bin/google-chrome"].find((p): p is string => typeof p === "string" && p !== "" && existsSync(p));
  if (!found) throw new Error("No Chrome found: set CHROME_PATH or install Playwright's Chromium");
  return found;
}

async function fulfillFile(route: Route, file: string | null): Promise<void> {
  if (!file) return route.fulfill({ status: 404, contentType: "text/plain", body: "not found" });
  return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? "application/octet-stream", body: readFileSync(file) });
}

/** Live's static hosting: `x.html` at `/x`, `x/index.html` at `/x/`, SPA fallback for page paths. */
function liveFile(client: string, pathname: string): string | null {
  let p: string;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (p.includes("..")) return null;
  const is = (f: string) => existsSync(f) && statSync(f).isFile();
  for (const f of [join(client, p), join(client, `${p}.html`), join(client, p, "index.html")]) if (is(f)) return f;
  if (p.startsWith("/data/") || extname(p) !== "") return null;
  const spa = join(client, "__spa-fallback.html");
  return is(spa) ? spa : join(client, "index.html");
}

/** A silent 8 kHz WAV `seconds` long, sliced per Range request (any media URL). */
async function silentMedia(route: Route): Promise<void> {
  const total = 44 + 8000 * 4 * 3600;
  const m = /^bytes=(\d*)-(\d*)$/u.exec(route.request().headers()["range"] ?? "");
  const start = m?.[1] ? Number(m[1]) : 0;
  const end = Math.min(m?.[2] ? Number(m[2]) : total - 1, total - 1, start + (1 << 20) - 1);
  const body = Buffer.alloc(end - start + 1, 0x80);
  if (start < 44) {
    const h = Buffer.alloc(44);
    h.write("RIFF", 0, "ascii");
    h.writeUInt32LE(total - 8, 4);
    h.write("WAVEfmt ", 8, "ascii");
    h.writeUInt32LE(16, 16);
    h.writeUInt16LE(1, 20);
    h.writeUInt16LE(1, 22);
    h.writeUInt32LE(8000, 24);
    h.writeUInt32LE(8000, 28);
    h.writeUInt16LE(1, 32);
    h.writeUInt16LE(8, 34);
    h.write("data", 36, "ascii");
    h.writeUInt32LE(total - 44, 40);
    h.copy(body, 0, start, Math.min(44, end + 1));
  }
  await route.fulfill({
    status: 206,
    headers: {
      "content-type": "audio/wav",
      "accept-ranges": "bytes",
      "access-control-allow-origin": "*",
      "content-range": `bytes ${start}-${end}/${total}`,
    },
    body,
  });
}

describe.skipIf(missing !== null)("equivalent pages show the same thing (browser)", () => {
  let browser: Browser;
  let context: BrowserContext;

  beforeAll(async () => {
    facts ??= readCorpusFacts(paths.corpus);
    links ??= siteLinks(facts.data);
    s ??= pickSamples(facts);
    browser = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox"] });
    context = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: "block" });
    await context.route(`${QUIET}/**`, (r) => fulfillFile(r, quietFile(paths.quietDist, new URL(r.request().url()).pathname)));
    await context.route(`${LIVE}/**`, (r) => {
      const u = new URL(r.request().url());
      if (u.pathname.startsWith("/api/")) return r.fulfill({ status: 503, body: "" });
      return fulfillFile(r, liveFile(paths.liveClient, u.pathname));
    });
    await context.route(/^https:\/\/media\./u, silentMedia);
  });

  afterAll(async () => {
    await browser?.close();
  });

  async function open(url: string): Promise<Page> {
    const page = await context.newPage();
    const res = await page.goto(url, { waitUntil: "load" });
    expect(res?.status(), url).toBe(200);
    await page.locator("main h1").first().waitFor();
    await page.waitForFunction(() => document.querySelectorAll("main [aria-busy=true]").length === 0, null, { timeout: 15_000 });
    return page;
  }

  const h1 = async (page: Page) => (await page.locator("main h1").first().innerText()).replace(/\s+/gu, " ").trim();
  const norm = (x: string) => x.replace(/[\s‏‎]+/gu, " ").trim();

  /** Shiur ids linked from a page (Quiet `/{ed}/shiur/<id>/`, Live `/{ui}/s/<id>`). */
  async function shiurIds(page: Page, site: "quiet" | "live"): Promise<Set<string>> {
    const eds = EDS.join("|");
    const re = new RegExp(site === "quiet" ? `^/(?:${eds})/shiur/([^/#?]+)/` : `^/(?:${eds})/s/([^/#?]+)`, "u");
    const hrefs = await page.locator("main a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    const out = new Set<string>();
    for (const h of hrefs) {
      const p = h.startsWith("http") ? new URL(h).pathname : h;
      const m = re.exec(p);
      if (m) out.add(decodeURIComponent(m[1]!));
    }
    return out;
  }

  /** Clicks every "show more" button on a Live page until none is left. */
  async function expandAll(page: Page): Promise<void> {
    for (let i = 0; i < 50; i++) {
      const more = page.locator("main button", { hasText: /^(Show|More|ווייזן|מער)/u });
      if ((await more.count()) === 0) return;
      await more.first().click();
    }
  }

  for (const ed of EDS) {
    it(`shiur: the same catalog title on both sites, and each links to the other (${ed})`, async () => {
      const title = norm(s.shiur.catalog.titleOriginal);
      const quiet = await open(links.quiet.shiur(ed, s.shiur.id));
      expect(norm(await h1(quiet))).toContain(title);
      // "Open in the listening app" → the same shiur's listening room
      const toLive = quiet.locator(`main a[href^="${LIVE}/${ed}/s/${s.shiur.id}"]`).first();
      await toLive.click();
      await quiet.waitForURL(`${LIVE}/${ed}/s/${s.shiur.id}**`);
      await quiet.locator(`[data-room="${s.shiur.id}"]`).waitFor();
      expect(norm(await h1(quiet))).toContain(title);
      // "In the Library" → back to the Quiet page
      const library = quiet.locator(`main a[href^="${QUIET}/${ed}/shiur/${s.shiur.id}/"]`).first();
      await library.click();
      await quiet.waitForURL(`${QUIET}/${ed}/shiur/${s.shiur.id}/**`);
      expect(norm(await h1(quiet))).toContain(title);
      await quiet.close();
    });

    it(`section: Quiet #t={chapter start} and Live ?t&m= start at the same chapter (${ed})`, async () => {
      const ch = s.shiur.notes.chapters[2]!;
      const quiet = await open(links.quiet.shiur(ed, s.shiur.id, { t: ch.t }));
      await quiet.waitForFunction(
        (want) => {
          const a = document.querySelector<HTMLAudioElement>("audio.listen-audio") ?? document.querySelector("audio");
          return a !== null && a.readyState >= 1 && Math.abs(Number(a.dataset["offset"] ?? 0) + a.currentTime - want) <= 1;
        },
        ch.t,
        { timeout: 15_000 },
      );
      await quiet.close();
      const live = await open(links.live.shiur(ed, s.shiur.id, { t: ch.t, m: `${s.shiur.id}~s${ch.idx}` }));
      const active = live.locator(`[data-chapter="${ch.idx}"]`).first();
      await active.waitFor();
      expect(norm(await active.innerText())).toContain(norm(pickText(ch.title, ed).text));
      const t = Number(await live.locator("[data-dock-slot] [data-player-status]").getAttribute("data-player-t"));
      expect(Math.abs(t - ch.t), `live t ${t} vs ${ch.t}`).toBeLessThanOrEqual(1);
      await live.close();
    });

    it(`time: Quiet #t= and Live ?t= put the player at the same second (${ed})`, async () => {
      const ch = s.shiur.notes.chapters[2]!;
      const t = Math.round((ch.t + ch.end) / 2);
      const quiet = await open(links.quiet.shiur(ed, s.shiur.id, { t }));
      await quiet.waitForFunction(
        (want) => {
          const a = document.querySelector<HTMLAudioElement>("audio.listen-audio") ?? document.querySelector("audio");
          return a !== null && a.readyState >= 1 && Math.abs(a.currentTime - want) <= 1;
        },
        t,
        { timeout: 15_000 },
      );
      await quiet.close();
      const live = await open(links.live.shiur(ed, s.shiur.id, { t }));
      const dock = live.locator("[data-dock-slot] [data-player-status]");
      await expect.poll(async () => Math.abs(Number(await dock.getAttribute("data-player-t")) - t), { timeout: 10_000 }).toBeLessThanOrEqual(1);
      await live.close();
    });

    it(`series: the same series title on both sites (${ed})`, async () => {
      const quiet = await open(links.quiet.series(ed, s.series.id));
      const live = await open(links.live.series(ed, s.series.id));
      const qt = norm(await h1(quiet));
      const lt = norm(await h1(live));
      expect(qt.includes(norm(pickText(s.series.title, ed).text)) || lt.includes(qt) || qt.includes(lt), `${qt} | ${lt}`).toBe(true);
      // the same parts: every part Live lists is on the Quiet page
      const q = await shiurIds(quiet, "quiet");
      const l = await shiurIds(live, "live");
      expect(l.size).toBeGreaterThan(0);
      for (const id of l) expect(q.has(id), `series ${s.series.id}: ${id}`).toBe(true);
      await quiet.close();
      await live.close();
    });

    for (const what of ["parsha", "zman", "work", "person", "concept", "topic", "story"] as const) {
      it(`${what}: both sites list the same shiurim (${ed})`, async () => {
        const [q, l] =
          what === "parsha"
            ? [links.quiet.parsha(ed, s.parsha.key), links.live.occasion(ed, s.parsha.key)]
            : what === "zman"
              ? [links.quiet.zman(ed, s.zman.key), links.live.occasion(ed, s.zman.key)]
              : what === "work"
                ? [links.quiet.work(ed, s.work), links.live.work(ed, s.work)]
                : what === "person"
                  ? [links.quiet.person(ed, s.person), links.live.person(ed, s.person)]
                  : what === "concept"
                    ? [links.quiet.glossaryEntry(ed, s.concept.id), links.live.concept(ed, s.concept.id)]
                    : what === "topic"
                      ? [links.quiet.topic(ed, s.topic.id), links.live.topic(ed, s.topic.id)]
                      : [links.quiet.story(ed, s.story.id), links.live.story(ed, s.story.id)];
        const quiet = await open(q);
        const live = await open(l);
        await expandAll(live);
        const qi = await shiurIds(quiet, "quiet");
        // A long Quiet entry lists every shiur on its `all/` page (Quiet C4.2, C4.3).
        const allPath = `${new URL(q).pathname}all/`;
        if (quietFile(paths.quietDist, allPath)) {
          const all = await open(`${QUIET}${allPath}`);
          for (const id of await shiurIds(all, "quiet")) qi.add(id);
          await all.close();
        }
        const li = await shiurIds(live, "live");
        expect(qi.size, `${what} on Quiet: ${q}`).toBeGreaterThan(0);
        expect(li.size, `${what} on Live: ${l}`).toBeGreaterThan(0);
        // Live may list moments inside fewer shiurim (it groups); every shiur it shows is on Quiet.
        for (const id of li) expect(qi.has(id), `${what} ${l}: ${id} not on the Quiet page`).toBe(true);
        if (what === "parsha" || what === "zman") {
          const occ = what === "parsha" ? s.parsha : s.zman;
          // An occasion's name along the edition's fallback chain (Hebrew-script editions may head
          // with the Hebrew or the Yiddish form).
          const labels = CONTENT_FALLBACK[ed].map((l) => norm(occ[l] ?? "")).filter(Boolean);
          const qh = norm(await h1(quiet));
          const lh = norm(await h1(live));
          expect(labels.some((n) => qh.includes(n)), `Quiet h1 ${qh}`).toBe(true);
          expect(labels.some((n) => lh.includes(n)), `Live h1 ${lh}`).toBe(true);
        }
        // Corpus entries: both pages name the same entity (Quiet heads with the Hebrew name).
        if (what === "topic") {
          const names = [s.topic.label.he, s.topic.label.yi, s.topic.label.en].map((x) => norm(x ?? "")).filter(Boolean);
          expect(names.length, "topic names").toBeGreaterThan(0);
          const qh = norm(await h1(quiet));
          const lh = norm(await h1(live));
          expect(names.some((n) => qh.includes(n)), `Quiet h1 ${qh}`).toBe(true);
          expect(names.some((n) => lh.includes(n)), `Live h1 ${lh}`).toBe(true);
        }
        if (what === "concept" && s.concept.he) {
          expect(norm(await h1(quiet))).toContain(norm(s.concept.he));
          expect(norm(await live.locator("main").innerText())).toContain(norm(s.concept.he));
        }
        if (what === "story") {
          const titles = [pickText(s.story.title, ed).text, s.story.title.en, s.story.title.yi].map(norm).filter(Boolean);
          const qh = norm(await h1(quiet));
          const lh = norm(await h1(live));
          expect(titles.some((t) => qh.includes(t)), `Quiet h1 ${qh}`).toBe(true);
          expect(titles.some((t) => lh.includes(t)), `Live h1 ${lh}`).toBe(true);
        }
        await quiet.close();
        await live.close();
      });
    }
  }
});
