# @emunas/config

Shared tooling for the site workspaces (`apps/*`, `packages/*`, `workers/*`). See
`docs/sites/integration-plan.md` §0 and §1.

| Export | Use |
|---|---|
| `@emunas/config/tsconfig.base.json` | `"extends"` from each workspace's `tsconfig.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `moduleResolution: bundler`, `noEmit`, `allowImportingTsExtensions`). Add `lib`/`types` per workspace. |
| `@emunas/config/vitest` | `mergeConfig(base, defineConfig({...}))` in each workspace's `vitest.config.ts`. Tests live in `src/**/*.test.ts`, `test/**/*.test.ts` or `app/**/*.test.ts`. |
| `eslint.config.js` | One flat config for the whole site tree, run from the repo root by `npm run site:lint`. |
| `stylelint.config.js` | Logical properties only (also inside `.astro` `<style>` blocks). |

## Root scripts

- `npm run site:typecheck` / `site:test` / `site:build`: run each workspace's `typecheck` / `test` / `build` script (`--workspaces --if-present`). A new package only needs those scripts.
  `site:test` runs in four groups (`site:test:api`, `:quiet`, `:live`, `:rest`; CI runs them as parallel jobs). `:rest` covers every workspace under `packages/` and Home; a new app or Worker needs adding to a group.
- `npm run site:lint`: ESLint over `apps packages workers` with this config, then Stylelint.
- `npm run corpus:build`: forwards to `@emunas/corpus`'s `corpus:build` script (W1.2).

## What the ESLint config enforces

- **Forbidden literals** (`no-restricted-syntax`): the transcripts folder path, the ASR input file name and the audit folder name, in string literals, template literals and JSX/Astro text, everywhere except `packages/corpus/src/transcript-gate.ts` and `packages/corpus-guard/**` (§0.3). `test/repo-literals.test.ts` additionally greps every file under `apps/`, `packages/`, `workers/`, `site-policy/` and `ci.yml` for the transcripts path.
- **Restricted imports** in `apps/*/src`, `apps/live/app`, `apps/*/worker` and `workers/*/src`: nothing from the pipeline's data folder and nothing from `@emunas/corpus/build` (apps read `.corpus/` and `@emunas/corpus/public`). `no-restricted-imports` bans `@emunas/corpus/build` and any specifier naming `data/{derived,catalog,transcripts}`; the local rule `emunas/no-pipeline-data-import` resolves every relative import (static, re-export, dynamic) against the importing file and bans the ones that land in the repo-root `data/` folder. Resolving, rather than matching `^(\.\./)+data`, is what lets the Live app import its own `app/data` contract module without lint exceptions.
- `typescript-eslint` recommended (syntax-only, no type-aware rules) and `eslint-plugin-astro` recommended.

## TypeScript versions (why this package pins `typescript@6.0.3` and `ts-api-utils@2.4.0`)

The repo typechecks with the root `typescript@7` (native compiler, `tsc`). TS 7 ships no classic
compiler API, and `typescript-eslint` (peer `typescript <6.1`) needs one. So:

- `typescript@6.0.3` is a dependency here and npm nests it in `packages/config/node_modules`; only
  the lint toolchain resolves it.
- `ts-api-utils@2.4.0` is a deliberate direct dependency. Without it npm hoists `ts-api-utils`
  (used by `typescript-eslint`) to the root `node_modules`, where it resolves the root TS 7 and
  crashes ESLint. Pinning a different version here forces npm to nest the copies
  `typescript-eslint` uses under `packages/config/node_modules`, where they resolve TS 6. Remove it
  once `typescript-eslint` supports TS 7.
- This package's own `typecheck` script calls the root TS 7 `tsc` by path, because the nested TS 6
  would otherwise come first on the script's `PATH`.

`apps/live` uses React Router 7, whose optional `typescript` peer range stops at 6; `npm ls`
reports the root TS 7 as an invalid optional peer. It is harmless: the RR build and `typegen`
work, and typechecking is done by TS 7.
