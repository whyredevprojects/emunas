/**
 * corpus:build CLI: a CI deploy build must fail on the dev placeholder media origin; dev and
 * plain CI keep working with the placeholder (W3.12 item 3).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isCiDeploy, mediaOriginError } from "../src/cli.ts";
import { MINI_POLICY, PKG, miniCopy, readJson, tmp } from "./helpers.ts";

const PLACEHOLDER = "https://media.example.invalid";
const REAL = "https://media.emunas.example";

describe("isCiDeploy", () => {
  it("needs CI=true and a deploy flag or EMUNAS_DEPLOY", () => {
    expect(isCiDeploy({}, false)).toBe(false);
    expect(isCiDeploy({}, true)).toBe(false);
    expect(isCiDeploy({ EMUNAS_DEPLOY: "1" }, false)).toBe(false);
    expect(isCiDeploy({ CI: "true" }, false)).toBe(false);
    expect(isCiDeploy({ CI: "true" }, true)).toBe(true);
    expect(isCiDeploy({ CI: "true", EMUNAS_DEPLOY: "1" }, false)).toBe(true);
    expect(isCiDeploy({ CI: "1", EMUNAS_DEPLOY: "TRUE" }, false)).toBe(true);
    expect(isCiDeploy({ CI: "false", EMUNAS_DEPLOY: "1" }, true)).toBe(false);
    expect(isCiDeploy({ CI: "true", EMUNAS_DEPLOY: "0" }, false)).toBe(false);
  });
});

describe("mediaOriginError", () => {
  it("rejects the placeholder only for a CI deploy", () => {
    const deploy = { CI: "true", EMUNAS_DEPLOY: "1" };
    expect(mediaOriginError(deploy, false, PLACEHOLDER)).toMatch(/placeholder/);
    expect(mediaOriginError({ CI: "true" }, true, PLACEHOLDER)).toMatch(/EMUNAS_MEDIA_ORIGIN/);
    expect(mediaOriginError(deploy, false, REAL)).toBeNull();
    expect(mediaOriginError({ CI: "true" }, false, PLACEHOLDER)).toBeNull();
    expect(mediaOriginError({}, true, PLACEHOLDER)).toBeNull();
  });

  it("still throws on an invalid origin", () => {
    expect(() => mediaOriginError({}, false, "not a url")).toThrow();
  });
});

describe("corpus:build process", () => {
  const run = (env: Record<string, string>, extra: string[] = []) => {
    const out = join(tmp(), "out");
    const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
    // Start from a clean slate: the developer's or runner's own values must not leak in.
    for (const k of ["CI", "EMUNAS_DEPLOY", "EMUNAS_MEDIA_ORIGIN"]) if (!(k in env)) delete childEnv[k];
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", join(PKG, "src/cli.ts"), "--data-dir", miniCopy(), "--policy-dir", MINI_POLICY, "--out", out, ...extra],
      { cwd: PKG, env: childEnv, encoding: "utf8" },
    );
    return { ...r, out };
  };

  it("fails a CI deploy build on the placeholder and writes nothing", () => {
    const r = run({ CI: "true", EMUNAS_DEPLOY: "1" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/placeholder/);
    expect(existsSync(join(r.out, "build.json"))).toBe(false);
  });

  it("fails with --deploy under CI too", () => {
    const r = run({ CI: "true" }, ["--deploy"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/placeholder/);
  });

  it("builds a CI deploy with a real media origin", () => {
    const r = run({ CI: "true", EMUNAS_DEPLOY: "1", EMUNAS_MEDIA_ORIGIN: REAL });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(readJson<{ mediaOrigin: string }>(join(r.out, "build.json")).mediaOrigin).toBe(REAL);
  }, 60_000);

  it("keeps the dev default: placeholder builds outside a deploy", () => {
    const r = run({});
    expect(r.status).toBe(0);
    expect(readJson<{ mediaOrigin: string }>(join(r.out, "build.json")).mediaOrigin).toBe(PLACEHOLDER);
  }, 60_000);
});
