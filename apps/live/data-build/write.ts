/**
 * Writes the emitted files under a data root (`apps/live/public/data` by default). The tree is a full
 * rebuild every time (tech-live §3.7), but a file is rewritten only when its bytes change and files
 * that are no longer emitted are removed, so a data change touches only the files it affects.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { walkFiles } from "@emunas/corpus-guard/budgets";

/** Compact JSON: these files are fetched by browsers; br compression happens at the edge. */
export function serialize(body: unknown): string {
  return JSON.stringify(body);
}

export interface WriteResult {
  written: string[];
  unchanged: number;
  removed: string[];
}

export function writeDataDir(outDir: string, files: ReadonlyMap<string, unknown>): WriteResult {
  const root = resolve(outDir);
  // Safety: this function deletes stale files, so it only runs on a directory named `data`.
  if (basename(root) !== "data") throw new Error(`refusing to write the data tree outside a 'data' directory: ${root}`);
  mkdirSync(root, { recursive: true });
  const written: string[] = [];
  let unchanged = 0;
  for (const [file, body] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const path = resolve(root, file);
    if (!path.startsWith(root + sep)) throw new Error(`data file escapes the data root: ${file}`);
    const text = serialize(body);
    if (existsSync(path) && readFileSync(path, "utf8") === text) {
      unchanged++;
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp-${process.pid}`;
    writeFileSync(tmp, text);
    renameSync(tmp, path);
    written.push(file);
  }
  const removed: string[] = [];
  for (const f of [...walkFiles(root)]) {
    const rel = relative(root, f).split(sep).join("/");
    if (!files.has(rel)) {
      rmSync(f, { force: true });
      removed.push(rel);
    }
  }
  removeEmptyDirs(root, root);
  return { written, unchanged, removed };
}

function removeEmptyDirs(dir: string, root: string): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) removeEmptyDirs(join(dir, e.name), root);
  }
  if (dir !== root && readdirSync(dir).length === 0) rmdirSync(dir);
}
