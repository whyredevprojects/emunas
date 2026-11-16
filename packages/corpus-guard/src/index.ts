/**
 * @emunas/corpus-guard: the leak guard both sites run (integration-plan §0, §5.3, C11).
 *
 *  - pre-pass:  `.corpus/` text vs. each shiur's transcripts → `.corpus/suppress.json` (ids only)
 *  - post-pass: built output → forbidden keys, substrings, transcript files, verbatim runs,
 *               aliases that are ASR variants or not display fields, remarks on the audio or
 *               the transcript → fail
 *  - Pagefind record checker and budget helpers for the app builds
 */
import { existsSync } from "node:fs";
import { readAllowedTexts, readShiurRecordings } from "./corpus.ts";
import { readVerbatimAllow } from "./policy.ts";
import { readTranscriptEligibility } from "./eligible.ts";
import { AliasRules } from "./aliases.ts";
import { LeakScanner } from "./post.ts";
import { readMetaCommentAllow } from "./meta-comment.ts";
import { VerbatimMatcher, type Thresholds } from "./verbatim.ts";

export { tokenize, normalizeForGuard } from "./tokenize.ts";
export { ShingleIndex, Vocabulary, BREAK, UNKNOWN, type Run } from "./shingles.ts";
export { TranscriptStore, segmentTexts, DEFAULT_TRANSCRIPTS_DIR } from "./transcripts.ts";
export { collectShiurItems, qualifyId, fieldOf, type ShippedItem, type ShiurUnits } from "./items.ts";
export { readCorpusUnits, readShiurRecordings, readAllowedTexts, listCorpusShiurFiles } from "./corpus.ts";
export { readVerbatimAllow, readEligibleTranscriptIds } from "./policy.ts";
export {
  readTranscriptEligibility,
  checkTranscriptFile,
  transcriptIdentityVersion,
  NO_TRANSCRIPTS,
  type TranscriptEligibility,
  type TranscriptIdentity,
  type TranscriptRejection,
} from "./eligible.ts";
export {
  VerbatimMatcher,
  mergeScans,
  REPORT_AT,
  SUPPRESS_AT,
  DEFAULT_THRESHOLDS,
  encode,
  type Thresholds,
  type ScanResult,
} from "./verbatim.ts";
export {
  AliasRules,
  ALIAS_KEYS,
  ENTITY_KINDS,
  ASR_VARIANTS_FILE,
  DEFAULT_CORPUS_DATA_DIR,
  aliasTerms,
  displayFields,
  entityKindOfFile,
  isEntityKind,
  readAsrVariants,
  type AliasRule,
  type AliasVerdict,
  type EntityKind,
} from "./aliases.ts";
export {
  CORPUS_ITEM_PREFIX,
  CORPUS_UNIT_KINDS,
  corpusItemId,
  isCorpusItemId,
  parseCorpusItemId,
  layerFileOf,
  layerFileUnits,
  readLayerUnits,
  type CorpusUnit,
  type CorpusUnitKind,
} from "./layer.ts";
export { corpusUnitField, prePassUnits, runPrePass, type PreResult, type PreSuppressEntry, type PreReportEntry, type PreCounts } from "./pre.ts";
export {
  LeakScanner,
  transcriptFileId,
  type Finding,
  type PostResult,
  type PostCounts,
  type VerbatimReportEntry,
  type ScannerOptions,
  type ValueContext,
} from "./post.ts";
export {
  META_COMMENT_TERMS,
  META_COMMENT_ALLOW_FILE,
  findMetaComments,
  readMetaCommentAllow,
  compileMetaCommentAllow,
  isMetaCommentAllowed,
  type CompiledAllow,
  type MetaCommentHit,
  type MetaCommentAllow,
} from "./meta-comment.ts";
export { FORBIDDEN_KEYS, FORBIDDEN_SUBSTRINGS, DISTINCTIVE_KEYS, findKeysInText, findSubstrings } from "./rules.ts";
export { htmlToText, htmlProse, decodeHtmlEntities, decodeJsEscapes } from "./extract.ts";
export { checkPagefindRecord, createPagefindChecker, type PagefindRecordLike } from "./pagefind.ts";
export { checkBudgets, walkFiles, formatBytes, MAX_FILES, MAX_FILE_BYTES, type BudgetResult, type BudgetFinding } from "./budgets.ts";

export interface GuardContextOptions {
  /** `.corpus/` directory: maps text to shiurim and supplies allow-listed item texts. */
  corpusDir?: string | null;
  /** Transcript folder; null/absent disables the verbatim scan. */
  transcriptsDir?: string | null;
  /**
   * Corpus data folder (`data/derived/corpus`): display fields of topics, concepts, people, works
   * and the ASR variant dump for the raw ban and the alias-key assertion. null/absent disables them;
   * a path that does not exist is an error.
   */
  corpusDataDir?: string | null;
  /** Extra alias-bearing JSON keys (see ScannerOptions.aliasKeys). */
  aliasKeys?: readonly string[];
  /** `site-policy/` directory. */
  siteDir: string;
  env?: Record<string, string | undefined>;
  thresholds?: Thresholds;
  baseDir?: string;
}

/** A post-pass scanner wired to `.corpus/`, the transcripts and `site-policy/`. */
export function createLeakScanner(opts: GuardContextOptions): LeakScanner {
  const allow = readVerbatimAllow(opts.siteDir);
  const transcripts = readTranscriptEligibility(opts.siteDir, opts.env ?? process.env, { transcriptsDir: opts.transcriptsDir ?? null });
  let matcher: VerbatimMatcher | null = null;
  if (opts.transcriptsDir) {
    if (!existsSync(opts.transcriptsDir)) throw new Error(`transcripts folder not found: ${opts.transcriptsDir}`);
    const corpusOk = opts.corpusDir != null && existsSync(opts.corpusDir);
    const matcherOpts: ConstructorParameters<typeof VerbatimMatcher>[0] = {
      transcriptsDir: opts.transcriptsDir,
      shiurRecordings: corpusOk ? readShiurRecordings(opts.corpusDir!) : new Map(),
      allowedTexts: corpusOk ? readAllowedTexts(opts.corpusDir!, allow) : [],
      cacheShiurim: 64,
      cacheRecordings: 100_000,
    };
    if (opts.thresholds) matcherOpts.thresholds = opts.thresholds;
    matcher = new VerbatimMatcher(matcherOpts);
  }
  const aliases = opts.corpusDataDir ? AliasRules.read(opts.corpusDataDir) : null;
  const metaCommentAllow = readMetaCommentAllow(opts.siteDir);
  const scannerOpts: ConstructorParameters<typeof LeakScanner>[0] = { matcher, allow, transcripts, aliases, metaCommentAllow };
  if (opts.aliasKeys !== undefined) scannerOpts.aliasKeys = opts.aliasKeys;
  if (opts.baseDir !== undefined) scannerOpts.baseDir = opts.baseDir;
  return new LeakScanner(scannerOpts);
}
