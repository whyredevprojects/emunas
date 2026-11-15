/**
 * Writes css/tokens.css and css/fonts.css from src/tokens.ts, src/fonts.ts and
 * fonts/manifest.json. Run with `npm run css -w @emunas/tokens`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fontsCss, tokensCss } from "../src/css.ts";

const cssDir = join(dirname(fileURLToPath(import.meta.url)), "..", "css");
mkdirSync(cssDir, { recursive: true });
writeFileSync(join(cssDir, "tokens.css"), tokensCss());
writeFileSync(join(cssDir, "fonts.css"), fontsCss());
console.log(`wrote ${join(cssDir, "tokens.css")} and ${join(cssDir, "fonts.css")}`);
