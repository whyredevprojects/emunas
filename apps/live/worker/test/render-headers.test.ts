import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_LINE, MAX_RULES, parseHeaders, parseMediaOrigin, renderHeaders } from "../render-headers.ts";

const TEMPLATE = `# comment
/*
  Content-Security-Policy: default-src 'self'; media-src 'self' {{EMUNAS_MEDIA_ORIGIN}}; connect-src 'self' {{EMUNAS_MEDIA_ORIGIN}}
  X-Content-Type-Options: nosniff

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;

describe("parseMediaOrigin", () => {
  it.each([
    ["https://media.example.org", "https://media.example.org"],
    ["https://media.example.org/", "https://media.example.org"],
    ["  https://MEDIA.example.org:8443  ", "https://media.example.org:8443"],
    ["http://localhost:8788", "http://localhost:8788"],
    ["http://127.0.0.1:9000/", "http://127.0.0.1:9000"],
  ])("accepts %j", (input, expected) => {
    expect(parseMediaOrigin(input)).toBe(expected);
  });

  it.each([
    "media.example.org",
    "http://media.example.org",
    "https://media.example.org/audio",
    "https://media.example.org/?x=1",
    "https://media.example.org/#x",
    "https://user:pw@media.example.org",
    "https://media.example.org; script-src *",
    "https://media.example.org 'unsafe-inline'",
    "ftp://media.example.org",
    "javascript:alert(1)",
  ])("rejects %j", (input) => {
    expect(() => parseMediaOrigin(input)).toThrow(/EMUNAS_MEDIA_ORIGIN/);
  });
});

describe("renderHeaders", () => {
  it("fills every placeholder", () => {
    const out = renderHeaders(TEMPLATE, { mediaOrigin: "https://media.example.org" });
    expect(out).toContain("media-src 'self' https://media.example.org;");
    expect(out).toContain("connect-src 'self' https://media.example.org\n");
    expect(out).not.toContain("{{");
  });

  it("fails without a media origin unless allowed", () => {
    expect(() => renderHeaders(TEMPLATE, { mediaOrigin: undefined })).toThrow(/not set/);
    expect(() => renderHeaders(TEMPLATE, { mediaOrigin: "  " })).toThrow(/not set/);
    const out = renderHeaders(TEMPLATE, { mediaOrigin: "", allowMissing: true });
    expect(out).toContain("media-src 'self';");
    expect(out).toContain("connect-src 'self'\n");
  });

  it("fails on an unknown placeholder", () => {
    expect(() => renderHeaders(`${TEMPLATE}\n/x\n  X-Y: {{OTHER}}\n`, { mediaOrigin: "https://m.example.org" })).toThrow(
      /\{\{OTHER\}\}/,
    );
  });

  it("is idempotent on an already rendered file", () => {
    const once = renderHeaders(TEMPLATE, { mediaOrigin: "https://media.example.org" });
    expect(renderHeaders(once, { mediaOrigin: "https://media.example.org" })).toBe(once);
  });
});

describe("parseHeaders", () => {
  it("parses rules and headers", () => {
    const rules = parseHeaders(TEMPLATE);
    expect(rules.map((r) => r.pattern)).toEqual(["/*", "/assets/*"]);
    expect(rules[1]?.headers).toEqual([["Cache-Control", "public, max-age=31536000, immutable"]]);
  });

  it("accepts header removal (! Name) and absolute https patterns", () => {
    const rules = parseHeaders("https://:a.:b.workers.dev/*\n  ! Foo\n  X-Robots-Tag: noindex\n");
    expect(rules[0]?.headers.map(([n]) => n)).toEqual(["!Foo", "X-Robots-Tag"]);
  });

  it.each([
    ["header before pattern", "  X-A: b\n"],
    ["bad header line", "/*\n  not a header\n"],
    ["bad pattern", "http://x.example/*\n  X-A: b\n"],
    ["rule without headers", "/*\n\n/x\n  X-A: b\n"],
    ["line too long", `/*\n  X-A: ${"a".repeat(MAX_LINE)}\n`],
    ["too many rules", Array.from({ length: MAX_RULES + 1 }, (_, i) => `/p${i}\n  X-A: b\n`).join("")],
  ])("rejects %s", (_name, text) => {
    expect(() => parseHeaders(text)).toThrow(/_headers/);
  });
});

describe("CLI", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const script = fileURLToPath(new URL("../render-headers.ts", import.meta.url));
  const tsx = fileURLToPath(new URL("../../../../node_modules/tsx/dist/cli.mjs", import.meta.url));

  function run(file: string, env: Record<string, string>, ...args: string[]) {
    try {
      const stdout = execFileSync(process.execPath, [tsx, script, file, ...args], {
        env: { PATH: process.env["PATH"] ?? "", ...env },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { code: 0, stdout };
    } catch (e) {
      const err = e as { status: number; stderr: string };
      return { code: err.status, stdout: err.stderr };
    }
  }

  it("rewrites the file in place, and refuses without EMUNAS_MEDIA_ORIGIN", () => {
    const dir = mkdtempSync(join(tmpdir(), "render-headers-"));
    dirs.push(dir);
    const file = join(dir, "_headers");
    writeFileSync(file, TEMPLATE);

    const missing = run(file, {});
    expect(missing.code).toBe(1);
    expect(readFileSync(file, "utf8")).toBe(TEMPLATE);

    const ok = run(file, { EMUNAS_MEDIA_ORIGIN: "https://media.example.org" });
    expect(ok.code).toBe(0);
    expect(readFileSync(file, "utf8")).toContain("media-src 'self' https://media.example.org;");
  });

  it("allows a missing origin with --allow-missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "render-headers-"));
    dirs.push(dir);
    const file = join(dir, "_headers");
    writeFileSync(file, TEMPLATE);
    expect(run(file, {}, "--allow-missing").code).toBe(0);
    expect(readFileSync(file, "utf8")).toContain("media-src 'self';");
  });
});

describe("Quiet copy", () => {
  it("apps/quiet/worker/render-headers.ts has the same code as this one (only the header comment differs)", () => {
    const body = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8").replace(/^\/\*\*[\s\S]*?\*\/\n/, "");
    expect(body("../../../quiet/worker/render-headers.ts")).toBe(body("../render-headers.ts"));
  });
});
