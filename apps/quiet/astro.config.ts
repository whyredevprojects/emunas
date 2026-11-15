import { defineConfig } from "astro/config";

// Quiet: fully static site. The Worker in worker/index.ts (W2.7) serves only /audio/*.
export default defineConfig({
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
  },
  compressHTML: true,
  devToolbar: { enabled: false },
});
