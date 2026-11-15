import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const configDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(configDir, "../..");

// Built from parts so this file does not contain the literals it tests for.
export const TRANSCRIPTS_PATH = ["data", "transcripts"].join("/");
export const INPUT_TXT = ["input", "txt"].join(".");
export const AUDITS = ["aud", "its"].join("");
// The corpus raw/ folder and its ASR variant dump (corpus-wave-plan §3.4), built from parts.
export const CORPUS_RAW = ["corpus", "raw"].join("/");
export const ASR_VARIANTS = ["asr", "variants"].join("-");
