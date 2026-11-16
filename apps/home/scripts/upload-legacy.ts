/**
 * Copy the old www.emunas.com files (essay and article PDFs, logo and promo image) into R2 and
 * write apps/home/src/data/legacy-files.json.
 *
 *   npx tsx apps/home/scripts/upload-legacy.ts [--dry-run] [--refetch] [--staging <dir>]
 *
 * Run from the repo root. Downloads go to the staging dir (default: <os tmp>/emunas-legacy-staging)
 * and are treated as plain bytes: they are hashed, sniffed and uploaded, never opened or run.
 * Already-staged files are reused unless --refetch. Objects whose size and ETag (MD5 for a
 * single-part upload) already match are skipped, so a rerun uploads nothing.
 * --dry-run downloads, hashes and writes the manifest, and reports what it would upload,
 * without writing to R2.
 *
 * R2 credentials come from the repo-root .env (R2_ENDPOINT, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET). Values are never printed.
 * Behind an HTTP proxy, run with NODE_USE_ENV_PROXY=1.
 */
import { HeadObjectCommand, NotFound, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ORIGIN, SOURCES, UPLOADS, type EssayGroup, type LegacyKind, type LegacySource } from "./legacy-sources.ts";

const ROOT = process.cwd();
const MANIFEST = join(ROOT, "apps/home/src/data/legacy-files.json");
const KEY_PREFIX = "site/files/";
const KIND_DIR: Record<LegacyKind, string> = { essay: "essays", article: "articles", image: "images" };
const KIND_RANK: Record<LegacyKind, number> = { essay: 0, article: 1, image: 2 };

export interface LegacyFile {
  key: string;
  path: string;
  kind: LegacyKind;
  title: string;
  group: EssayGroup | null;
  order: number;
  sizeBytes: number;
  sha256: string;
  contentType: string;
  originalUrl: string;
}

interface Staged extends LegacyFile {
  bytes: Buffer;
  md5: string;
  filename: string;
}

function args(argv: readonly string[]): { dryRun: boolean; refetch: boolean; staging: string } {
  let dryRun = false;
  let refetch = false;
  let staging = join(tmpdir(), "emunas-legacy-staging");
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--refetch") refetch = true;
    else if (a === "--staging") {
      const v = argv[++i];
      if (!v) throw new Error("--staging needs a directory");
      staging = resolve(v);
    } else throw new Error(`unknown argument: ${a}`);
  }
  return { dryRun, refetch, staging };
}

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const p = join(ROOT, ".env");
  if (!existsSync(p)) return env;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2];
  }
  return env;
}

function sniff(bytes: Buffer): string | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

function expectedType(s: LegacySource): string {
  if (s.kind !== "image") return "application/pdf";
  if (s.slug.endsWith(".jpg")) return "image/jpeg";
  if (s.slug.endsWith(".png")) return "image/png";
  throw new Error(`unknown image extension: ${s.slug}`);
}

function checkSources(): void {
  const keys = new Set<string>();
  for (const s of SOURCES) {
    const base = s.kind === "image" ? s.slug.replace(/\.(jpg|png)$/, "") : s.slug;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(base)) throw new Error(`bad slug: ${s.slug}`);
    if ((s.kind === "essay") !== (s.group !== null)) throw new Error(`group mismatch: ${s.slug}`);
    const key = keyOf(s);
    if (keys.has(key)) throw new Error(`duplicate key: ${key}`);
    keys.add(key);
  }
}

function filenameOf(s: LegacySource): string {
  return s.kind === "image" ? s.slug : `${s.slug}.pdf`;
}

function keyOf(s: LegacySource): string {
  return `${KEY_PREFIX}${KIND_DIR[s.kind]}/${filenameOf(s)}`;
}

async function fetchBytes(url: string): Promise<Buffer> {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (compatible; emunas-migrate)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`download failed: ${url}: ${last instanceof Error ? last.message : String(last)}`);
}

