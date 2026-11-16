/**
 * Node-only: copies the subset fonts and licences from `@emunas/tokens` into `public/fonts/` and
 * writes `src/styles/fonts.css`. Run with `npm run fonts:sync -w @emunas/home` after the tokens
 * package regenerates its fonts. Never imported by pages.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fontManifest } from "@emunas/tokens";
import { homeFontsCss } from "./fonts.ts";

const app = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tokensRoot = dirname(createRequire(import.meta.url).resolve("@emunas/tokens/package.json"));
const out = join(app, "public", "fonts");

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "licenses"), { recursive: true });
for (const face of fontManifest.faces) copyFileSync(join(tokensRoot, "fonts", face.file), join(out, face.file));
for (const lic of readdirSync(join(tokensRoot, "fonts", "licenses"))) {
  copyFileSync(join(tokensRoot, "fonts", "licenses", lic), join(out, "licenses", lic));
}
const css = homeFontsCss(readFileSync(join(tokensRoot, "css", "fonts.css"), "utf8"));
writeFileSync(join(app, "src", "styles", "fonts.css"), css);
console.log(`fonts: ${fontManifest.faces.length} faces → ${out}`);
