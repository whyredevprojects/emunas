/**
 * Transcript view: designed, OFF (integration-plan §0.3, C17; tech-live §3.5).
 *
 * The flag lives in `app/config/feature-flags.ts` (W5.2): a build-time literal, false unless the build
 * runs with EMUNAS_TRANSCRIPT_VIEW=on. The Transcript tab (`app/features/transcript/**`) is used only
 * behind it in `tabs.tsx`, so with the default the bundler drops it entirely. `room.test.tsx` and the
 * e2e bundle grep assert that no Transcript tab reaches the page or bundle.
 */
export { TRANSCRIPT_VIEW } from "../../config/feature-flags.ts";