async function stage(s: LegacySource, order: number, dir: string, refetch: boolean): Promise<Staged> {
  const originalUrl = `${ORIGIN}${UPLOADS}${s.file}`;
  const local = join(dir, s.kind, s.file);
  let bytes: Buffer;
  if (!refetch && existsSync(local)) {
    bytes = readFileSync(local);
  } else {
    bytes = await fetchBytes(originalUrl);
    mkdirSync(dirname(local), { recursive: true });
    writeFileSync(`${local}.part`, bytes, { mode: 0o644 });
    renameSync(`${local}.part`, local);
  }
  const contentType = expectedType(s);
  const sniffed = sniff(bytes);
  if (sniffed !== contentType) throw new Error(`${originalUrl}: expected ${contentType}, got ${sniffed ?? "unknown bytes"}`);
  const filename = filenameOf(s);
  const key = keyOf(s);
  return {
    key,
    path: `/${key.slice("site/".length)}`,
    kind: s.kind,
    title: s.title,
    group: s.group,
    order,
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    contentType,
    originalUrl,
    bytes,
    md5: createHash("md5").update(bytes).digest("hex"),
    filename,
  };
}

function client(env: Record<string, string>): { s3: S3Client; bucket: string } {
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error("Missing R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET in .env");
  }
  const s3 = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  return { s3, bucket: R2_BUCKET };
}

async function remote(s3: S3Client, bucket: string, key: string): Promise<{ etag: string; size: number; type: string; disposition: string } | null> {
  try {
    const h = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return {
      etag: (h.ETag ?? "").replaceAll('"', ""),
      size: h.ContentLength ?? -1,
      type: h.ContentType ?? "",
      disposition: h.ContentDisposition ?? "",
    };
  } catch (e) {
    if (e instanceof NotFound || (e instanceof S3ServiceException && e.$metadata.httpStatusCode === 404)) return null;
    throw e;
  }
}

function manifestRows(files: readonly Staged[]): LegacyFile[] {
  return [...files]
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.order - b.order || a.key.localeCompare(b.key))
    .map(({ key, path, kind, title, group, order, sizeBytes, sha256, contentType, originalUrl }) => ({
      key,
      path,
      kind,
      title,
      group,
      order,
      sizeBytes,
      sha256,
      contentType,
      originalUrl,
    }));
}

async function main(): Promise<void> {
  const opts = args(process.argv.slice(2));
  checkSources();
  const download = join(opts.staging, "download");
  mkdirSync(download, { recursive: true });

  const counters = new Map<LegacyKind, number>();
  const staged: Staged[] = [];
  const failures: string[] = [];
  for (const s of SOURCES) {
    const order = (counters.get(s.kind) ?? 0) + 1;
    counters.set(s.kind, order);
    try {
      staged.push(await stage(s, order, download, opts.refetch));
    } catch (e) {
      failures.push(e instanceof Error ? e.message : String(e));
    }
  }
  for (const f of failures) console.error(`FAIL ${f}`);
  if (failures.length > 0) throw new Error(`${failures.length} download(s) failed; manifest not written`);

  const rows = manifestRows(staged);
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, `${JSON.stringify(rows, null, 2)}\n`);
  const total = rows.reduce((n, r) => n + r.sizeBytes, 0);
  const byKind = (k: LegacyKind) => rows.filter((r) => r.kind === k).length;
  console.log(`staged ${rows.length} files (${byKind("essay")} essays, ${byKind("article")} articles, ${byKind("image")} images), ${total} bytes in ${download}`);
  console.log(`wrote ${MANIFEST}`);

  const env = loadEnv();
  if (opts.dryRun && !env.R2_ENDPOINT) {
    console.log("dry run: no R2 credentials, skipping the remote comparison");
    return;
  }
  const { s3, bucket } = client(env);
  let uploaded = 0;
  let skipped = 0;
  for (const f of staged) {
    const disposition = `inline; filename="${f.filename}"`;
    const have = await remote(s3, bucket, f.key);
    if (have && have.size === f.sizeBytes && have.etag === f.md5 && have.type === f.contentType && have.disposition === disposition) {
      skipped++;
      continue;
    }
    if (opts.dryRun) {
      console.log(`would upload ${f.key} (${f.sizeBytes} bytes${have ? ", replacing" : ""})`);
      uploaded++;
      continue;
    }
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: f.key,
        Body: f.bytes,
        ContentType: f.contentType,
        ContentDisposition: disposition,
        ContentLength: f.sizeBytes,
        Metadata: { sha256: f.sha256 },
      }),
    );
    console.log(`uploaded ${f.key} (${f.sizeBytes} bytes)`);
    uploaded++;
  }
  console.log(`${opts.dryRun ? "dry run: would upload" : "uploaded"} ${uploaded}, unchanged ${skipped}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
