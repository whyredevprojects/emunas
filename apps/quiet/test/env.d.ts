// Declarations for the plain `tsc` pass over the tests. `.astro` files themselves are typechecked by
// `astro check`; here a component import only needs to be something the Container API can render.
declare module "*.astro" {
  import type { AstroComponentFactory } from "astro/runtime/server/index.js";
  const component: AstroComponentFactory;
  export default component;
}

declare module "@emunas/config/stylelint" {
  import type { Config } from "stylelint";
  const config: Config;
  export default config;
}
