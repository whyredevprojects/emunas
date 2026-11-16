// Declarations for the plain `tsc` pass over the tests. `.astro` files are typechecked by `astro check`.
declare module "*.astro" {
  import type { AstroComponentFactory } from "astro/runtime/server/index.js";
  const component: AstroComponentFactory;
  export default component;
}
