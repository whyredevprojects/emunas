import type { Config } from "@react-router/dev/config";

// Live: static SPA. ssr:false + prerender (integration-plan §1.2); the full prerender
// list arrives with W4.5. The site Worker (W2.7) serves /, /audio/*, /api/*, /admin/*.
export default {
  appDirectory: "app",
  buildDirectory: "build",
  ssr: false,
  prerender: ["/"],
} satisfies Config;
