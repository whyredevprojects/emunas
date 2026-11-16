import { defineConfig } from "astro/config";

// Quiet: fully static site. Audio is served from the media host (integration-plan Amendment A1).
export default defineConfig({
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
    // CSP `style-src 'self'` / `script-src 'self'` (tech-quiet §8): never inline CSS or scripts. The one
    // exception is the theme init script (components/ThemeHead.astro), allowed by its hash in public/_headers.
    inlineStylesheets: "never",
  },
  vite: {
    build: {
      // Astro inlines small <script> chunks below this limit; 0 keeps every script an external file.
      assetsInlineLimit: 0,
    },
  },
  compressHTML: true,
  devToolbar: { enabled: false },
});
