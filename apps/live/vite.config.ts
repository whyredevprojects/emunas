import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { transcriptViewDefine } from "./app/config/feature-flags.ts";

export default defineConfig({
  plugins: [reactRouter()],
  // TRANSCRIPT_VIEW (app/config/feature-flags.ts): a literal false unless EMUNAS_TRANSCRIPT_VIEW=on.
  define: transcriptViewDefine(process.env),
});
