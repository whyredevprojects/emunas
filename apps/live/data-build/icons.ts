/**
 * PNG app icons from `public/icons/icon.svg` (W5.4). Run from apps/live after changing the SVG:
 *
 *   npx tsx data-build/icons.ts            # uses the system Chrome (PW_CHANNEL=chromium for Playwright's)
 *
 * and commit the outputs (`public/icons/*.png`). The web manifest lists them; `root.tsx` links the
 * Apple touch icon. Rendering goes through headless Chrome (`playwright-core`, already a dev
 * dependency for the e2e tests), so no image library is added.
 *
 * Outputs:
 * - `icon-192.png`, `icon-512.png` (`purpose: "any"`): the SVG as drawn, rounded corners transparent;
 * - `icon-maskable-192.png`, `icon-maskable-512.png` (`purpose: "maskable"`): full-bleed square
 *   background, the mark inside the 80% safe zone (it already sits within a radius of 40% of the
 *   size around the centre, which `icons.test.ts` checks);
 * - `apple-touch-icon.png` (180 × 180): full-bleed and opaque (iOS rounds the corners itself).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ICONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");

export type IconVariant = "any" | "full-bleed";

export interface IconSpec {
  file: string;
  size: number;
  variant: IconVariant;
}

export const ICONS: readonly IconSpec[] = [
  { file: "icon-192.png", size: 192, variant: "any" },
  { file: "icon-512.png", size: 512, variant: "any" },
  { file: "icon-maskable-192.png", size: 192, variant: "full-bleed" },
  { file: "icon-maskable-512.png", size: 512, variant: "full-bleed" },
  { file: "apple-touch-icon.png", size: 180, variant: "full-bleed" },
];

/** The source SVG with the background made full-bleed (no corner radius) for maskable/Apple icons. */
export function iconSvg(source: string, variant: IconVariant): string {
  if (variant === "any") return source;
  const out = source.replace(/(<rect\b[^>]*?)\s+rx="[^"]*"/u, "$1");
  if (out === source) throw new Error("icon.svg: expected a background <rect> with rx");
  return out;
}

async function main(): Promise<void> {
  const { chromium } = await import("playwright-core");
  const channel = process.env["PW_CHANNEL"] ?? "chrome";
  const browser = await chromium.launch(channel === "chromium" ? {} : { channel });
  try {
    const source = readFileSync(join(ICONS_DIR, "icon.svg"), "utf8");
    for (const icon of ICONS) {
      const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size }, deviceScaleFactor: 1 });
      const svg = iconSvg(source, icon.variant);
      const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
      await page.setContent(
        `<!doctype html><html><head><style>html,body{margin:0;background:transparent}img{display:block}</style></head>` +
          `<body><img src="${src}" width="${icon.size}" height="${icon.size}" alt=""></body></html>`,
      );
      await page.waitForFunction("document.images[0]?.complete === true");
      const png = await page.screenshot({ omitBackground: icon.variant === "any", clip: { x: 0, y: 0, width: icon.size, height: icon.size } });
      writeFileSync(join(ICONS_DIR, icon.file), png);
      await page.close();
      console.log(`icons: ${icon.file} ${icon.size}×${icon.size} (${png.length} bytes)`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
}
