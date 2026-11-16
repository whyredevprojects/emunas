import { defineConfig } from "astro/config";
import { checkFilesIntegration } from "./src/lib/check-files.ts";

// Home: the landing site on the apex, fully static. `/files/*` (essay and article PDFs, images) is
// served by worker/index.ts from R2; the build fails if a page links a /files/ path that is not
// in src/data/legacy-files.json (src/lib/check-files.ts).
export default defineConfig({
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
    // CSP `style-src 'self'` / `script-src 'self'` (public/_headers): never inline CSS or scripts.
    inlineStylesheets: "never",
  },
  vite: {
    build: {
      // Astro inlines small <script> chunks below this limit; 0 keeps every script an external file.
      assetsInlineLimit: 0,
    },
  },
  integrations: [checkFilesIntegration()],
  compressHTML: true,
  devToolbar: { enabled: false },
});
