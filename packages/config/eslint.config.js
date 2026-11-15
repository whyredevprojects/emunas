// @ts-check
/**
 * Shared ESLint flat config for the site workspaces (apps/*, packages/*, workers/*).
 * Run from the repo root: `npm run site:lint`
 * (eslint --config packages/config/eslint.config.js apps packages workers).
 *
 * Enforces integration-plan §0 in code:
 *  - forbidden literals (transcript path, ASR input file, audit folder) anywhere
 *    except packages/corpus/src/transcript-gate.ts and packages/corpus-guard/**;
 *  - forbidden literals for the corpus raw/ folder and its ASR variant dump (corpus-wave-plan
 *    §1 rule 1, §3.4) anywhere except packages/corpus-guard/** (and the corpus package's own
 *    tests and mini-fixture script, which prove the reader refuses those paths);
 *  - app and worker code may not import from the pipeline's data folder or from
 *    the Node-only `@emunas/corpus/build` entry. Relative imports are resolved against the
 *    importing file (`emunas/no-pipeline-data-import`), so an app's own `data/` module
 *    (apps/live/app/data) is not mistaken for the repo-root one.
 *
 * The patterns below are written so that this file does not itself contain the
 * literals it bans (the regexes cannot match their own source text).
 */
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import astro from "eslint-plugin-astro";
import globals from "globals";
import tseslint from "typescript-eslint";

const LEAK_MESSAGE =
  "Transcript paths, ASR input files and audit outputs may only be referenced in packages/corpus/src/transcript-gate.ts and packages/corpus-guard (integration-plan §0.3).";

/** Regex sources for esquery selectors. `\W` / `\.` / `\b` keep them from matching this file. */
const FORBIDDEN_LITERAL_REGEXES = ["data\\Wtranscripts", "input\\.txt", "\\baudits\\b"];

const RAW_MESSAGE =
  "The corpus data's raw folder (alias maps, ASR variants) may only be referenced in packages/corpus-guard (corpus-wave-plan §1 rule 1, §3.4).";

/** The corpus raw/ folder and its ASR variant dump. `\W` keeps them from matching this file. */
const RAW_LITERAL_REGEXES = ["corpus\\Wraw\\b", "asr\\Wvariants"];

/**
 * @param {readonly string[]} regexes
 * @param {string} message
 */
const literalSelectors = (regexes, message) =>
  regexes.flatMap((re) => [
    { selector: `Literal[value=/${re}/]`, message },
    { selector: `TemplateElement[value.raw=/${re}/]`, message },
    { selector: `JSXText[value=/${re}/]`, message },
  ]);

/** @type {import("eslint").Linter.RuleEntry} */
export const forbiddenLiteralRule = ["error", ...literalSelectors(FORBIDDEN_LITERAL_REGEXES, LEAK_MESSAGE)];

/** @type {import("eslint").Linter.RuleEntry} */
export const corpusRawLiteralRule = ["error", ...literalSelectors(RAW_LITERAL_REGEXES, RAW_MESSAGE)];

/** Both literal lists (one `no-restricted-syntax` entry per file: a later entry would replace an earlier one). */
/** @type {import("eslint").Linter.RuleEntry} */
export const allForbiddenLiteralsRule = [
  "error",
  ...literalSelectors(FORBIDDEN_LITERAL_REGEXES, LEAK_MESSAGE),
  ...literalSelectors(RAW_LITERAL_REGEXES, RAW_MESSAGE),
];

const DATA_MESSAGE = "Site code reads .corpus/ only, never the pipeline's data folder (integration-plan §1.4 C3).";

/** The repo root (this file lives in packages/config/). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * True when a relative import specifier, resolved against the importing file, lands in the
 * repo-root data folder. A pattern on the specifier alone (`^(\.\./)+data`) cannot tell the
 * pipeline's folder from an app's own `data/` module (apps/live/app/data), so the climb is resolved.
 *
 * @param {string} filename absolute path of the importing file
 * @param {string} specifier the import source
 * @param {string} [root] repo root
 */
export function importsPipelineData(filename, specifier, root = REPO_ROOT) {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return false;
  if (!isAbsolute(filename)) return false;
  const target = relative(root, resolve(dirname(filename), specifier.split(/[?#]/)[0] ?? ""));
  return target === "data" || target.startsWith(`data${sep}`);
}

/**
 * `emunas/no-pipeline-data-import`: relative imports, re-exports and dynamic imports that resolve
 * into the repo-root data folder.
 * @type {import("eslint").Rule.RuleModule}
 */
const noPipelineDataImport = {
  meta: {
    type: "problem",
    docs: { description: "Disallow relative imports that resolve into the pipeline's data folder." },
    schema: [],
    messages: { pipelineData: DATA_MESSAGE },
  },
  create(context) {
    /** @param {import("estree").Node | null | undefined} source */
    const check = (source) => {
      if (!source || source.type !== "Literal" || typeof source.value !== "string") return;
      if (importsPipelineData(context.filename, source.value)) context.report({ node: source, messageId: "pipelineData" });
    };
    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
    };
  },
};

/** Local rules of the site config (plugin prefix `emunas/`). */
export const emunasPlugin = { meta: { name: "emunas" }, rules: { "no-pipeline-data-import": noPipelineDataImport } };

/** @type {import("eslint").Linter.RuleEntry} */
export const restrictedImportsRule = [
  "error",
  {
    patterns: [
      {
        // any path that names the pipeline's data subfolders
        regex: "(^|/)data/(derived|catalog|transcripts)(/|$)",
        message: DATA_MESSAGE,
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

/**
 * Files allowed to name the corpus raw/ folder or its ASR variant dump. Only the guard reads it;
 * the corpus package's tests and mini-fixture script name it to prove the reader refuses it.
 */
export const CORPUS_RAW_ALLOWED_FILES = [
  "packages/corpus-guard/**",
  "packages/corpus/test/**",
  "packages/corpus/scripts/make-mini-corpus.ts",
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
  // One `no-restricted-syntax` entry per file, so the two literal lists are combined per exemption set.
  {
    files: ALL_SOURCE,
    ignores: [...TRANSCRIPT_ALLOWED_FILES, ...CORPUS_RAW_ALLOWED_FILES],
    rules: { "no-restricted-syntax": allForbiddenLiteralsRule },
  },
  {
    files: CORPUS_RAW_ALLOWED_FILES.map((f) => (f.endsWith("/**") ? `${f}/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx,astro}` : f)),
    ignores: TRANSCRIPT_ALLOWED_FILES,
    rules: { "no-restricted-syntax": forbiddenLiteralRule },
  },
  {
    files: TRANSCRIPT_ALLOWED_FILES.map((f) => (f.endsWith("/**") ? `${f}/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx,astro}` : f)),
    ignores: CORPUS_RAW_ALLOWED_FILES,
    rules: { "no-restricted-syntax": corpusRawLiteralRule },
  },
  {
    files: [
      "apps/*/src/**/*.{js,mjs,ts,tsx,jsx,astro}",
      "apps/live/app/**/*.{js,mjs,ts,tsx,jsx}",
      "apps/*/worker/**/*.ts",
      "workers/*/src/**/*.ts",
    ],
    plugins: { emunas: emunasPlugin },
    rules: { "no-restricted-imports": restrictedImportsRule, "emunas/no-pipeline-data-import": "error" },
  },
);
