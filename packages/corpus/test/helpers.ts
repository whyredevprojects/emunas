import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";
import type { PublicShiur } from "../src/public/types.ts";

export const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO = resolve(PKG, "../..");
export const MINI_DATA = join(PKG, "test/fixtures/mini/data");
export const MINI_POLICY = join(PKG, "test/fixtures/mini/site-policy");
export const GOLDEN_DIR = join(PKG, "test/fixtures/golden");
export const REAL_DATA = join(REPO, "data");
export const REAL_POLICY = join(REPO, "site-policy");

/** Keys that must never appear in any public output (§5.2). */
export const FORBIDDEN_KEYS = [
  "heardAs",
  "asrNotes",
  "segs",
  "startSeg",
  "endSeg",
  "questionSegs",
  "answerSegs",
  "segments",
  "transcriptKey",
  "audioKey",
  "asrModel",
  "model",
  "variant",
  "types",
] as const;

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

export function tmp(prefix = "corpus-test-"): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

/** A writable copy of the mini corpus data dir. */
export function miniCopy(): string {
  const d = join(tmp(), "data");
  cpSync(MINI_DATA, d, { recursive: true });
  return d;
}

export function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function editJson<T>(path: string, f: (x: T) => T | void): void {
  const x = readJson<T>(path);
  const r = f(x);
  writeFileSync(path, JSON.stringify(r === undefined ? x : r));
}

export function shiurFile(dataDir: string, id: string, name: "meta" | "extraction" | "writeup"): string {
  return join(dataDir, "derived/shiurim", id, `${name}.json`);
}

/** Every key of every object anywhere in `x`. */
export function allKeys(x: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(x)) for (const v of x) allKeys(v, out);
  else if (x && typeof x === "object") {
    for (const [k, v] of Object.entries(x)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

/** All global times in a shiur, with a label. */
export function timesOf(s: PublicShiur): { label: string; t: number }[] {
  const n = s.notes;
  if (!n) return [];
  const out: { label: string; t: number }[] = [];
  const add = (label: string, t: number | null) => {
    if (t !== null) out.push({ label, t });
  };
  for (const c of n.chapters) {
    add(c.id, c.t);
    add(`${c.id}:end`, c.end);
    c.sub.forEach((x, i) => add(`${c.id}:sub${i}`, x.t));
  }
  for (const m of [...n.summary.keyPoints, ...n.insights, ...n.takeaways]) {
    add(m.id, m.t);
    add(`${m.id}:end`, m.end);
  }
  for (const x of n.sources) add(x.id, x.t);
  for (const q of n.questions) {
    add(q.id, q.tq);
    add(`${q.id}:a`, q.ta);
  }
  for (const st of n.stories) {
    add(st.id, st.t);
    add(`${st.id}:end`, st.end);
  }
  for (const [a, b] of n.skip) {
    add("skip", a);
    add("skip:end", b);
  }
  for (const ed of ["en", "yi"] as const) {
    for (const b of n.writeup[ed]) for (const p of b.paragraphs) {
      add(p.id, p.t);
      add(`${p.id}:end`, p.end);
    }
  }
  return out;
}

/** Invariant violations of one projected shiur (empty = fine). */
export function invariantViolations(s: PublicShiur): string[] {
  const v: string[] = [];
  const eps = 1e-6;
  // recordings: contiguous offsets
  let acc = 0;
  for (const r of s.recordings) {
    if (Math.abs(r.offset - acc) > 0.002) v.push(`${s.id}: recording ${r.id} offset ${r.offset} != ${acc}`);
    acc = r.offset + r.duration;
  }
  if (Math.abs(acc - s.duration) > 0.002) v.push(`${s.id}: duration ${s.duration} != sum ${acc}`);
  const n = s.notes;
  if (s.status === "full" && !n) v.push(`${s.id}: full without notes`);
  if (s.status === "catalog-only" && n) v.push(`${s.id}: catalog-only with notes`);
  if (!n) return v;
  // chapters: monotonic, tiling [0, duration]
  const ch = n.chapters;
  if (ch.length === 0) v.push(`${s.id}: no chapters`);
  if (ch[0] && ch[0].t !== 0) v.push(`${s.id}: first chapter starts at ${ch[0].t}`);
  const last = ch[ch.length - 1];
  if (last && Math.abs(last.end - s.duration) > 0.002) v.push(`${s.id}: last chapter ends at ${last.end}, duration ${s.duration}`);
  ch.forEach((c, i) => {
    if (c.end < c.t - eps) v.push(`${c.id}: end before start`);
    const nx = ch[i + 1];
    if (nx && Math.abs(nx.t - c.end) > eps) v.push(`${c.id}: gap/overlap to next chapter (${c.end} vs ${nx.t})`);
    for (const sub of c.sub) if (sub.t < c.t - eps || sub.t > c.end + eps) v.push(`${c.id}: subsection outside chapter`);
  });
  // every t within [0, duration]
  for (const { label, t } of timesOf(s)) {
    if (!(t >= 0 && t <= s.duration + eps)) v.push(`${label}: t ${t} outside [0, ${s.duration}]`);
  }
  // write-up t inside its section
  const byIdx = new Map(ch.map((c) => [c.idx, c]));
  for (const ed of ["en", "yi"] as const) {
    for (const b of n.writeup[ed]) {
      const c = byIdx.get(b.sectionIndex);
      if (!c) {
        v.push(`${s.id}: write-up block for unknown section ${b.sectionIndex}`);
        continue;
      }
      for (const p of b.paragraphs) {
        if (p.t !== null && (p.t < c.t - eps || p.t > c.end + eps)) v.push(`${p.id}: t ${p.t} outside section [${c.t}, ${c.end}]`);
        if (p.end !== null && p.t !== null && (p.end < p.t - eps || p.end > c.end + eps)) v.push(`${p.id}: end outside section`);
        for (const k of p.src) if (k < 0 || k >= n.sources.length) v.push(`${p.id}: src ${k} out of range`);
      }
    }
  }
  // source idx is its position
  n.sources.forEach((x, i) => {
    if (x.idx !== i) v.push(`${x.id}: idx ${x.idx} != position ${i}`);
  });
  // moment ids unique
  const ids = [
    ...ch.map((c) => c.id),
    ...n.summary.keyPoints.map((m) => m.id),
    ...n.insights.map((m) => m.id),
    ...n.takeaways.map((m) => m.id),
    ...n.sources.map((m) => m.id),
    ...n.questions.map((m) => m.id),
    ...n.stories.map((m) => m.id),
    ...n.writeup.en.flatMap((b) => b.paragraphs.map((p) => p.id)),
    ...n.writeup.yi.flatMap((b) => b.paragraphs.map((p) => p.id)),
  ];
  if (new Set(ids).size !== ids.length) v.push(`${s.id}: duplicate moment ids`);
  // skip ranges sorted and sane
  n.skip.forEach(([a, b], i) => {
    if (b < a) v.push(`${s.id}: skip range ${i} reversed`);
    const prev = n.skip[i - 1];
    if (prev && prev[0] > a) v.push(`${s.id}: skip ranges unsorted`);
  });
  return v;
}
