// @ts-check
/**
 * Shared ESLint flat config for the site workspaces (apps/*, packages/*, workers/*).
 * Run from the repo root: `npm run site:lint`
 * (eslint --config packages/config/eslint.config.js apps packages workers).
 *
 * Enforces integration-plan §0 in code:
 *  - forbidden literals (transcript path, ASR input file, audit folder) anywhere
 *    except packages/corpus/src/transcript-gate.ts and packages/corpus-guard/**;
 *  - app and worker code may not import from the pipeline's data folder or from
 *    the Node-only `@emunas/corpus/build` entry.
 *
 * The patterns below are written so that this file does not itself contain the
 * literals it bans (the regexes cannot match their own source text).
 */
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import astro from "eslint-plugin-astro";
import globals from "globals";
import tseslint from "typescript-eslint";

const LEAK_MESSAGE =
  "Transcript paths, ASR input files and audit outputs may only be referenced in packages/corpus/src/transcript-gate.ts and packages/corpus-guard (integration-plan §0.3).";

/** Regex sources for esquery selectors. `\W` / `\.` / `\b` keep them from matching this file. */
const FORBIDDEN_LITERAL_REGEXES = ["data\\Wtranscripts", "input\\.txt", "\\baudits\\b"];

/** @type {import("eslint").Linter.RuleEntry} */
export const forbiddenLiteralRule = [
  "error",
  ...FORBIDDEN_LITERAL_REGEXES.flatMap((re) => [
    { selector: `Literal[value=/${re}/]`, message: LEAK_MESSAGE },
    { selector: `TemplateElement[value.raw=/${re}/]`, message: LEAK_MESSAGE },
    { selector: `JSXText[value=/${re}/]`, message: LEAK_MESSAGE },
  ]),
];

/** @type {import("eslint").Linter.RuleEntry} */
export const restrictedImportsRule = [
  "error",
  {
    patterns: [
      {
        // ../../data/..., ../../../data (relative climbs into the repo-root data folder)
        regex: "^(\\.\\./)+data(/|$)",
        message: "Site code reads .corpus/ only, never the pipeline's data folder (integration-plan §1.4 C3).",
      },
      {
        // any path that names the pipeline's data subfolders
        regex: "(^|/)data/(derived|catalog|transcripts)(/|$)",
        message: "Site code reads .corpus/ only, never the pipeline's data folder (integration-plan §1.4 C3).",
      },
      {
        regex: "^@emunas/corpus/build(/|$)",
        message: "@emunas/corpus/build is Node-only build tooling; app code uses @emunas/corpus/public.",
      },
    ],
  },
];

/** Files allowed to reference transcript material (integration-plan §0.3). */
export const TRANSCRIPT_ALLOWED_FILES = [
  "packages/corpus/src/transcript-gate.ts",
  "packages/corpus-guard/**",
];

const ALL_SOURCE = ["**/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx,astro}"];

export default defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.astro/**",
      "**/.react-router/**",
      "**/.wrangler/**",
      "**/.corpus/**",
      "**/coverage/**",
      // pipeline territory: not linted by the site config
      "data/**",
      "scripts/**",
      "src/**",
      "config/**",
      "prompts/**",
      "out/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.es2021 },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  ...astro.configs["flat/recommended"],
  {
    // .astro frontmatter is TypeScript (interface Props, `import type`): parse it with the TS parser.
    files: ["**/*.astro"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, extraFileExtensions: [".astro"] },
    },
  },
  {
    files: [
      "**/*.config.{js,mjs,ts}",
      "packages/**/*.{js,ts}",
      "**/test/**/*.{js,ts,tsx}",
      "**/scripts/**/*.{js,ts}",
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["apps/live/app/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ["workers/**/*.ts", "apps/*/worker/**/*.ts"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ALL_SOURCE,
    ignores: TRANSCRIPT_ALLOWED_FILES,
    rules: { "no-restricted-syntax": forbiddenLiteralRule },
  },
  {
    files: [
      "apps/*/src/**/*.{js,mjs,ts,tsx,jsx,astro}",
      "apps/live/app/**/*.{js,mjs,ts,tsx,jsx}",
      "apps/*/worker/**/*.ts",
      "workers/*/src/**/*.ts",
    ],
    rules: { "no-restricted-imports": restrictedImportsRule },
  },
);
