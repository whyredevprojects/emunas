/**
 * Dev-only: (re)generate the test fixtures from today's data.
 *
 *   npm run fixtures:mini --workspace=@emunas/corpus            # mini corpus + goldens
 *   npm run fixtures:mini --workspace=@emunas/corpus -- --golden-only
 *
 * Mini corpus (test/fixtures/mini/data): 60 in-scope shiurim (the 7 sample shiurim, every
 * multi-recording shiur, then an even spread over the rest, about half of them done) plus 2
 * out-of-scope rows. Derived text only: `heardAs` and `asrNotes` are blanked, transcript keys are
 * nulled and audio keys replaced by synthetic ones. Catalog files keep section ids/titles/pages only.
 *
 * Goldens (test/fixtures/golden/<id>.json): projected output of the 7 samples built from the mini
 * corpus with the default keyer; `rev` is replaced by "<rev>" (it hashes the code too).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDataReader, defaultDataDir } from "../src/build/read.ts";
import { projectCorpus, toJson } from "../src/build/build.ts";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(PKG, "test/fixtures");
export const MINI_DATA = join(FIXTURES, "mini/data");
export const MINI_POLICY = join(FIXTURES, "mini/site-policy");
export const GOLDEN_DIR = join(FIXTURES, "golden");

export const SAMPLES = [
  "yi-parshas-hashavua-brshys-01",
  "en-parsha-en-nch-01",
  "yi-zmanim-lvl-01",
  "yi-zmanim-tv-bb-04",
  "en-miscellaneous-en-01",
  "yi-tanya-1-01",
  "yi-zmanim-msybs-lchyym-bkmp-01-c",
];

type Json = Record<string, unknown>;

function scrubExtraction(e: Json): Json {
  const blankHeard = (x: Json) => ({ ...x, heardAs: Array.isArray(x["heardAs"]) ? [] : "" });
  return {
    ...e,
    sources: (e["sources"] as Json[]).map(blankHeard),
    concepts: (e["concepts"] as Json[]).map(blankHeard),
    people: (e["people"] as Json[]).map(blankHeard),
    asrNotes: "",
  };
}

function scrubRecording(r: Json): Json {
  return { ...r, audioKey: `fixture/${String(r["id"])}.mp3`, transcriptKey: null };
}

function makeMini(): void {
  const reader = createDataReader(defaultDataDir());
  const ingest = JSON.parse(reader.readText("derived/ingest.json")!) as Json & { shiurim: Json[]; recordings: Json[]; series: Json[] };
  const manifest = JSON.parse(reader.readText("derived/manifest.json")!) as Json & { entries: Json[] };
  const status = new Map(manifest.entries.map((e) => [String(e["shiurId"]), String(e["status"])]));
  const inScope = ingest.shiurim.filter((s) => s["inScope"] === true);

  const picked: string[] = [...SAMPLES];
  for (const s of inScope) if ((s["recordingIds"] as string[]).length > 1 && !picked.includes(String(s["id"]))) picked.push(String(s["id"]));
  const rest = inScope.map((s) => String(s["id"])).filter((id) => !picked.includes(id)).sort();
  const done = rest.filter((id) => status.get(id) === "done");
  const notDone = rest.filter((id) => status.get(id) !== "done");
  const need = 60 - picked.length;
  const nDone = Math.ceil(need / 2);
  const spread = (xs: string[], n: number) => Array.from({ length: n }, (_, i) => xs[Math.floor((i * xs.length) / n)]!);
  picked.push(...spread(done, nDone), ...spread(notDone, need - nDone));
  const outOfScope = ingest.shiurim.filter((s) => s["inScope"] !== true).slice(0, 2).map((s) => String(s["id"]));
  const ids = new Set([...picked, ...outOfScope]);

  const shiurim = ingest.shiurim.filter((s) => ids.has(String(s["id"])));
  const recIds = new Set(shiurim.flatMap((s) => s["recordingIds"] as string[]));
  const recordings = ingest.recordings.filter((r) => recIds.has(String(r["id"]))).map(scrubRecording);
  const series = ingest.series
    .map((x) => ({ ...x, shiurIds: (x["shiurIds"] as string[]).filter((id) => ids.has(id)) }))
    .filter((x) => x.shiurIds.length > 0);

  rmSync(join(FIXTURES, "mini"), { recursive: true, force: true });
  mkdirSync(join(MINI_DATA, "derived/shiurim"), { recursive: true });
  mkdirSync(join(MINI_DATA, "catalog"), { recursive: true });
  mkdirSync(MINI_POLICY, { recursive: true });
  writeFileSync(
    join(MINI_DATA, "derived/ingest.json"),
    toJson({ generatedAt: ingest["generatedAt"], stats: {}, shiurim, recordings, series, warnings: [] }),
  );
  writeFileSync(
    join(MINI_DATA, "derived/manifest.json"),
    toJson({ version: 1, updatedAt: manifest["updatedAt"], entries: manifest.entries.filter((e) => ids.has(String(e["shiurId"]))) }),
  );
  for (const name of ["pocket-guide-2012", "uncatalogued-guide"]) {
    const c = JSON.parse(reader.readText(`catalog/${name}.json`)!) as { sections: Json[] };
    const sections = c.sections.map((s) => {
      const o: Json = { id: s["id"], title: s["title"] };
      if (s["pages"] !== undefined) o["pages"] = s["pages"];
      if (s["dir"] !== undefined) o["dir"] = s["dir"];
      return o;
    });
    writeFileSync(join(MINI_DATA, `catalog/${name}.json`), toJson({ sections }));
  }
  for (const id of picked) {
    const files: [string, (j: Json) => Json][] = [
      ["meta", (m) => ({ ...m, recordings: (m["recordings"] as Json[]).map((r) => ({ ...r, recording: scrubRecording(r["recording"] as Json) })), shiur: null })],
      ["extraction", scrubExtraction],
      ["writeup", (w) => w],
    ];
    for (const [name, scrub] of files) {
      const text = reader.readText(`derived/shiurim/${id}/${name}.json`);
      if (text === null) continue;
      mkdirSync(join(MINI_DATA, "derived/shiurim", id), { recursive: true });
      writeFileSync(join(MINI_DATA, "derived/shiurim", id, `${name}.json`), JSON.stringify(scrub(JSON.parse(text) as Json)));
    }
  }
  writeFileSync(
    join(MINI_POLICY, "publish-policy.json"),
    toJson({ policyVersion: 1, confidence: { dropBelow: 0.6, softBelow: 0.75 }, suppress: [], allowVerbatim: [] }),
  );
  console.log(`mini corpus: ${picked.length} in scope (${picked.filter((id) => status.get(id) === "done").length} done) + ${outOfScope.length} out of scope`);
}

export function goldenOf(x: unknown): unknown {
  return { ...(x as Json), rev: "<rev>" };
}

function makeGoldens(): void {
  const p = projectCorpus({ dataDir: MINI_DATA, policyDir: MINI_POLICY });
  mkdirSync(GOLDEN_DIR, { recursive: true });
  for (const id of SAMPLES) {
    const s = p.shiurim.find((x) => x.id === id);
    if (!s) throw new Error(`sample ${id} not in the mini corpus`);
    writeFileSync(join(GOLDEN_DIR, `${id}.json`), toJson(goldenOf(s)));
  }
  console.log(`goldens: ${SAMPLES.length} written to ${GOLDEN_DIR}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes("--golden-only")) makeMini();
  makeGoldens();
}
