/**
 * W5.2: TRANSCRIPT_VIEW is a build-time literal and the transcript feature is used only behind it,
 * so the bundler drops it from the client when the flag is off (the default) and keeps it when the
 * build runs with EMUNAS_TRANSCRIPT_VIEW=on. Bundles the listening room's tabs module with Vite (the
 * same `define` as vite.config.ts; packages external, so only app code is in the output).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Rolldown } from "vite";
import { describe, expect, it } from "vitest";
import { transcriptViewDefine } from "../../config/feature-flags.ts";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..", "..", "..");
const entry = join(here, "..", "listening-room", "tabs.tsx");

/** The minified entry chunk (the tabs module and everything it pulls in statically). */
async function bundle(env: Record<string, string | undefined>): Promise<string> {
  const out = await build({
    configFile: false,
    logLevel: "silent",
    mode: "production",
    root: appDir,
    define: transcriptViewDefine(env),
    build: {
      write: false,
      minify: true,
      rollupOptions: {
        input: entry,
        preserveEntrySignatures: "strict",
        external: (id) => !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0"),
      },
    },
  });
  const outputs = (Array.isArray(out) ? out : [out]) as Rolldown.RolldownOutput[];
  const chunks = outputs.flatMap((o) => o.output).filter((c): c is Rolldown.OutputChunk => c.type === "chunk" && c.isEntry);
  expect(chunks).toHaveLength(1);
  return chunks[0]!.code;
}

describe("transcript feature in the client bundle", () => {
  it("is absent with the default flag", async () => {
    const code = await bundle({});
    expect(code).toContain("tab.related"); // the tabs module itself is there
    expect(code).not.toMatch(/transcri/i);
    for (const marker of ["tx.tab", "tx.heading", "/data/transcript/"]) expect(code).not.toContain(marker);
  }, 120_000);

  it("is compiled in with EMUNAS_TRANSCRIPT_VIEW=on", async () => {
    const code = await bundle({ EMUNAS_TRANSCRIPT_VIEW: "on" });
    for (const marker of ["tx.tab", "tx.heading", "data-transcript-tab", "/data/transcript/"]) expect(code).toContain(marker);
  }, 120_000);
});
