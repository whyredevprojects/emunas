/**
 * Transcript view (W5.2): designed, OFF. Import only behind `TRANSCRIPT_VIEW`
 * (app/config/feature-flags.ts) so the default bundle drops this feature entirely.
 * The build-side emitter is `emit.server.ts` (Node only; used by data-build, never by the client).
 */
export { TranscriptTab } from "./TranscriptTab.tsx";
export { useTranscripts, loadTranscripts, configureTranscriptFetch, type TranscriptsState } from "./use-transcripts.ts";
export { TRANSCRIPT_TAB, parseTranscriptFile, transcriptPath, type TranscriptFile } from "./contract.ts";
export { transcriptT } from "./strings.ts";
