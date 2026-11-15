/**
 * Splits snippet text into plain and highlighted runs from `[start, end)` offsets (the API sends
 * offsets, never markup). Marks are sorted, clamped to the text and merged when they overlap, so bad
 * offsets can only lose a highlight, never text.
 */
export interface Run {
  text: string;
  mark: boolean;
}

export function normalizeMarks(marks: readonly (readonly [number, number])[], length: number): [number, number][] {
  const clean = marks
    .map(([s, e]) => [Math.max(0, Math.trunc(s)), Math.min(length, Math.trunc(e))] as [number, number])
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: [number, number][] = [];
  for (const m of clean) {
    const last = out[out.length - 1];
    if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1]);
    else out.push([m[0], m[1]]);
  }
  return out;
}

export function splitMarks(text: string, marks: readonly (readonly [number, number])[]): Run[] {
  const runs: Run[] = [];
  let at = 0;
  for (const [s, e] of normalizeMarks(marks, text.length)) {
    if (s > at) runs.push({ text: text.slice(at, s), mark: false });
    runs.push({ text: text.slice(s, e), mark: true });
    at = e;
  }
  if (at < text.length) runs.push({ text: text.slice(at), mark: false });
  return runs;
}
